/**
 * rollout-agent
 *
 * A release agent: the Vercel AI SDK, an OpenAI model, and two surfaces that are different
 * on purpose.
 *
 *   read    the StackQL MCP server in read_only mode: any SELECT against the live estate,
 *           no writes. This program never starts the server in another mode, and it
 *           withholds the server's write tools from the model as well.
 *   write   stackql-deploy, behind a gate. The model can ask for two things (converge a
 *           cell, promote a cell); each is a fixed command against the reviewed stack.
 *           Nothing it writes is SQL of its own. Looking is what the read surface is for.
 *
 * Whether a write happens is never the model's decision:
 *
 *   policy   src/policy.ts, checked before anything runs
 *   verify   the gate re-checks the waves in front of a promotion itself, against the live
 *            API, with `stackql-deploy test`
 *   human    the approval at this terminal, bound to the exact command
 *
 *   npm run agent                               the rollout review, once
 *   npm run tools                               the two surfaces, no model
 *   npm run gate -- promote fra 1.5.0           a request sent through the gate; no model
 *   npm run replay [-- file]                    replay a recorded transcript; no model, no network
 */
import type { ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, isStepCount, jsonSchema, tool, type Tool, type ToolExecutionOptions, type ToolSet } from 'ai';

import { bold, box, cyan, dim, green, magenta, markdown, red, rule, strip, table, width, wrap, yellow, type Paint } from './console.js';
import { commandLine, stackqlDeploy, type DeployResult } from './deploy.js';
import { check, type Action, type GateState, type Verification } from './policy.js';
import { readCells, readRollout, setRelease, type Cell } from './cells.js';

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
  stackql: env('STACKQL_BIN', 'stackql'), // the MCP server: `stackql mcp`
  deploy: env('STACKQL_DEPLOY', 'stackql-deploy'),
  approot: env('STACKQL_APPROOT', path.join(demoRoot, '.stackql')), // the store stackql-deploy pulls the stack's providers into
  auditDir: env('STACKQL_AUDIT_DIR', path.join(agentRoot, 'audit')),
  logLevel: env('STACKQL_LOG_LEVEL', 'fatal'),
  recordingsDir: path.join(demoRoot, 'recordings'),
  maxSteps: Number(env('AGENT_MAX_STEPS', '14')),
  freshnessMs: Number(env('GATE_FRESHNESS_SECONDS', '600')) * 1000,
};

/** the platform's decision, in code: the model-facing server is read_only, and stays that way */
const SERVER_MODE = 'read_only';
/** the server tools the model is given; the server's write tools are withheld as well as refused */
const READ_TOOLS = ['run_select_query', 'validate_select_query', 'list_services', 'list_resources', 'list_methods', 'describe_method'];
const GATE_TOOLS = ['cell_converge', 'cell_promote'];

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
/** the frames: the terminal's width, at most 120 columns */
const W = width();
const fit = (s: string, paint: Paint = (x) => x) => wrap(s, W - 4).map(paint);
const rel = (f: string) => path.relative(demoRoot, f).replace(/\\/g, '/');

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

/** the audit sink: the server writes one JSONL record per tool call; the gate adds its decisions */
const auditFile = path.join(cfg.auditDir, `stackql_mcp_server_${runStamp}.jsonl`);
function audit(record: Record<string, unknown>): void {
  mkdirSync(cfg.auditDir, { recursive: true });
  appendFileSync(auditFile, `${JSON.stringify({ timestamp: localIso(), mode: 'gate', ...record })}\n`);
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

/** credentials for the provider stay in the child processes; the model's key stays out of them */
function childEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string' && e[0] !== 'OPENAI_API_KEY'),
  );
}

// ---------------------------------------------------------------------------------------
// the declaration: the cells and the rollout, read from the files stackql-deploy asserts
// ---------------------------------------------------------------------------------------

const cellsDir = path.join(demoRoot, 'cells');
const rollout = readRollout(path.join(demoRoot, 'rollout.env'));
const cells = (): Cell[] => readCells(cellsDir); // re-read on every use: a promotion changes it

