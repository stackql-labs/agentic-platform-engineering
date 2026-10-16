/**
 * platform-agent
 *
 * An always-on platform agent: the Vercel AI SDK, a Claude model, and the StackQL MCP
 * server as the only tool surface. The agent is given an intent in prose (prompts/intent.md)
 * and discovers the Kubernetes API surface itself through StackQL's discovery tools. Every
 * step it takes is a SQL statement the platform writes to an audit log.
 *
 * Agency is a property of the process, not the prompt: the server mode (read_only or safe)
 * is set here, by the platform, and the model cannot change it. This program never starts
 * a full_access server.
 *
 *   npm run agent                 run the intent once (a CronJob or cron line runs this)
 *   npm run agent -- --list-tools connect to the server and list the tool surface, no model
 *   npm run agent -- --probe-write send one harmless write with no model, to show the gate
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { createAnthropic, type AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import {
  createMCPClient,
  ElicitationRequestSchema,
  type ElicitResult,
  type MCPClient,
} from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport as StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { generateText, isStepCount } from 'ai';

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

type Effort = NonNullable<AnthropicLanguageModelOptions['effort']>;

const cfg = {
  model: env('ANTHROPIC_MODEL', 'claude-opus-5-5'),
  effort: env('ANTHROPIC_EFFORT', 'medium') as Effort,
  mode: env('STACKQL_MCP_MODE', 'read_only'),
  approot: env('STACKQL_APPROOT', path.join(homedir(), '.stackql')),
  // the server writes one JSON line per tool call to stackql_mcp_server_<timestamp>.log in its
  // working directory, so the audit directory is the working directory we start it in
  auditDir: env('STACKQL_AUDIT_DIR', path.join(demoRoot, 'runs')),
  protocolVersion: env('STACKQL_MCP_PROTOCOL_VERSION', 'auto'),
  maxSteps: Number(env('AGENT_MAX_STEPS', '24')),
  hideWriteTools: env('AGENT_HIDE_WRITE_TOOLS', 'false') === 'true',
  clusterAddr: env('KUBE_CLUSTER_ADDR', 'localhost:8001'),
  protocol: env('KUBE_PROTOCOL', 'http'),
  namespace: env('K8S_NAMESPACE', 'shop'),
  labelKey: env('DEMO_LABEL_KEY', 'purpose'),
  labelValue: env('DEMO_LABEL_VALUE', 'agentic-demo'),
};

// the platform's decision, enforced in code: a model-facing server is read_only or safe
const ALLOWED_MODES = new Set(['read_only', 'safe']);
if (!ALLOWED_MODES.has(cfg.mode)) {
  console.error(`STACKQL_MCP_MODE=${cfg.mode} is not allowed for a model-facing server (read_only | safe)`);
  process.exit(2);
}

// tools that write or change the server; hidden from the model when AGENT_HIDE_WRITE_TOOLS=true.
// By default they stay visible so the server's refusal is what you see on screen.
const WRITE_TOOLS = new Set(['run_mutation_query', 'run_lifecycle_operation', 'pull_provider', 'reload_credentials']);

// list price, USD per million tokens, for the cost line at the end of a run (not billing data)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-fable-5-1': { input: 10, output: 50 },
};

// ---------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------

const log = (line = '') => console.log(line);
const elapsed = (from: number) => `${((Date.now() - from) / 1000).toFixed(1)}s`;
const oneLine = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)} ...` : flat;
};

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`prompt placeholder {{ ${key} }} has no value`);
    return vars[key];
  });
}

function readPrompt(name: string): string {
  return readFileSync(path.join(agentRoot, 'prompts', name), 'utf8');
}

/** the audit sink the server opened for this run: the newest one in the audit directory */
function latestAuditLog(): string | undefined {
  if (!existsSync(cfg.auditDir)) return undefined;
  const logs = readdirSync(cfg.auditDir)
    .filter((f) => f.startsWith('stackql_mcp_server_') && f.endsWith('.log'))
    .map((f) => ({ file: path.join(cfg.auditDir, f), mtime: statSync(path.join(cfg.auditDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return logs[0]?.file;
}

/** the text of an MCP tool result, whatever shape the SDK hands back */
function resultText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object') {
    const content = (output as { content?: unknown }).content;
    if (Array.isArray(content)) {
      return content
        .map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : ''))
        .join('\n');
    }
  }
  return JSON.stringify(output);
}

// ---------------------------------------------------------------------------------------
// the human in the loop: MCP elicitation, raised by the server in safe mode before a write
// ---------------------------------------------------------------------------------------

type JsonSchema = {
  type?: string;
  properties?: Record<string, { type?: string; enum?: unknown[]; description?: string; title?: string }>;
  required?: string[];
};

async function elicit(message: string, requestedSchema: unknown): Promise<ElicitResult> {
  log();
  log('  +----------------------------------------------------------------------------+');
  log('  | APPROVAL REQUIRED - the server is in safe mode and a write is waiting      |');
  log('  +----------------------------------------------------------------------------+');
  for (const l of message.split('\n')) log(`  | ${l}`);
  log('  +----------------------------------------------------------------------------+');

  if (!process.stdin.isTTY) {
    // a scheduled run has nobody to ask. Declining is the only honest answer.
    log('  | no operator attached (not a TTY): declined');
    return { action: 'decline' };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const schema = (requestedSchema ?? {}) as JsonSchema;
    const props = schema.properties ?? {};
    const content: Record<string, unknown> = {};

    if (Object.keys(props).length === 0) {
      const a = (await rl.question('  approve? [y/N] ')).trim().toLowerCase();
      return a === 'y' || a === 'yes' ? { action: 'accept', content: {} } : { action: 'decline' };
    }

    for (const [key, def] of Object.entries(props)) {
      const label = def.description ?? def.title ?? key;
      if (def.type === 'boolean') {
        const a = (await rl.question(`  ${label} [y/N] `)).trim().toLowerCase();
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

    // a boolean field answered "no" is a decline, whatever the field is called
    const saidNo = Object.values(content).some((v) => v === false);
    return saidNo ? { action: 'decline' } : { action: 'accept', content };
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------------------
// the platform: the StackQL MCP server, started here with the mode the platform chose
// ---------------------------------------------------------------------------------------

async function startPlatform(): Promise<MCPClient> {
  mkdirSync(cfg.auditDir, { recursive: true });

  // the npm launcher downloads the signed stackql binary on first run (or uses STACKQL_MCP_BIN)
  const launcher = path.join(agentRoot, 'node_modules', '@stackql', 'mcp-server', 'bin', 'stackql-mcp.js');
  if (!existsSync(launcher)) throw new Error(`StackQL MCP launcher not found at ${launcher}; run npm install`);

  // the launcher disables the audit sink by default; this re-enables it, and the mode is the
  // platform's decision. Later --mcp.config flags win, so this replaces the launcher's.
  const serverConfig = { server: { mode: cfg.mode, audit: { disabled: false } } };
  const processEnv = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );

  const client = await createMCPClient({
    name: 'platform-agent',
    // advertise elicitation, or a safe-mode server refuses writes outright instead of asking
    capabilities: { elicitation: {} },
    // skip the 2026-07-28 server/discover probe: on that revision a gated write comes back as an
    // input_required result, which @ai-sdk/mcp 2.0 does not round-trip yet. A classic initialize
    // negotiates 2025-11-25, where the server asks with an elicitation/create request instead
    protocolVersionDiscovery: false,
    transport: new StdioMCPTransport({
      command: process.execPath,
      args: [
        launcher,
        '--approot',
        cfg.approot,
        '--mcp.config',
        JSON.stringify(serverConfig),
        // newest MCP revision the server will advertise. 'auto' is the server default and works
        // with protocolVersionDiscovery: false below; pin 2025-11-25 if a future client probes
        `--mcp.protocol.version=${cfg.protocolVersion}`,
      ],
      env: processEnv, // provider credentials live in the server process, never in the model
      cwd: cfg.auditDir, // where the server writes its audit sink file
      stderr: 'inherit', // the server announces the sink file and its mode here
    }),
    onUncaughtError: (error) => console.error('mcp:', error),
  });

  // safe mode: the server asks before a write; the answer comes from a human at this terminal
  client.onElicitationRequest(ElicitationRequestSchema, (request) =>
    elicit(request.params.message, request.params.requestedSchema),
  );

  return client;
}

// ---------------------------------------------------------------------------------------
// subcommands that need no model: show the platform's surface and its gate
// ---------------------------------------------------------------------------------------

async function listTools(client: MCPClient): Promise<void> {
  const tools = await client.tools();
  log(`server:  ${client.serverInfo.name} ${client.serverInfo.version ?? ''}`);
  log(`mode:    ${cfg.mode}`);
  log(`audit:   ${latestAuditLog() ?? cfg.auditDir}`);
  log(`tools:   ${Object.keys(tools).length}`);
  for (const name of Object.keys(tools).sort()) {
    log(`  ${WRITE_TOOLS.has(name) ? '[write] ' : '        '}${name}`);
  }
}

async function probeWrite(client: MCPClient): Promise<void> {
  // asserts the value the stack already declares, so even an approved run changes nothing
  const sql = `UPDATE k8s.apps.deployments SET spec = '{"replicas": 1}' WHERE name = 'checkout' AND namespace = '${cfg.namespace}' AND cluster_addr = '${cfg.clusterAddr}' AND protocol = '${cfg.protocol}'`;
  log(`mode:  ${cfg.mode}`);
  log(`write: ${sql}`);
  log();
  const result = await client.callTool({ name: 'run_mutation_query', arguments: { sql } });
  log(resultText(result));
}

// ---------------------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------------------

async function run(client: MCPClient): Promise<void> {
  const started = Date.now();
  const vars = {
    namespace: cfg.namespace,
    cluster_addr: cfg.clusterAddr,
    protocol: cfg.protocol,
    demo_label_key: cfg.labelKey,
    demo_label_value: cfg.labelValue,
  };

  // the server's own instructions travel with the briefing, so the agent reads the platform's
  // current guidance rather than a copy that goes stale
  const system = [render(readPrompt('system.md'), vars), client.instructions ? `# Server instructions\n\n${client.instructions}` : '']
    .filter(Boolean)
    .join('\n\n');
  const prompt = render(readPrompt('intent.md'), vars);

  const tools = await client.tools();
  const activeTools = cfg.hideWriteTools ? Object.keys(tools).filter((n) => !WRITE_TOOLS.has(n)) : undefined;

  log(`platform-agent  model=${cfg.model} effort=${cfg.effort} mode=${cfg.mode} tools=${activeTools?.length ?? Object.keys(tools).length}`);
  log(`namespace=${cfg.namespace} cluster_addr=${cfg.clusterAddr} audit=${path.relative(demoRoot, cfg.auditDir)}/`);
  log();

  const toolCounts = new Map<string, number>();
  let stepStarted = Date.now();

  const result = await generateText({
    model: createAnthropic()(cfg.model), // ANTHROPIC_API_KEY from the environment
    system,
    prompt,
    tools,
    activeTools,
    stopWhen: isStepCount(cfg.maxSteps),
    maxOutputTokens: 16000,
    providerOptions: {
      anthropic: {
        thinking: { type: 'adaptive' },
        effort: cfg.effort,
        fallbacks: 'default', // server-side fallback on a safety refusal, routed by category
      } satisfies AnthropicLanguageModelOptions,
    },
    onStepEnd({ stepNumber, toolCalls, toolResults }) {
      const outputs = new Map(toolResults.map((r) => [r.toolCallId, r.output]));
      for (const call of toolCalls) {
        toolCounts.set(call.toolName, (toolCounts.get(call.toolName) ?? 0) + 1);
        const input = (call.input ?? {}) as Record<string, unknown>;
        const shown = typeof input.sql === 'string' ? input.sql : JSON.stringify(input);
        log(`[${String(stepNumber + 1).padStart(2, '0')} ${elapsed(stepStarted).padStart(6)}] ${call.toolName}`);
        log(`      ${oneLine(shown, 320)}`);
        const text = resultText(outputs.get(call.toolCallId));
        const refused = /refused|not allowed|declined|denied/i.test(text);
        log(`      -> ${refused ? 'REFUSED/DECLINED: ' : ''}${oneLine(text, 200)}`);
      }
      stepStarted = Date.now();
    },
  });

  log();
  log('--- report -------------------------------------------------------------------');
  log(result.text.trim());
  log('--- run ----------------------------------------------------------------------');
  const usage = result.totalUsage;
  const price = PRICING[cfg.model];
  const cost =
    price && usage.inputTokens !== undefined && usage.outputTokens !== undefined
      ? ((usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000).toFixed(4)
      : undefined;
  const calls = [...toolCounts.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}=${c}`).join(' ');
  const writes = [...toolCounts.entries()].filter(([n]) => WRITE_TOOLS.has(n)).reduce((s, [, c]) => s + c, 0);
  log(`model: ${cfg.model} (effort ${cfg.effort})   mode: ${cfg.mode}   finish: ${result.finishReason}`);
  log(`steps: ${result.steps.length}   tool calls: ${calls || 'none'}`);
  log(`writes attempted: ${writes}   (the server decided what happened to them)`);
  log(`tokens: in=${usage.inputTokens ?? '?'} out=${usage.outputTokens ?? '?'} total=${usage.totalTokens ?? '?'}${cost ? `   list price: USD ${cost}` : ''}`);
  log(`audit log: ${latestAuditLog() ?? cfg.auditDir}`);
  log(`elapsed: ${elapsed(started)}`);
}

// ---------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  let client: MCPClient | undefined;
  try {
    client = await startPlatform();
    if (args.has('--list-tools')) await listTools(client);
    else if (args.has('--probe-write')) await probeWrite(client);
    else await run(client);
  } finally {
    await client?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
