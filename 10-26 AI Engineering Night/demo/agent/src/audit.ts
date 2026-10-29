/**
 * npm run audit [file]
 *
 * The StackQL MCP audit sink as a table: one record per tool call, with the mode the server
 * was in and what the gate decided. The agent is an event source; this is the event log.
 * Each run starts its own sink in STACKQL_AUDIT_DIR (default audit/ under the cwd, so
 * agent/audit with npm run); without a file argument this reads all of them, oldest first,
 * so the agent's run, the replayed proposal and the policy decline appear in one log.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bold, box, dim, green, red, table, width, yellow } from './console.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const demoRoot = path.resolve(here, '..', '..');
const envFile = path.join(demoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const auditDir = process.env.STACKQL_AUDIT_DIR || path.resolve('audit');

const isSink = (f: string) => f.startsWith('stackql_mcp_server_') && (f.endsWith('.jsonl') || f.endsWith('.log'));
const files = process.argv[2]
  ? [path.resolve(process.argv[2])]
  : existsSync(auditDir)
    ? readdirSync(auditDir)
        .filter(isSink)
        .sort()
        .map((f) => path.join(auditDir, f))
        .filter((f) => statSync(f).size > 0) // a run that made no tool call leaves an empty sink
    : [];
if (files.length === 0 || !files.every((f) => existsSync(f))) {
  console.error(`no audit log found in ${auditDir}; run the agent first`);
  process.exit(1);
}

type Rec = Record<string, unknown>;
const parse = (l: string): Rec[] => {
  try {
    return [JSON.parse(l) as Rec];
  } catch {
    return [];
  }
};
const records = files.flatMap((f) =>
  readFileSync(f, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .flatMap(parse),
);

const str = (v: unknown): string => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const fit = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);
const statementOf = (r: Rec): string => {
  const args = (r.args ?? {}) as Rec;
  return flat(str(r.sql ?? r.query ?? args.sql ?? (Object.keys(args).length ? args : '')));
};
const timeOf = (r: Rec): string => {
  const t = str(r.timestamp ?? r.time ?? r.ts);
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return d.toTimeString().slice(0, 8); // local time, as the server stamps it
  const m = t.match(/T(\d\d:\d\d:\d\d)/);
  return m ? m[1] : t.slice(0, 8);
};
const paintMode = (m: string) => (m === 'safe' ? yellow(m) : m === 'full_access' ? red(m) : m ? green(m) : '');
const paintDecision = (d: string) => (/declin|refus|denied|error/i.test(d) ? red(d) : d ? green(d) : dim('?'));

const modes = [...new Set(records.map((r) => str(r.mode)).filter(Boolean))];
const decisions = new Map<string, number>();
for (const r of records) decisions.set(str(r.decision) || '?', (decisions.get(str(r.decision) || '?') ?? 0) + 1);
const statementWidth = Math.max(40, (process.stdout.columns ?? 140) - 92);

const head = [
  `${bold('sinks')}      ${files.length === 1 ? path.relative(demoRoot, files[0]) : `${files.length} in ${path.relative(demoRoot, auditDir)}`}`,
  `${bold('records')}    ${records.length}   ${bold('modes')} ${modes.map(paintMode).join(', ') || '?'}   ${bold('decisions')} ${[...decisions].map(([d, n]) => `${paintDecision(d)}=${n}`).join(' ')}`,
];
for (const l of box(head, { title: 'audit log', width: width() })) console.log(l);
console.log();
const rows = records.map((r) => [
  timeOf(r),
  paintMode(str(r.mode)),
  str(r.tool),
  paintDecision(str(r.decision)),
  r.duration_ms !== undefined ? String(r.duration_ms) : '',
  fit(statementOf(r), statementWidth),
]);
for (const l of table(['time', 'mode', 'tool', 'decision', 'ms', 'statement'], rows)) console.log(l);
console.log();
console.log(dim('every statement the agent ran, the mode the server was in, and what the gate decided: one record each, never the result rows.'));