const regionList = (cs: Cell[]) => cs.map((c) => `'${c.region}'`).join(', ');

/** one statement for the whole rollout: every cell's release pointer joined to its table */
const boardSql = (cs: Cell[], service: string) =>
  [
    'SELECT r.region, r.value AS running, r.version AS changes, t.table_status, t.deletion_protection_enabled AS deletion_protection',
    'FROM aws.ssm.parameters_by_paths r',
    'INNER JOIN aws.dynamodb.tables t ON r.region = t.region',
    `WHERE r.region IN (${regionList(cs)}) AND r.Path = '/${service}'`,
    `  AND t.region IN (${regionList(cs)}) AND t.TableName = '${service}'`,
    'ORDER BY r.region',
  ].join('\n');

/** what changed on a cell's table, from CloudTrail */
const trailSql = (service: string) =>
  [
    'SELECT e.at_utc, e.event_name, e.username, e.table_name, e.deletion_protection',
    'FROM (',
    "  SELECT datetime(event_time, 'unixepoch') AS at_utc, event_name, username,",
    "         json_extract(cloud_trail_event, '$.requestParameters.tableName') AS table_name,",
    "         json_extract(cloud_trail_event, '$.requestParameters.deletionProtectionEnabled') AS deletion_protection",
    '  FROM aws.cloudtrail.events',
    "  WHERE region = '<the cell's region>'",
    `    AND LookupAttributes = '[{"AttributeKey": "EventName", "AttributeValue": "UpdateTable"}]'`,
    ') e',
    `WHERE e.table_name = '${service}'`,
    'ORDER BY e.at_utc DESC',
    'LIMIT 3',
  ].join('\n');

const declaredRows = (cs: Cell[]) => cs.map((c) => [c.name, c.region, String(c.wave), c.release]);
const declaredMarkdown = (cs: Cell[], built: Set<string>) =>
  [
    '| cell | region | wave | declared release | built |',
    '| --- | --- | --- | --- | --- |',
    ...cs.map((c, i) => `| ${declaredRows(cs)[i].join(' | ')} | ${built.has(c.region) ? 'yes' : 'not built yet'} |`),
  ].join('\n');
const declaredTable = (cs: Cell[], built: Set<string>) =>
  table(
    ['cell', 'region', 'wave', 'declared', 'built'],
    cs.map((c, i) => {
      const r = declaredRows(cs)[i];
      return [...r.slice(0, 3), r[3] === rollout.candidate ? green(r[3]) : r[3], built.has(c.region) ? 'yes' : yellow('not yet')];
    }),
  );

/**
 * Which declared cells exist: the regions that hold the release pointer. One SELECT, and one
 * that tolerates an empty region, because the server fails a whole statement when a region
 * in its IN list has no table. If the check itself fails, every declared cell is assumed built.
 */
async function builtRegions(serverTools: ToolSet, cs: Cell[]): Promise<Set<string>> {
  const all = new Set(cs.map((c) => c.region));
  const select = serverTools['run_select_query'] as Tool | undefined;
  if (!select?.execute) return all;
  try {
    const sql = `SELECT region FROM aws.ssm.parameters_by_paths WHERE region IN (${regionList(cs)}) AND Path = '/${rollout.service}'`;
    const output = await select.execute({ sql, format: 'json' }, { toolCallId: 'preflight', messages: [], context: undefined });
    const parsed = JSON.parse(resultText(output)) as { rows?: { region?: string }[] } | { region?: string }[];
    const rows = Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
    const found = new Set(rows.map((r) => String(r.region ?? '')).filter((r) => all.has(r)));
    return found.size > 0 ? found : all;
  } catch {
    return all;
  }
}

// ---------------------------------------------------------------------------------------
// the human in the loop: an approval at this terminal, bound to the exact command
// ---------------------------------------------------------------------------------------

