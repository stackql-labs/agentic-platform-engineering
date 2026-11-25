/**
 * What goes on screen, and into the transcript beside it. Every command writes the same
 * lines to a file in runs/, colour included, so `npm run replay` looks like the run.
 *
 * The colours mean one thing each: cyan is a query, magenta is a proposal, yellow is
 * waiting on a person, red is denied, green is applied or verified.
 */
import { appendFileSync } from 'node:fs';
import path from 'node:path';

import { ensureRunsDir, runStamp } from './config.ts';
import { bold, box, cyan, dim, green, magenta, red, table, width, wrap, yellow, type Paint } from './console.ts';
import type { Param } from './release.ts';

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

/** a long value with its middle taken out, so a digest fits a table cell */
export const middle = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 7)}..${s.slice(-5)}`);

/** parameters as a table: name, value, revision. The untrusted free text is marked as such. */
export function paramsTable(params: Param[]): string[] {
  if (params.length === 0) return [dim('no rows')];
  const room = W - 4 - Math.max(...params.map((p) => p.name.length)) - 17; // the frame, the name column, the borders and the version column
  const rows = params.map((p) => {
    const untrusted = p.name.endsWith('/release_note');
    const value = middle(p.value, Math.max(24, room));
    return [p.name, untrusted ? yellow(value) : value, String(p.version)];
  });
  return table(['name', 'value', 'version'], rows);
}

/** a sentence for a frame: its first letter capitalised */
export const sentence = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export const seconds = (from: number): string => `${((Date.now() - from) / 1000).toFixed(1)}s`;
export const clock = (iso: string): string => iso.slice(11, 19);

export { bold, cyan, dim, green, magenta, red, yellow };
