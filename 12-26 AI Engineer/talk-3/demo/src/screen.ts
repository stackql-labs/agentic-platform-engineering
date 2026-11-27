/**
 * What goes on screen, and into the transcript beside it. Every command writes the same
 * lines to a file in runs/, colour included, so `npm run replay` looks like the run.
 *
 * The colours mean one thing each: cyan is a look, magenta is a proposal, amber is held,
 * red is refused, green is applied or confirmed.
 *
 * With `--paced` on a terminal, output is shown one block at a time, on a key press (see
 * pace.ts). The transcript is written as the run happens, whatever the pacing.
 */
import { appendFileSync } from 'node:fs';
import path from 'node:path';

import { ensureRunsDir, runStamp } from './config.ts';
import { bold, box, cyan, dim, green, red, table, width, wrap, yellow, type Paint } from './console.ts';
import { Pacer } from './pace.ts';
import type { Row } from './platform.ts';
import type { Check } from './policy.ts';

/** frames are at most 100 columns: wide enough for a statement, narrow enough to zoom on */
export const W = width(100);

let transcript: string | undefined;
let pacer: Pacer | undefined;

/** start a transcript for this command; returns its path */
export function openTranscript(kind: string): string {
  transcript = path.join(ensureRunsDir(), `${kind}_${runStamp}.txt`);
  return transcript;
}

/** an account id inside an ARN is not for a screen in front of a room */
export const mask = (s: string): string => s.replace(/(arn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:)\d{12}/g, '$1************');

export function say(line = ''): void {
  const shown = mask(line);
  if (transcript) appendFileSync(transcript, `${shown}\n`);
  if (pacer) pacer.write(shown);
  else console.log(shown);
}

/** a frame is one block of a paced run, unless it is joined to the frame after it */
export function frame(title: string, lines: string[], edge: Paint = cyan, note = '', join = false): void {
  for (const l of box(lines, { title, note, edge, width: W })) say(l);
  say();
  if (!join) cut();
}

/** end the block being written: in a paced run, what follows waits for the next key */
export function cut(): void {
  pacer?.cut();
}

/** did the command line ask for pacing, and is there a terminal to pace on? */
export const pacedRun = (): boolean => process.argv.includes('--paced') && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);

/**
 * Start holding output back, one block per key press. Call it after any question that is
 * asked with readline. Does nothing unless the run is paced. Any key shows the next block
 * (a presentation clicker sends one); Ctrl+C ends the run.
 */
export function startPacing(force = false): void {
  if (pacer || !(force || pacedRun())) return;
  const out = process.stdout;
  const stage = new Pacer({
    line: (text) => console.log(text),
    mark: (on) => out.write(on ? dim('  ...') : '\r\x1b[2K'),
  });
  pacer = stage;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (keys: Buffer) => {
    if (keys.includes(3)) {
      stage.flush();
      process.stdin.setRawMode(false);
      process.exit(130);
    }
    stage.key();
  });
}

/**
 * The end of a paced command: wait until every block has been shown, and with
 * `--wait-at-end` for one more key, so that the command after this one starts on a press.
 * With `now` everything is shown at once (the run failed, and the error comes next).
 */
export async function endPacing(now = false): Promise<void> {
  if (!pacer) return;
  if (now) pacer.flush();
  else {
    await pacer.shown();
    if (process.argv.includes('--wait-at-end')) await pacer.hold();
  }
  pacer = undefined;
  process.stdin.setRawMode(false);
  process.stdin.pause();
}

/** a statement, wrapped to sit inside a frame */
export const statementLines = (sql: string, paint: Paint = bold): string[] => wrap(sql.replace(/\s+/g, ' ').trim(), W - 4).map(paint);

/** the columns a SELECT names, in the order it names them (the server returns them sorted) */
function selected(sql: string): string[] {
  const list = sql.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s/i)?.[1] ?? '';
  return list.split(',').map((c) => c.trim().split(/\s+/).pop() ?? '');
}

/** a label and its text: the text wraps inside the frame, and its turnover lines sit under the text, not under the label */
export function labelled(label: string, text: string, paint: Paint = (s) => s, labelWidth = label.length): string[] {
  const indent = labelWidth + 2;
  return wrap(text, W - 4 - indent).map((l, i) => `${bold((i === 0 ? label : '').padEnd(labelWidth))}  ${paint(l)}`);
}

/** a sentence for a frame: its first letter capitalised */
export const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Rows as a table, with the one cell this demo is about painted: on is green, off is red.
 * Rows too wide for a frame (an ops note is a sentence or two) are set out as label and
 * value, with the value wrapped.
 */
export function rowsTable(rows: Row[], sql = ''): string[] {
  if (rows.length === 0) return [dim('no rows')];
  const order = selected(sql);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const headers = Object.keys(rows[0]).sort((a, b) => rank(a) - rank(b));
  const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
  const cell = (key: string, value: unknown) => {
    if (key !== 'deletion_protection_enabled') return text(value);
    return text(value) === 'true' ? green(bold(text(value))) : red(bold(text(value)));
  };
  const widest = headers.reduce((sum, hd) => sum + Math.max(hd.length, ...rows.map((r) => text(r[hd]).length)) + 3, 1);
  if (widest <= W - 4) return table(headers, rows.map((r) => headers.map((hd) => cell(hd, r[hd]))));
  const label = Math.max(...headers.map((hd) => hd.length));
  return rows.flatMap((r, n) => [
    ...(n > 0 ? [''] : []),
    ...headers.flatMap((hd) => wrap(text(r[hd]), W - 4 - label - 2).map((l, i) => `${dim((i === 0 ? hd : '').padEnd(label))}  ${bold(l)}`)),
  ]);
}

const CHECK_MARK: Record<Check['state'], (s: string) => string> = {
  ok: (s) => green(s),
  no: (s) => red(bold(s)),
  waiting: (s) => yellow(bold(s)),
  'not-reached': (s) => dim(s),
};
const CHECK_WORD: Record<Check['state'], string> = { ok: 'ok', no: 'NO', waiting: '..', 'not-reached': '- ' };

/** the gate's four checks, one line each: ok above the one that said no, not reached below it */
export function checkLines(checks: Check[]): string[] {
  return checks.map((c) => {
    const note = c.state === 'not-reached' ? dim(c.note) : c.state === 'no' ? red(sentence(c.note)) : c.state === 'waiting' ? yellow(sentence(c.note)) : c.note;
    return `${bold(c.name.padEnd(10))}  ${CHECK_MARK[c.state](CHECK_WORD[c.state])}  ${note}`;
  });
}

export const seconds = (from: number): string => `${((Date.now() - from) / 1000).toFixed(1)}s`;
export const clock = (iso: string): string => iso.slice(11, 19);

export { bold, cyan, dim, green, red, yellow };