async function approve(lines: string[]): Promise<boolean> {
  log();
  for (const l of box(lines, { title: 'APPROVAL REQUIRED', edge: yellow, width: W })) log(l);
  if (!process.stdin.isTTY) {
    log(red('no operator attached (not a TTY): declined')); // a scheduled run has nobody to ask
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const a = (await rl.question(bold('approve? [y/N] '))).trim().toLowerCase();
    const yes = a === 'y' || a === 'yes';
    if (transcriptFile) appendFileSync(transcriptFile, `${bold('approve? [y/N] ')}${a}\n`);
    return yes;
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------------------
// the read surface: the StackQL MCP server, started here in read_only mode
// ---------------------------------------------------------------------------------------

/** the server's start-up chatter on stderr; everything else passes through */
const SERVER_NOISE = /^(sink file: |\[stackql mcp\] \S+ (starting|stopping|shutting|exiting))/;

function relayStderr(transport: StdioMCPTransport): void {
  const child = (transport as unknown as { process?: ChildProcess }).process; // set by start(), which createMCPClient awaits
  const stream = child?.stderr;
  if (!stream) return;
  let rest = '';
  stream.on('data', (chunk: Buffer) => {
    const lines = (rest + chunk.toString()).split(/\r?\n/);
    rest = lines.pop() ?? '';
    for (const l of lines) if (l && !SERVER_NOISE.test(l)) process.stderr.write(`${l}\n`);
  });
}

async function startPlatform(): Promise<MCPClient> {
  mkdirSync(cfg.auditDir, { recursive: true });
  if (!existsSync(cfg.approot)) throw new Error(`no provider store at ${cfg.approot}; build a cell first (scripts/build.sh syd) or set STACKQL_APPROOT`);
  const serverConfig = { server: { mode: SERVER_MODE, audit: { disabled: false, format: 'jsonl', file: { path: auditFile } } } };
  const transport = new StdioMCPTransport({
    command: cfg.stackql,
    args: ['mcp', '--mcp.server.type=stdio', '--approot', cfg.approot, '--mcp.config', JSON.stringify(serverConfig), '--loglevel', cfg.logLevel],
    env: childEnv(), // the AWS credentials live in the server process, never in the model's context
    cwd: cfg.auditDir,
    stderr: 'pipe',
  });
  const client = await createMCPClient({
    name: 'rollout-agent',
    protocolVersionDiscovery: false,
    transport,
    onUncaughtError: (error) => console.error('mcp:', error),
  });
  relayStderr(transport);
  return client;
}

// ---------------------------------------------------------------------------------------
// the screen: one frame per tool call, numbered in the order the model made them
// ---------------------------------------------------------------------------------------

let calls = 0;
const toolCounts = new Map<string, number>();
const nextCall = (name: string) => {
  toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
  return String(++calls).padStart(2, '0');
};

/** rows as a table when they fit the frame, as label: value lines when they do not; columns in the order the statement names them */
function rowsOf(text: string, sql = ''): string[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) return undefined;
  if (rows.length === 0) return [dim('-> 0 rows')];
  const records = rows.filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object').slice(0, 12);
  if (records.length === 0) return [dim(`-> ${oneLine(text, 200)}`)];
  const cellText = (v: unknown) => oneLine(v === null || v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v), 44);
  const off = (v: string) => v === 'false' || v === '0';
  const paintCell = (key: string, v: string) => (key === 'deletion_protection' && v !== '' ? (off(v) ? red(bold(v)) : green(v)) : v);
  const at = (name: string) => {
    const i = sql.search(new RegExp(`\\b${name}\\b`));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const headers = Object.keys(records[0]).sort((a, b) => at(a) - at(b));
  const body = records.map((r) => headers.map((hd) => paintCell(hd, cellText(r[hd]))));
  const t = table(headers, body);
  const more = rows.length > records.length ? [dim(`   ... ${rows.length - records.length} more`)] : [];
  if (strip(t[0]).length <= W - 2) return [...t.map((l) => `  ${l}`), ...more];
  const label = Math.max(...headers.map((x) => x.length));
  return [...body.flatMap((r, n) => [...(n ? [''] : []), ...r.map((c, i) => `  ${bold(headers[i].padEnd(label))}  ${c}`)]), ...more];
}

/** a server tool with its call drawn on the screen: the statement, the time it took, the rows */
function shown(name: string, t: Tool): Tool {
  const execute = t.execute;
  if (!execute) return t;
  return {
    ...t,
    execute: async (input: unknown, options: ToolExecutionOptions<unknown>) => {
      const n = nextCall(name);
      const args = (input ?? {}) as Record<string, unknown>;
      const started = Date.now();
      // rows come back as JSON whatever the model asked for, so the screen can draw them
      const output = await execute(name === 'run_select_query' ? { ...args, format: 'json' } : input, options);
      const text = resultText(output);
      const failed = (output as { isError?: boolean })?.isError === true || /^(error|could not|cannot)\b/i.test(text.trim());
      const statement = typeof args.sql === 'string' ? args.sql.split('\n').flatMap((l) => fit(l.trimEnd())) : fit(JSON.stringify(args));
      for (const l of box(statement, { title: `${n}  ${name}`, note: elapsed(started), edge: failed ? red : cyan, width: W })) log(l);
      for (const l of failed ? fit(oneLine(text, 400), red) : (rowsOf(text, typeof args.sql === 'string' ? args.sql : '') ?? fit(`-> ${oneLine(text, 300)}`, dim))) log(l);
      log();
      return output;
    },
  };
}

// ---------------------------------------------------------------------------------------
// the write surface: stackql-deploy behind the gate
// ---------------------------------------------------------------------------------------

const verified: Verification[] = [];
let promotedWave: number | undefined;
const decisions: string[] = []; // what the gate decided, for the summary

const gateState = (): GateState => ({ cells: cells(), rollout, verified, promotedWave, now: Date.now(), freshnessMs: cfg.freshnessMs });
const describeCell = (c: Cell) => `${bold(c.name)} ${dim(`(${c.region}, wave ${c.wave})`)}`;
const deployCommand = (action: 'test' | 'build', c: Cell) => `stackql-deploy ${commandLine(action, c).join(' ')}`;

/** run stackql-deploy for a cell, streaming what it decides, and remember the result as a check the gate made */
async function runDeploy(action: 'test' | 'build', cell: Cell, edge: Paint): Promise<DeployResult> {
  log(`  ${edge('\u2502')} ${dim(`$ ${deployCommand(action, cell)}`)}`);
  const result = await stackqlDeploy(action, cell, {
    cwd: demoRoot,
    bin: cfg.deploy,
    env: childEnv(),
    onLine: (line) => {
      const paint = /is not in the desired state|test failed/.test(line) ? yellow : /^(creating|updating) \[/.test(line) ? magenta : dim;
      log(`  ${edge('\u2502')} ${paint(line)}`);
    },
  });
  verified.push({ cell: cell.name, release: cell.release, passed: result.ok, at: Date.now() });
  return result;
}

const outcomeLine = (action: 'test' | 'build', r: DeployResult): string => {
  if (!r.ok) return `${action} failed: ${r.failed.length ? `not in the desired state: ${r.failed.join(', ')}` : `stackql-deploy exited ${r.exitCode}`}`;
  if (action === 'test') return 'matches its declaration';
  return r.changed.length ? `converged: ${r.changed.join(', ')} changed` : 'already matched its declaration; nothing changed';
};

type GateInput = { cell?: string; release?: string; reason?: string };

/** one request through the gate: policy, the gate's own verification, the human, then stackql-deploy */
async function gate(action: Action, input: GateInput): Promise<string> {
  const toolName = `cell_${action}`;
  const n = nextCall(toolName);
  const started = Date.now();
  const request = { action, cell: String(input.cell ?? ''), release: input.release };
  const write = action !== 'test';
  const edge = write ? magenta : cyan;
  const asked = action === 'promote' ? `${request.cell} -> ${request.release ?? ''}` : request.cell;
  const head = [`${bold(action)} ${asked}`, ...(input.reason ? fit(`reason: ${oneLine(input.reason, 400)}`, dim) : [])];
  for (const l of box(head, { title: `${n}  ${toolName}`, edge, width: W })) log(l);

  const done = (decision: string, text: string, paint: Paint, extra: Record<string, unknown> = {}) => {
    decisions.push(`${toolName}(${asked}): ${decision}`);
    audit({ tool: toolName, decision, duration_ms: Date.now() - started, args: request, ...extra });
    for (const l of fit(`${decision.replace(/_/g, ' ').toUpperCase()}: ${text}`, paint)) log(`  ${l}`);
    log(dim(`  ${elapsed(started)}`));
    log();
    return `${toolName} ${decision.replace(/_/g, ' ')}: ${text}`;
  };

  // 1. policy, in code
  const verdict = check(request, gateState());
  if (!verdict.ok) return done('declined_by_policy', `${verdict.rule}: ${verdict.reason}`, red, { rule: verdict.rule });
  const cell = verdict.cell;
  log(`  ${green('policy')} ${describeCell(cell)}  ${dim(`declared ${cell.release}, candidate ${rollout.candidate}`)}`);

  // 2. the gate's own verification of the waves in front of a promotion
  for (const earlier of verdict.verify) {
    log(`  ${cyan('verify')} ${describeCell(earlier)} ${dim('must match its declaration before anything goes past it')}`);
    const r = await runDeploy('test', earlier, cyan);
    if (!r.ok) {
      return done('declined_by_policy', `verification: ${earlier.name} (wave ${earlier.wave}) is not what its declaration says (${r.failed.join(', ') || 'test failed'}); converge it first`, red, {
        rule: 'verification',
      });
    }
    log(`  ${green('verify')} ${earlier.name} ${dim('matches its declaration')}`);
  }

  // 3. a read-only check needs no approval
  if (action === 'test') {
    const r = await runDeploy('test', cell, cyan);
    return done(r.ok ? 'passed' : 'failed', `${cell.name}: ${outcomeLine('test', r)}`, r.ok ? green : yellow, { command: r.command });
  }

  // 4. the human, bound to the exact command
  const command = deployCommand('build', cell);
  const change = action === 'promote' ? [`${bold('declaration')}  ${rel(cell.file)}: CELL_RELEASE=${cell.release} -> ${green(`CELL_RELEASE=${rollout.candidate}`)}`] : [];
  const ok = await approve([`${bold(action)} ${describeCell(cell)}`, ...change, `${bold('command')}      ${command}`]);
  if (!ok) return done('declined_by_operator', `policy passed, the operator said no; ${command} was not run`, red, { command });

  // 5. the declaration changes (a promotion only), then stackql-deploy asserts it
  const before = action === 'promote' ? setRelease(cell, rollout.candidate) : undefined;
  const target = cells().find((c) => c.name === cell.name) ?? cell;
  const r = await runDeploy('build', target, magenta);
  if (!r.ok && before !== undefined) writeFileSync(cell.file, before); // a failed promotion leaves the declaration as it was
  if (r.ok && action === 'promote') promotedWave = cell.wave;
  const what = action === 'promote' ? `${cell.name} is declared and serving ${target.release}` : `${cell.name}: ${outcomeLine('build', r)}`;
  return done(r.ok ? 'applied' : 'failed', r.ok ? what : `${cell.name}: ${outcomeLine('build', r)}`, r.ok ? green : red, { command: r.command, changed: r.changed });
}

const cellProperty = { type: 'string', description: 'the cell name, as declared in cells/*.env' } as const;
const reasonProperty = { type: 'string', description: 'one or two sentences of evidence for the operator who will approve this' } as const;

const gateTools: ToolSet = {
  cell_converge: tool({
    description: 'Assert one cell\'s declaration as it stands with `stackql-deploy build`: puts back whatever drifted, changes nothing that already matches. Goes through the policy gate and an operator approval.',
    inputSchema: jsonSchema<GateInput>({ type: 'object', properties: { cell: cellProperty, reason: reasonProperty }, required: ['cell', 'reason'], additionalProperties: false }),
    execute: (input) => gate('converge', input),
  }),
  cell_promote: tool({
    description: 'Move one cell to the rollout\'s candidate release: change its declared release, then `stackql-deploy build`. The gate checks wave order and verifies the waves in front of it itself; then an operator approves.',
    inputSchema: jsonSchema<GateInput>({
      type: 'object',
      properties: { cell: cellProperty, release: { type: 'string', description: 'the release to promote to' }, reason: reasonProperty },
      required: ['cell', 'release', 'reason'],
      additionalProperties: false,
    }),
    execute: (input) => gate('promote', input),
  }),
};

// ---------------------------------------------------------------------------------------
// subcommands that need no model: the surfaces, and a request sent through the gate
// ---------------------------------------------------------------------------------------

async function listTools(client: MCPClient): Promise<void> {
  const tools = await client.tools();
  const head = [
    `${bold('server')}  ${client.serverInfo.name} ${client.serverInfo.version ?? ''}`,
    `${bold('mode')}    ${green(SERVER_MODE)}`,
    `${bold('tools')}   ${Object.keys(tools).length} on the server, ${READ_TOOLS.filter((t) => t in tools).length} given to the model, plus ${GATE_TOOLS.length} of the platform's own`,
  ];
  for (const l of box(head, { title: 'tool surface', width: W })) log(l);
  log(bold('  read: StackQL MCP server'));
  for (const name of Object.keys(tools).sort()) log(READ_TOOLS.includes(name) ? `    ${cyan(name)}` : `    ${dim(`${name}  (withheld)`)}`);
  log(bold('  write: stackql-deploy, behind the gate'));
  for (const name of GATE_TOOLS) log(`    ${magenta(name)}`);
}

async function gateOnly(argv: string[]): Promise<void> {
  const [action, cell, release] = argv;
  if (!['test', 'converge', 'promote'].includes(action ?? '') || !cell) {
    throw new Error('usage: npm run gate -- <test|converge|promote> <cell> [release]');
  }
  const head = [`${bold('request')}  ${action} ${cell}${release ? ` ${release}` : ''}`, dim('sent through the gate as the agent would send it; no model involved')];
  for (const l of box(head, { title: 'gate', width: W })) log(l);
  log();
  await gate(action as Action, { cell, release, reason: 'requested at the terminal' });
}

// ---------------------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------------------

async function run(client: MCPClient): Promise<void> {
  const started = Date.now();
  mkdirSync(cfg.auditDir, { recursive: true });
  transcriptFile = path.join(cfg.auditDir, `agent_${runStamp}.txt`);

  const declared = cells();
  const serverTools = await client.tools();
  const built = await builtRegions(serverTools, declared);
  const vars = {
    service: rollout.service,
    candidate: rollout.candidate,
    previous: rollout.previous,
    declared_table: declaredMarkdown(declared, built),
    board_sql: boardSql(
      declared.filter((c) => built.has(c.region)),
      rollout.service,
    ),
    trail_sql: trailSql(rollout.service),
  };
  const system = [render(readPrompt('system.md'), vars), client.instructions ? `# Server instructions\n\n${client.instructions}` : ''].filter(Boolean).join('\n\n');
  const prompt = render(readPrompt('intent.md'), vars);

  const tools: ToolSet = { ...gateTools };
  for (const name of READ_TOOLS) if (serverTools[name]) tools[name] = shown(name, serverTools[name] as Tool);

  const head = [
    `${bold('model')} ${cfg.model}   ${bold('read')} StackQL MCP, ${green(SERVER_MODE)}   ${bold('write')} stackql-deploy, ${yellow('gated')}`,
    `${bold('rollout')} ${rollout.service} ${rollout.previous} -> ${green(rollout.candidate)}`,
    dim(`audit ${rel(auditFile)}`),
  ];
  for (const l of box(head, { title: 'rollout-agent', width: W })) log(l);
  log();
  log(`${bold('declared')}  ${dim('cells/*.env + stack/stackql_manifest.yml, no state file')}`);
  for (const l of declaredTable(declared, built)) log(l);
  log();

  const result = await generateText({
    model: createOpenAI().responses(cfg.model), // OPENAI_API_KEY from the environment
    system,
    prompt,
    tools,
    stopWhen: isStepCount(cfg.maxSteps),
    maxOutputTokens: 6000,
    providerOptions: { openai: { parallelToolCalls: false, store: false } },
  });

  log(rule('report', W));
  if (result.text.trim() === '') log(yellow(`the run reached its limit of ${cfg.maxSteps} steps before the model wrote a report; the frames above and npm run audit are the record`));
  for (const l of markdown(result.text.trim(), W)) log(l);
  log();
  const usage = result.totalUsage;
  const counts = [...toolCounts.entries()].map(([name, c]) => `${name}=${c}`).join(' ');
  const summary = [
    `${bold('model')} ${cfg.model}   ${bold('finish')} ${result.finishReason}   ${bold('elapsed')} ${elapsed(started)}   ${bold('steps')} ${result.steps.length}`,
    `${bold('tool calls')} ${counts || 'none'}`,
    ...(decisions.length ? decisions.map((d, i) => `${i === 0 ? bold('gate') : '    '} ${d}`) : [`${bold('gate')} nothing was asked of it`]),
    `${bold('tokens')} in=${usage.inputTokens ?? '?'} out=${usage.outputTokens ?? '?'} total=${usage.totalTokens ?? '?'}`,
    `${bold('audit')} ${rel(auditFile)}   ${bold('transcript')} ${rel(transcriptFile)}`,
  ];
  const finished = result.finishReason === 'stop';
  for (const l of box(summary, { title: finished ? 'run complete' : `run ended: ${result.finishReason}`, edge: finished ? green : yellow, width: W })) log(l);
}

// ---------------------------------------------------------------------------------------
// the fallback: replay a recorded transcript, clearly labelled, with the pacing of a run
// ---------------------------------------------------------------------------------------

async function replay(file?: string): Promise<void> {
  const target = file ?? newest(cfg.recordingsDir, 'agent_', '.txt') ?? newest(cfg.auditDir, 'agent_', '.txt');
  if (!target || !existsSync(target)) throw new Error(`no transcript to replay (looked in ${cfg.recordingsDir} and ${cfg.auditDir})`);
  const recorded = statSync(target).mtime.toISOString().slice(0, 16).replace('T', ' ');
  const banner = [`${rel(target)}   ${dim(`recorded ${recorded} UTC`)}`, bold('not a live run')];
  for (const l of box(banner, { title: 'REPLAY', edge: yellow, width: W })) console.log(l);
  console.log();
  for (const line of readFileSync(target, 'utf8').split('\n')) {
    const text = strip(line);
    if (/^\u250c\u2500 \d\d  /.test(text)) await sleep(1200); // a tool call: a frame's top edge
    else if (/^\s+\u2502 /.test(text)) await sleep(350); // stackql-deploy deciding
    else if (/^approve\? /.test(text)) await sleep(1500);
    console.log(line);
    await sleep(40);
  }
  console.log();
  console.log(dim(`(end of replay: ${rel(target)})`));
}

// ---------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--replay')) {
    const i = argv.indexOf('--replay');
    return replay(argv[i + 1] && !argv[i + 1].startsWith('--') ? path.resolve(argv[i + 1]) : undefined);
  }
  if (argv.includes('--gate')) return gateOnly(argv.slice(argv.indexOf('--gate') + 1));
  let client: MCPClient | undefined;
  try {
    client = await startPlatform();
    if (argv.includes('--list-tools')) await listTools(client);
    else await run(client);
  } finally {
    await client?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
