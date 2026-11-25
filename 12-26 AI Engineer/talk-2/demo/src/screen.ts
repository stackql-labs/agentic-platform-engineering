/**
 * What goes on screen, and into the transcript beside it. Every command writes the same
 * lines to a file in runs/, colour included, so `npm run replay` looks like the run.
 *
 * The colours mean one thing each: cyan is a look, magenta is a proposal, amber is held,
 * red is refused, green is applied or confirmed.
 */
import { appendFileSync } from 'node:fs';
import path from 'node:path';

import { ensureRunsDir, runStamp } from './config.ts';
import { bold, box, cyan, dim, green, red, table, width, wrap, yellow, type Paint } from './console.ts';
import type { Row } from './platform.ts';

/** frames are at most 100 columns: wide enough for a statement, narrow enough to zoom on */
export const W = width(100);

let transcript: string | undefined;

/** start a transcript for this command; returns its path */
export function openTranscript(kind: string): string {
  transcript = path.join(ensureRunsDir(), `${kind}_${runStamp}.txt`);
  return transcript;
}

export function say(line = ''): void {
  console.log(line);
  if (transcript) appendFileSync(transcript, `${line}\n`);
}

export function frame(title: string, lines: string[], edge: Paint = cyan, note = ''): void {
  for (const l of box(lines, { title, note, edge, width: W })) say(l);
  say();
}

/** a statement, wrapped to sit inside a frame */
export const statementLines = (sql: string, paint: Paint = bold): string[] => wrap(sql.replace(/\s+/g, ' ').trim(), W - 4).map(paint);

/** the columns a SELECT names, in the order it names them (the server returns them sorted) */
function selected(sql: string): string[] {
  const list = sql.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s/i)?.[1] ?? '';
  return list.split(',').map((c) => c.trim().split(/\s+/).pop() ?? '');
}

/** a sentence for a frame: its first letter capitalised */
export const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** rows as a table, with the one cell this demo is about painted: on is green, off is red */
export function rowsTable(rows: Row[], sql = ''): string[] {
  if (rows.length === 0) return [dim('no rows')];
  const order = selected(sql);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const headers = Object.keys(rows[0]).sort((a, b) => rank(a) - rank(b));
  const cell = (key: string, value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    if (key !== 'deletion_protection_enabled') return text;
    return text === 'true' ? green(bold(text)) : red(bold(text));
  };
  return table(headers, rows.map((r) => headers.map((hd) => cell(hd, r[hd]))));
}

export const seconds = (from: number): string => `${((Date.now() - from) / 1000).toFixed(1)}s`;
export const clock = (iso: string): string => iso.slice(11, 19);

export { bold, cyan, dim, green, red, yellow };
