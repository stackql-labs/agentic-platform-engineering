/**
 * The record: who proposed, who decided, who approved, what ran. One row per event, since
 * the estate was last staged. `npm run audit -- --all` shows everything on file.
 */
import { bold, cyan, dim, green, magenta, red, strip, table, yellow, type Paint } from './console.ts';
import { episode, readLedger, type Entry } from './ledger.ts';
import { clock, frame, openTranscript, say, W } from './screen.ts';

const actorPaint: Record<string, Paint> = { agent: magenta, policy: yellow, person: green, system: cyan, server: cyan, operator: dim, somebody: red };
const actionPaint = (action: string): Paint =>
  ['held', 'declined', 'rewrote-note'].includes(action) ? yellow : ['refused', 'failed', 'not-verified'].includes(action) ? red : ['applied', 'verified', 'approved', 'allowed', 'nothing-to-do', 'noop'].includes(action) ? green : (s) => s;

const who = (e: Entry): string => (e.actor === 'person' ? (e.name ?? 'a person') : e.actor === 'agent' ? 'agent' : e.actor);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3)}...` : s);

function main(): void {
  openTranscript('audit');
  const all = readLedger();
  const entries = process.argv.includes('--all') ? all : episode(all);
  if (entries.length === 0) {
    frame('the record', ['nothing on record yet. Run `npm run stage`, then `npm run beat1`.'], dim);
    return;
  }
  const rows = entries
    .filter((e) => !['started', 'reported'].includes(e.action))
    .map((e) => [
      clock(e.at),
      (actorPaint[e.actor] ?? ((s: string) => s))(bold(who(e))),
      actionPaint(e.action)(e.action),
      e.rule ?? '',
      (e.detail ?? (e.statement_id ? `statement ${e.statement_id}` : '')).replace(/\s+/g, ' '),
    ]);
  // the detail column takes whatever width is left, so the table fits the frames
  const fixed = [0, 1, 2, 3].reduce((sum, c) => sum + Math.max(...rows.map((r) => strip(r[c]).length), 4) + 3, 0);
  for (const r of rows) r[4] = clip(r[4], Math.max(16, W - fixed - 4));
  say(bold('the record') + dim('   who proposed, who decided, who approved, what ran'));
  for (const l of table(['utc', 'actor', 'action', 'rule', 'detail'], rows, dim)) say(l);
  say();
  const statements = new Map(entries.filter((e) => e.statement && e.statement_id).map((e) => [e.statement_id!, e.statement!]));
  for (const [id, sql] of statements) say(`${dim(id)}  ${sql.replace(/\s+/g, ' ')}`);
}

main();
