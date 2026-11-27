/**
 * The structured audit, as a table: every query, proposal, decision, approval, write and
 * verification since the estate was last staged. `npm run audit -- --all` shows everything
 * on file; `npm run audit -- --json` prints the records as they are stored.
 */
import { bold, cyan, dim, green, magenta, red, strip, table, yellow, type Paint } from './console.ts';
import { episode, readAudit, type Entry } from './ledger.ts';
import { clock, frame, openTranscript, say, W } from './screen.ts';

const actorPaint = (actor: string): Paint => (actor === 'agent' ? magenta : actor === 'gate' ? yellow : actor === 'system' || actor === 'server' ? cyan : actor === 'operator' ? dim : green);
const decisionPaint = (d: string): Paint =>
  ['denied', 'declined', 'failed', 'answered_no'].includes(d) ? red : ['accepted', 'passed', 'answered_yes'].includes(d) ? green : ['approval_required', 'unknown'].includes(d) ? yellow : (s) => s;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

function detail(e: Entry): string {
  const d = e.details ?? {};
  if (e.event === 'query') return String(d.sql ?? '').replace(/^.*Path = /, 'Path = ');
  if (e.event === 'proposal') return `${d.target} ${String(d.digest ?? '').slice(0, 14)}.. ${d.traffic_percent}%`;
  if (e.event === 'request') return String(d.request ?? '');
  if (d.plan_id) return `plan ${d.plan_id}`;
  if (d.route) return `${String(d.route).slice(0, 14)}..@${String(d.route).split('@')[1]} rev ${d.revision}`;
  return String(d.reason ?? '');
}

function main(): void {
  openTranscript('audit');
  const all = readAudit();
  const entries = process.argv.includes('--all') ? all : episode(all);
  if (process.argv.includes('--json')) {
    for (const e of entries) console.log(JSON.stringify(e));
    return;
  }
  if (entries.length === 0) {
    frame('audit', ['nothing on record yet. Run `npm run stage`, then `npm run blocked`.'], dim);
    return;
  }
  say(bold('audit') + dim('   who asked, what the gate decided, who approved, what ran'));
  say();
  // one table per run: every record of a run carries the run's correlation id
  const runs = [...new Set(entries.map((e) => e.correlation_id))];
  for (const run of runs) {
    const mine = entries.filter((e) => e.correlation_id === run);
    const request = mine.find((e) => e.event === 'request');
    say(`${bold(`run ${run}`)}  ${dim(clip(request ? detail(request) : (mine[0]?.event ?? ''), W - 16))}`);
    const rows = mine
      .filter((e) => !['report', 'request'].includes(e.event))
      .map((e) => [clock(e.at), actorPaint(e.actor)(bold(e.actor)), e.event, decisionPaint(e.decision ?? '')(e.decision ?? ''), e.reason ?? '', detail(e).replace(/\s+/g, ' ')]);
    if (rows.length === 0) continue;
    // the last column takes whatever width is left, so the table fits the frames
    const fixed = [0, 1, 2, 3, 4].reduce((sum, c) => sum + Math.max(...rows.map((r) => strip(r[c]).length), 5) + 3, 0);
    for (const r of rows) r[5] = clip(r[5], Math.max(12, W - fixed - 4));
    for (const l of table(['utc', 'actor', 'event', 'decision', 'reason', 'detail'], rows, dim)) say(l);
    say();
  }
}

main();
