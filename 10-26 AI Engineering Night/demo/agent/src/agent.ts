/**
 * edge-agent
 *
 * A scheduled platform agent: the Vercel AI SDK, an OpenAI model, and the StackQL MCP
 * server as its only tool surface. It is given an intent in prose (prompts/intent.md)
 * and the declared state of the estate (read from the stackql-deploy manifest, the same
 * file that asserts it), reads the live state through SQL, and decides whether to write.
 *
 * Whether a write happens is never the model's decision. Three gates, all owned by the
 * platform and set here in code:
 *
 *   policy   src/policy.ts, checked before the statement leaves this process
 *   mode     the server's: read_only refuses every write, safe asks a human
 *   human    the approval at this terminal, bound to the exact statement
 *
 * This program never starts a full_access server.
 *
 *   npm run agent                     the scheduled review, once
 *   npm run tools                     the tool surface and the mode, no model
 *   npm run probe [-- file.sql]       a statement sent through the gates; no model
 *   npm run replay [-- file]          replay a recorded transcript; no model, no network
 */
import type { ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createMCPClient, ElicitationRequestSchema, type ElicitResult, type MCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, isStepCount, type Tool, type ToolExecutionOptions, type ToolSet } from 'ai';

import { bold, box, cyan, dim, green, magenta, markdown, red, rule, strip, table, wrap, yellow } from './console.js';
import { assertion, readManifest, type Declaration } from './declaration.js';
import { check, type Declared } from './policy.js';

// ---------------------------------------------------------------------------------------
// configuration: .env at the demo root, then the process environment, then defaults
// ---------------------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const agentRoot = path.resolve(here, '..');
const demoRoot = path.resolve(agentRoot, '..');

for (const envFile of [path.join(demoRoot, '.env'), path.join(agentRoot, '.env')]) {
  if (existsSync(envFile)) process.loadEnvFile(envFile); // does not override what is already set
}

const env = (name: string, fallback: string): string => {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
};

const cfg = {
  model: env('OPENAI_MODEL', 'gpt-6.1-sol'),
  mode: env('STACKQL_MCP_MODE', 'read_only'),
  approot: env('STACKQL_APPROOT', ''), // empty: stackql's own default (~/.stackql), no --approot passed
  bin: env('STACKQL_MCP_BIN', 'stackql'), // the server binary: `stackql` on the PATH unless .env names one
  auditDir: env('STACKQL_AUDIT_DIR', path.resolve('audit')), // audit/ under the cwd: agent/audit with npm run
  recordingsDir: path.join(demoRoot, 'recordings'),
  maxSteps: Number(env('AGENT_MAX_STEPS', '12')),
  zoneId: env('CLOUDFLARE_ZONE_ID', ''),
  zoneName: env('CLOUDFLARE_ZONE_NAME', ''),
  declarationRepo: env('DECLARATION_REPO', 'stackql-labs/agentic-platform-engineering'),
  declarationPath: env('DECLARATION_PATH', '10-26 AI Engineering Night/demo/stack/stackql_manifest.yml'),
};

// the platform's decision, enforced in code: a model-facing server is read_only or safe
const ALLOWED_MODES = new Set(['read_only', 'safe']);
if (!ALLOWED_MODES.has(cfg.mode)) {
  console.error(`STACKQL_MCP_MODE=${cfg.mode} is not allowed for a model-facing server (read_only | safe)`);
  process.exit(2);
}
if (!cfg.zoneId) {
  console.error('CLOUDFLARE_ZONE_ID is not set (see .env.example)');
  process.exit(2);
}

const WRITE_TOOLS = new Set(['run_mutation_query', 'run_lifecycle_operation', 'pull_provider', 'reload_credentials']);

// ---------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------

