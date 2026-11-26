import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';

type Mode = 'read_only' | 'safe';
export const providerRoot = fileURLToPath(new URL('../runs/providers/', import.meta.url));
export async function connect(mode: Mode, token: string, permit?: string) {
  mkdirSync(providerRoot, { recursive: true });
  const client = new Client({ name: 'talk4', version: '1.0.0' }, { capabilities: { elicitation: {} } });
  let armed = false;
  let elicited = false;
  client.setRequestHandler(ElicitRequestSchema, async request => {
    if (!armed || elicited || mode !== 'safe' || !('requestedSchema' in request.params)) return { action: 'decline' };
    elicited = true;
    const props = request.params.requestedSchema.properties ?? {};
    const content: Record<string, boolean> = {};
    for (const [key, field] of Object.entries(props)) {
      if (field.type !== 'boolean') return { action: 'decline' };
      content[key] = true;
    }
    return { action: 'accept', content };
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../node_modules/@stackql/mcp-server/bin/stackql-mcp.js', import.meta.url)),
      '--mcp.config', JSON.stringify({ server: { mode, audit: { disabled: false, format: 'jsonl', file: { path: path.join(providerRoot, mode + '.jsonl') } } } })],
    env: { STACKQL_PLUGIN_CONFIG_DIR: providerRoot, CLOUDFLARE_API_TOKEN: token },
    cwd: providerRoot, stderr: 'pipe',
  });
  transport.stderr?.on('data', () => {});
  try { await client.connect(transport); } catch (error) { await client.close(); throw error; }
  async function call(name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    const content = Array.isArray(result.content) ? result.content : [];
    const message = content.map(c => c.type === 'text' ? String(c.text) : '').join('\n');
    return { error: result.isError === true, message, rows: (result.structuredContent as { rows?: Record<string, unknown>[] } | undefined)?.rows };
  }
  return {
    query: async (sql: string) => {
      const result = await call('run_select_query', { sql });
      if (result.error || !Array.isArray(result.rows)) throw new Error('StackQL did not return query rows. Check the provider, token scope and zone.');
      return result.rows;
    },
    refuse: async (sql: string) => {
      if (mode !== 'read_only') throw new Error('Read-only server required.');
      const result = await call('run_mutation_query', { sql });
      if (!/read.only/i.test(result.message) || !/refus|denied|disabl|not allowed|not available|reject|blocked/i.test(result.message)) throw new Error('Could not verify a read-only server refusal.');
    },
    apply: async (sql: string) => {
      if (mode !== 'safe' || !permit || sql !== permit || elicited) throw new Error('Write is outside the approved operation.');
      armed = true;
      try {
        const result = await call('run_mutation_query', { sql });
        if (result.error || !elicited || /declined|refused/i.test(result.message)) throw new Error('Write was not confirmed.');
      } finally { armed = false; }
    },
    install: async () => {
      const result = await call('pull_provider', { provider: 'cloudflare', version: 'v26.07.00424' });
      if (result.error || /refused|failed|denied/i.test(result.message)) throw new Error('Cloudflare provider installation failed.');
      return result.message;
    },
    close: () => client.close(),
  };
}
