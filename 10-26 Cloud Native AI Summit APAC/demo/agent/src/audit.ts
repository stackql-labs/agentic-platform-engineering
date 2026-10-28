/**
 * npm run audit [file]
 *
 * The StackQL MCP audit sink as a table: one record per tool call, with the mode the server
 * was in and what the gate decided. The agent is an event source; this is the event log.
 * Reads the newest runs/stackql_mcp_server_*.jsonl (or an older *.log) unless a file is given.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(here, '..', '..');
const envFile = path.join(demoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const auditDir = process.env.STACKQL_AUDIT_DIR || path.join(demoRoot, 'runs');

function newest(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('stackql_mcp_server_') && (f.endsWith('.jsonl') || f.endsWith('.log')))
    .map((f) => ({ file: path.join(dir, f), mtime: statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.file;
}

const file = process.argv[2] ? path.resolve(process.argv[2]) : newest(auditDir);
if (!file || !existsSync(file)) {
  console.error(`no audit log found in ${auditDir}; run the agent first`);
  process.exit(1);
}

type Rec = Record<string, unknown>;
const records = readFileSync(file, 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => {
    try {
      return JSON.parse(l) as Rec;
    } catch {
      return undefined;
    }
  })
  .filter((r): r is Rec => r !== undefined);

const str = (v: unknown): string => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const fit = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s.padEnd(n));
const statementOf = (r: Rec): string => {
  const args = (r.args ?? {}) as Rec;
  return flat(str(r.sql ?? r.query ?? args.sql ?? (Object.keys(args).length ? args : '')));
};
const timeOf = (r: Rec): string => {
  const t = str(r.timestamp ?? r.time ?? r.ts);
  const m = t.match(/T(\d\d:\d\d:\d\d)/);
  return m ? m[1] : t.slice(0, 8);
};

const modes = new Set(records.map((r) => str(r.mode)).filter(Boolean));
const decisions = new Map<string, number>();
for (const r of records) decisions.set(str(r.decision) || '?', (decisions.get(str(r.decision) || '?') ?? 0) + 1);

console.log(`audit log: ${path.relative(demoRoot, file)}`);
console.log(`records:   ${records.length}   mode: ${[...modes].join(', ') || '?'}   decisions: ${[...decisions.entries()].map(([d, n]) => `${d}=${n}`).join(' ')}`);
console.log();
console.log(`${fit('time', 8)}  ${fit('tool', 24)}  ${fit('decision', 24)}  ${'ms'.padStart(6)}  statement`);
console.log(`${'-'.repeat(8)}  ${'-'.repeat(24)}  ${'-'.repeat(24)}  ${'-'.repeat(6)}  ${'-'.repeat(70)}`);
for (const r of records) {
  const ms = r.duration_ms !== undefined ? String(r.duration_ms) : '';
  console.log(`${fit(timeOf(r), 8)}  ${fit(str(r.tool), 24)}  ${fit(str(r.decision), 24)}  ${ms.padStart(6)}  ${fit(statementOf(r), 70)}`);
}
console.log();
console.log('every statement the agent ran, the mode the server was in, and what the gate decided: one record each, never the result rows.');