let transcriptFile: string | undefined;
const log = (line = '') => {
  console.log(line);
  if (transcriptFile) appendFileSync(transcriptFile, `${line}\n`);
};
const elapsed = (from: number) => `${((Date.now() - from) / 1000).toFixed(1)}s`;
/** local time with its offset, the way the server stamps its audit records */
const localIso = (d = new Date()) => {
  const p = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}${off < 0 ? '-' : '+'}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
};
const oneLine = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)} ...` : flat;
};
const runStamp = new Date().toISOString().replace(/[:.]/g, '-');
const paintMode = (m: string) => (m === 'safe' ? yellow(m) : green(m));

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`prompt placeholder {{ ${key} }} has no value`);
    return vars[key];
  });
}
const readPrompt = (name: string) => readFileSync(path.join(agentRoot, 'prompts', name), 'utf8');

function newest(dir: string, prefix: string, suffix: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .map((f) => ({ file: path.join(dir, f), mtime: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)[0]?.file;
}

/** the audit sink: the server writes one JSONL record per tool call; the gate adds its declines */
const auditFile = path.join(cfg.auditDir, `stackql_mcp_server_${runStamp}.jsonl`);
const latestAuditLog = () => (existsSync(auditFile) ? auditFile : newest(cfg.auditDir, 'stackql_mcp_server_', '.jsonl'));
const proposalFile = () => path.join(cfg.auditDir, 'last-proposal.sql');

function audit(record: Record<string, unknown>): void {
  mkdirSync(cfg.auditDir, { recursive: true });
  appendFileSync(auditFile, `${JSON.stringify({ timestamp: localIso(), mode: cfg.mode, ...record })}\n`);
}

function resultText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object') {
    const content = (output as { content?: unknown }).content;
    if (Array.isArray(content)) {
      return content.map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : '')).join('\n');
    }
  }
  return JSON.stringify(output);
}

// ---------------------------------------------------------------------------------------
// the declaration: what should be, read from the same manifest stackql-deploy asserts
// ---------------------------------------------------------------------------------------

/** the declared rule and the one write the policy permits (src/declaration.ts), for this zone */
function declaration(): Declaration {
  const manifest = readManifest(path.join(demoRoot, 'stack', 'stackql_manifest.yml'));
  return { ...manifest, zoneId: cfg.zoneId, sql: assertion(cfg.zoneId, manifest.phase, manifest) };
}

/** the declared rule for the prompt: markdown, which the model reads well */
function declaredMarkdown(d: Declaration): string {
  return [
    '| zone | phase | threshold (requests per period, per IP) | period (s) | enabled | description |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${cfg.zoneName || cfg.zoneId} | ${d.phase} | ${d.threshold} | ${d.period} | true | ${d.description} |`,
  ].join('\n');
}

/** the declared rule for the console */
const declaredTable = (d: Declaration) =>
  table(['phase', 'threshold', 'period', 'enabled', 'description'], [[d.phase, String(d.threshold), String(d.period), 'true', d.description]]);

// ---------------------------------------------------------------------------------------
// the human in the loop: MCP elicitation, raised by the server in safe mode before a write
// ---------------------------------------------------------------------------------------

type JsonSchema = { properties?: Record<string, { type?: string; enum?: unknown[]; description?: string; title?: string }> };

