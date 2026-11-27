/**
 * The platform: the StackQL MCP server, started here over stdio from the npm package
 * (`@stackql/mcp-server`), in the mode the system chose.
 *
 * Two things are decided in this file and nowhere else:
 *
 *   the key    The server process is given the cloud credential in its own environment and
 *              nothing else of ours (no model key). The model's context gets neither: it
 *              sees tool names, SQL and rows. Anything that looks like the credential is
 *              scrubbed from a tool result before the model can read it.
 *
 *   the mode   read_only refuses every write. safe asks before every write (an MCP
 *              elicitation request), and the answer comes from code in this process.
 *              full_access is used only by the operator's staging script, with no model.
 */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { cfg, demoRoot, ensureRunsDir, runStamp } from './config.ts';

export type Mode = 'read_only' | 'safe' | 'full_access';
export type Row = Record<string, unknown>;
export type ToolResult = { ok: boolean; text: string; rows?: Row[] };
export type ToolDef = { name: string; description: string };

/** the variables the server process is given, by name. Everything else stays here. */
const SERVER_CREDENTIALS = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN'];

export type Platform = {
  mode: Mode;
  server: string;
  /** the engine version the server reported when it started */
  version: string;
  tools: ToolDef[];
  /** the credential variable names the server holds (names only, never values) */
  credentials: string[];
  auditFile: string;
  call(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  select(sql: string): Promise<ToolResult>;
  mutate(sql: string): Promise<ToolResult>;
  close(): Promise<void>;
};

export type PlatformOptions = {
  /** answers the server when it asks before a write (safe mode). Default: no. */
  approve?: (message: string) => boolean | Promise<boolean>;
  clientName?: string;
};

export async function startPlatform(mode: Mode, options: PlatformOptions = {}): Promise<Platform> {
  const runs = ensureRunsDir();
  const launcher = path.join(demoRoot, 'node_modules', '@stackql', 'mcp-server', 'bin', 'stackql-mcp.js');
  if (!existsSync(launcher)) throw new Error('the StackQL MCP launcher is not installed. Run `npm install` in this folder');

  // the server's own audit sink: one JSON record per tool call (the statement, the decision,
  // the duration; never the rows)
  const auditFile = path.join(runs, `stackql_mcp_server_${runStamp}_${mode}.jsonl`);
  const serverLog = path.join(runs, `stackql_mcp_server_${runStamp}_${mode}.stderr.log`);
  const serverConfig = { server: { mode, audit: { disabled: false, format: 'jsonl', file: { path: auditFile } } } };

  // the launcher points the server at ~/.stackql/.env by default. Give it an empty file of
  // our own instead, so the only credentials it has are the ones named below.
  const envFile = path.join(runs, 'server.env');
  if (!existsSync(envFile)) writeFileSync(envFile, '');

  const serverEnv: Record<string, string> = { ...getDefaultEnvironment() };
  const credentials: string[] = [];
  const secrets: string[] = [];
  for (const name of SERVER_CREDENTIALS) {
    const value = process.env[name];
    if (!value) continue;
    serverEnv[name] = value;
    credentials.push(name);
    if (value.length >= 12) secrets.push(value);
  }
  if (process.env.STACKQL_MCP_BIN) serverEnv.STACKQL_MCP_BIN = process.env.STACKQL_MCP_BIN;
  if (!credentials.includes('AWS_ACCESS_KEY_ID') || !credentials.includes('AWS_SECRET_ACCESS_KEY')) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are not set. The StackQL server needs them (see .env.example)');
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      launcher,
      '--env.file', envFile,
      ...(cfg.approot ? ['--approot', cfg.approot] : []),
      '--mcp.config', JSON.stringify(serverConfig),
    ],
    env: serverEnv,
    cwd: runs,
    stderr: 'pipe',
  });
  const stderrTail: string[] = [];
  transport.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    appendFileSync(serverLog, text);
    stderrTail.push(...text.split(/\r?\n/).filter(Boolean));
    while (stderrTail.length > 12) stderrTail.shift();
  });

  const client = new Client({ name: options.clientName ?? 'query-before-mutation', version: '0.1.0' }, { capabilities: { elicitation: {} } });
  client.setRequestHandler(ElicitRequestSchema, async (request) => {
    const yes = options.approve ? await options.approve(request.params.message) : false;
    return yes ? { action: 'accept', content: {} } : { action: 'decline' };
  });

  try {
    await client.connect(transport);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`the StackQL MCP server did not start (${reason})\n${stderrTail.join('\n')}`);
  }

  /** nothing that looks like the credential reaches the caller, and so nothing reaches the model */
  const scrub = (text: string) => secrets.reduce((t, secret) => t.split(secret).join('[redacted]'), text);

  const call = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const result = await client.callTool({ name, arguments: args });
      const content = Array.isArray(result.content) ? result.content : [];
      const text = content.map((c) => (c && typeof c === 'object' && 'text' in c ? String(c.text) : '')).join('\n');
      const structured = result.structuredContent as { rows?: Row[] } | undefined;
      return { ok: result.isError !== true, text: scrub(text), rows: structured?.rows };
    } catch (error) {
      return { ok: false, text: scrub(error instanceof Error ? error.message : String(error)) };
    }
  };

  const listed = await client.listTools();
  const version = client.getServerVersion();
  return {
    mode,
    server: `${version?.name ?? 'stackql'} mcp ${serverVersion(stderrTail)}`.trim(),
    version: serverVersion(stderrTail),
    tools: listed.tools.map((t) => ({ name: t.name, description: t.description ?? '' })),
    credentials,
    auditFile,
    call,
    select: (sql) => call('run_select_query', { sql }),
    mutate: (sql) => call('run_mutation_query', { sql }),
    close: () => client.close(),
  };
}

/** the engine version, from the server's start line on stderr */
function serverVersion(stderr: string[]): string {
  for (const line of stderr) {
    const m = line.match(/starting: version=(\S+)/);
    if (m) return m[1];
  }
  return '';
}

/** make sure the provider is in the server's cache. The operator's script does this, not the model. */
export async function ensureProvider(platform: Platform, provider: string): Promise<boolean> {
  const listed = await platform.call('list_providers', {});
  if (new RegExp(`\\b${provider}\\b`).test(listed.text)) return false;
  const pulled = await platform.call('pull_provider', { provider });
  if (!pulled.ok) throw new Error(`could not pull the ${provider} provider: ${pulled.text}`);
  return true;
}