async function elicit(message: string, requestedSchema: unknown): Promise<ElicitResult> {
  log();
  const body = ['the server is in safe mode and a write is waiting', '', ...message.split('\n').flatMap((l) => (l.length <= 88 ? [l] : wrap(l, 88)))];
  for (const l of box(body, 'APPROVAL REQUIRED', yellow)) log(`  ${l}`);

  if (!process.stdin.isTTY) {
    log(red('  no operator attached (not a TTY): declined')); // a scheduled run has nobody to ask
    return { action: 'decline' };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const props = ((requestedSchema ?? {}) as JsonSchema).properties ?? {};
    const content: Record<string, unknown> = {};
    if (Object.keys(props).length === 0) {
      const a = (await rl.question(bold('  approve? [y/N] '))).trim().toLowerCase();
      return a === 'y' || a === 'yes' ? { action: 'accept', content: {} } : { action: 'decline' };
    }
    for (const [key, def] of Object.entries(props)) {
      const label = def.description ?? def.title ?? key;
      if (def.type === 'boolean') {
        const a = (await rl.question(bold(`  ${label} [y/N] `))).trim().toLowerCase();
        content[key] = a === 'y' || a === 'yes';
      } else if (Array.isArray(def.enum)) {
        const a = (await rl.question(`  ${label} (${def.enum.join(' | ')}) `)).trim();
        if (!def.enum.map(String).includes(a)) return { action: 'decline' };
        content[key] = a;
      } else {
        const a = (await rl.question(`  ${label}: `)).trim();
        if (a === '') return { action: 'decline' };
        content[key] = def.type === 'number' || def.type === 'integer' ? Number(a) : a;
      }
    }
    return Object.values(content).some((v) => v === false) ? { action: 'decline' } : { action: 'accept', content };
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------------------
// the platform: the StackQL MCP server, started here with the mode the platform chose
// ---------------------------------------------------------------------------------------

/** the server's start-up chatter on stderr (launcher version notice, sink path, start line); everything else passes through */
const SERVER_NOISE = /^(stackql-mcp: WARNING Node\.js|sink file: |\[stackql mcp\] \S+ (starting|stopping|shutting|exiting))/;

function relayStderr(transport: StdioMCPTransport): void {
  const child = (transport as unknown as { process?: ChildProcess }).process; // set by start(), which createMCPClient awaits
  const stream = child?.stderr;
  if (!stream) return;
  let rest = '';
  const relay = (text: string) => {
    for (const l of text.split(/\r?\n/)) if (l && !SERVER_NOISE.test(l)) process.stderr.write(`${l}\n`);
  };
  stream.on('data', (chunk: Buffer) => {
    const lines = (rest + chunk.toString()).split(/\r?\n/);
    rest = lines.pop() ?? '';
    relay(lines.join('\n'));
  });
  stream.on('end', () => relay(rest));
}

async function startPlatform(): Promise<MCPClient> {
  mkdirSync(cfg.auditDir, { recursive: true });
  const launcher = path.join(agentRoot, 'node_modules', '@stackql', 'mcp-server', 'bin', 'stackql-mcp.js');
  if (!existsSync(launcher)) throw new Error(`StackQL MCP launcher not found at ${launcher}; run npm install`);

  const serverConfig = { server: { mode: cfg.mode, audit: { disabled: false, file: { path: auditFile } } } };
  const processEnv = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'));
  processEnv.STACKQL_MCP_BIN = cfg.bin; // the launcher runs this binary instead of downloading one
  const approot = cfg.approot ? ['--approot', cfg.approot] : []; // else the launcher's default, ~/.stackql

  const transport = new StdioMCPTransport({
    command: process.execPath,
    args: [launcher, ...approot, '--mcp.config', JSON.stringify(serverConfig), '--mcp.log.format=jsonl'],
    env: processEnv, // the Cloudflare token lives in the server process, never in the model
    cwd: cfg.auditDir,
    stderr: 'pipe', // relayed below, minus the start-up chatter
  });
  const client = await createMCPClient({
    name: 'edge-agent',
    capabilities: { elicitation: {} }, // or a safe-mode server refuses writes outright instead of asking
    protocolVersionDiscovery: false, // negotiate 2025-11-25, where a gated write is an elicitation request
    transport,
    onUncaughtError: (error) => console.error('mcp:', error),
  });
  relayStderr(transport);

  client.onElicitationRequest(ElicitationRequestSchema, (request) => elicit(request.params.message, request.params.requestedSchema));
  return client;
}

// ---------------------------------------------------------------------------------------
// the gate: policy in code, in front of the server, whatever mode the server is in
// ---------------------------------------------------------------------------------------

function gated(tools: ToolSet, declared: Declared, record = true): ToolSet {
  const mutate = tools['run_mutation_query'] as Tool | undefined;
  const execute = mutate?.execute;
  if (!mutate || !execute) return tools;
  const guarded: Tool = {
    ...mutate,
    execute: async (input: unknown, options: ToolExecutionOptions<unknown>) => {
      const sql = typeof (input as { sql?: unknown })?.sql === 'string' ? (input as { sql: string }).sql : '';
      if (record) writeFileSync(proposalFile(), sql); // the agent's proposal: what `npm run probe` replays
      const verdict = check(sql, declared);
      if (!verdict.ok) {
        audit({ tool: 'run_mutation_query', decision: 'declined_by_policy', duration_ms: 0, rule: verdict.rule, reason: verdict.reason, sql });
        return { content: [{ type: 'text', text: `tool "run_mutation_query" declined by policy (${verdict.rule}): ${verdict.reason}` }] };
      }
      return execute(input, options);
    },
  };
  return { ...tools, run_mutation_query: guarded };
}

// ---------------------------------------------------------------------------------------
// subcommands that need no model: the surface, and a statement sent through the gates
// ---------------------------------------------------------------------------------------

async function listTools(client: MCPClient): Promise<void> {
  const tools = await client.tools();
  log(`${bold('server')}   ${client.serverInfo.name} ${client.serverInfo.version ?? ''}`);
  log(`${bold('mode')}     ${paintMode(cfg.mode)}`);
  log(`${bold('zone')}     ${cfg.zoneName} ${dim(`(${cfg.zoneId})`)}`);
  log(`${bold('tools')}    ${Object.keys(tools).length}`);
  for (const name of Object.keys(tools).sort()) log(WRITE_TOOLS.has(name) ? `  ${magenta('[write]')} ${magenta(name)}` : `          ${name}`);
}

async function probeWrite(client: MCPClient, file?: string): Promise<void> {
  // a file if given, else the statement the agent proposed on its last run, else the
  // declared assertion itself (so even an approved probe changes nothing but drift)
  const declared = declaration();
  const source = file ?? (existsSync(proposalFile()) ? proposalFile() : undefined);
  const sql = source ? readFileSync(source, 'utf8').replace(/\{\{\s*zone_id\s*\}\}/g, cfg.zoneId).replace(/^\s*--.*$/gm, '').trim() : declared.sql;
  log(`${bold('mode')}    ${paintMode(cfg.mode)}`);
  log(`${bold('source')}  ${source ? path.relative(demoRoot, source) : 'the declared assertion'}`);
  log(`${bold('write')}   ${oneLine(sql, 400)}`);
  log();
  const tools = gated(await client.tools(), declared, false); // a probe is not a proposal
  const result = await (tools['run_mutation_query'] as Tool).execute!({ sql }, { toolCallId: 'probe', messages: [], context: undefined });
  const text = resultText(result);
  const paint = /declined|refused|denied|error/i.test(text) ? red : green;
  for (const l of markdown(text)) log(paint(l));
}

// ---------------------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------------------

async function run(client: MCPClient): Promise<void> {
  const started = Date.now();
  mkdirSync(cfg.auditDir, { recursive: true });
  transcriptFile = path.join(cfg.auditDir, `agent_${runStamp}.txt`);

  const declared = declaration();
  const [owner, repo] = cfg.declarationRepo.split('/');
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const vars = {
    zone_id: cfg.zoneId,
    zone_name: cfg.zoneName || cfg.zoneId,
    owner: owner ?? '',
    repo: repo ?? '',
    declaration_path: cfg.declarationPath,
    since: iso(started - 60 * 60 * 1000), // the traffic window: the hour before this run
    until: iso(started),
    declared_table: declaredMarkdown(declared),
    declared_assertion: declared.sql,
  };
  const system = [render(readPrompt('system.md'), vars), client.instructions ? `# Server instructions\n\n${client.instructions}` : '']
    .filter(Boolean)
    .join('\n\n');
  const prompt = render(readPrompt('intent.md'), vars);
  const tools = gated(await client.tools(), declared);

  const head = [
    `${bold('model')} ${cfg.model}   ${bold('mode')} ${paintMode(cfg.mode)}   ${bold('tools')} ${Object.keys(tools).length}   ${bold('zone')} ${vars.zone_name}`,
    dim(`audit ${path.relative(demoRoot, auditFile)}`),
  ];
  for (const l of box(head, 'edge-agent')) log(l);
  log();
  log(`${bold('declared')}  ${dim('stack/stackql_manifest.yml')}`);
  for (const l of declaredTable(declared)) log(`  ${l}`);
  log('permitted write: one REPLACE that asserts the declared rule (policy.ts); the server mode decides if it runs');
  log();

  const toolCounts = new Map<string, number>();
  let stepStarted = Date.now();

  const result = await generateText({
    model: createOpenAI().responses(cfg.model), // OPENAI_API_KEY from the environment
    system,
    prompt,
    tools,
    stopWhen: isStepCount(cfg.maxSteps),
    maxOutputTokens: 6000,
    providerOptions: { openai: { parallelToolCalls: false, store: false } },
    onStepEnd({ stepNumber, toolCalls, toolResults }) {
      const outputs = new Map(toolResults.map((r) => [r.toolCallId, r.output]));
      for (const call of toolCalls) {
        toolCounts.set(call.toolName, (toolCounts.get(call.toolName) ?? 0) + 1);
        const input = (call.input ?? {}) as Record<string, unknown>;
        const shown = typeof input.sql === 'string' ? input.sql : JSON.stringify(input);
        const write = WRITE_TOOLS.has(call.toolName);
        log(`${dim('[')}${bold(String(stepNumber + 1).padStart(2, '0'))} ${dim(elapsed(stepStarted).padStart(6))}${dim(']')} ${write ? magenta(call.toolName) : cyan(call.toolName)}`);
        log(`      ${oneLine(shown, 320)}`);
        const text = resultText(outputs.get(call.toolCallId));
        const blocked = write && /refused|declined/i.test(text);
        log(`      ${dim('->')} ${blocked ? `${red(bold('BLOCKED'))}${red(`: ${oneLine(text, 200)}`)}` : dim(oneLine(text, 200))}`);
      }
      stepStarted = Date.now();
    },
  });

  log();
  log(rule('report'));
  for (const l of markdown(result.text.trim())) log(l);
  log();
  const usage = result.totalUsage;
  const calls = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}=${c}`).join(' ');
  const writes = [...toolCounts.entries()].filter(([n]) => WRITE_TOOLS.has(n)).reduce((s, [, c]) => s + c, 0);
  const rel = (f: string | undefined) => (f ? path.relative(demoRoot, f) : cfg.auditDir);
  const summary = [
    `${bold('model')} ${cfg.model}   ${bold('mode')} ${paintMode(cfg.mode)}   ${bold('finish')} ${result.finishReason}   ${bold('elapsed')} ${elapsed(started)}`,
    `${bold('steps')} ${result.steps.length}   ${bold('tool calls')} ${calls || 'none'}`,
    `${bold('writes attempted')} ${writes}   ${dim('(the gates decided what happened to them)')}`,
    `${bold('tokens')} in=${usage.inputTokens ?? '?'} out=${usage.outputTokens ?? '?'} total=${usage.totalTokens ?? '?'}`,
    `${bold('audit')} ${rel(latestAuditLog())}`,
    `${bold('transcript')} ${rel(transcriptFile)}`,
  ];
  for (const l of box(summary, 'run')) log(l);
}

// ---------------------------------------------------------------------------------------
// the fallback: replay a recorded transcript, clearly labelled, with the pacing of a run
// ---------------------------------------------------------------------------------------

async function replay(file?: string): Promise<void> {
  const target = file ?? newest(cfg.auditDir, 'agent_', '.txt') ?? newest(cfg.recordingsDir, 'agent_', '.txt');
  if (!target || !existsSync(target)) throw new Error(`no transcript to replay (looked in ${cfg.auditDir} and ${cfg.recordingsDir})`);
  const recorded = statSync(target).mtime.toISOString().slice(0, 16).replace('T', ' ');
  const banner = [`${path.relative(demoRoot, target)}   ${dim(`recorded ${recorded} UTC`)}`, bold('not a live run')];
  for (const l of box(banner, 'REPLAY', yellow)) console.log(l);
  console.log();
  for (const line of readFileSync(target, 'utf8').split('\n')) {
    if (/^\[\d\d /.test(strip(line))) await sleep(900);
    console.log(line);
    await sleep(40);
  }
  console.log();
  console.log(dim(`(end of replay: ${path.relative(demoRoot, target)})`));
}

// ---------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const fileAfter = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? path.resolve(argv[i + 1]) : undefined;
  };
  if (argv.includes('--replay')) return replay(fileAfter('--replay'));
  let client: MCPClient | undefined;
  try {
    client = await startPlatform();
    if (argv.includes('--list-tools')) await listTools(client);
    else if (argv.includes('--probe-write')) await probeWrite(client, fileAfter('--probe-write'));
    else await run(client);
  } finally {
    await client?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
