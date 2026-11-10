/**
 * Console output: colour, box-drawing frames and tables, and a renderer for the model's
 * markdown report. The frames are the U+2500 box-drawing block, which Node writes to a
 * Windows console as UTF-16 and every default terminal font carries. Colour follows the
 * terminal: on for a TTY, off when piped or NO_COLOR is set, on regardless with
 * FORCE_COLOR=1. Transcripts keep the colour, so a replay looks like the run.
 */

const colour =
  process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== ''
    ? process.env.FORCE_COLOR !== '0'
    : process.env.NO_COLOR === undefined && Boolean(process.stdout.isTTY);
const sgr = (open: number, close: number) => (s: string) => (colour ? `\x1b[${open}m${s}\x1b[${close}m` : s);

export type Paint = (s: string) => string;
export const plain: Paint = (s) => s;
export const bold = sgr(1, 22);
export const dim = sgr(2, 22);
export const red = sgr(31, 39);
export const green = sgr(32, 39);
export const yellow = sgr(33, 39);
export const magenta = sgr(35, 39);
export const cyan = sgr(36, 39);

/** the box-drawing block: the rule, the upright, the four corners, the four tees, the cross */
const G = {
  h: '\u2500',
  v: '\u2502',
  tl: '\u250c',
  tr: '\u2510',
  bl: '\u2514',
  br: '\u2518',
  lt: '\u251c',
  rt: '\u2524',
  tt: '\u252c',
  bt: '\u2534',
  x: '\u253c',
};
const h = (n: number) => G.h.repeat(Math.max(0, n));

/** the text without its colour codes */
export const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const len = (s: string) => strip(s).length;
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - len(s)));

/** the width the frames use: the terminal's, one column short of its edge, at most `max` */
export const width = (max = 120) => Math.min((process.stdout.columns ?? max + 1) - 1, max);

/** a section rule: the title between two runs of the horizontal */
export const rule = (title: string, w = width()) => `${dim(h(2))} ${bold(title)} ${dim(h(w - len(title) - 4))}`;

/** greedy word wrap; a word longer than the width is split, its head filling the current line first */
export function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (let w of s.split(/\s+/).filter(Boolean)) {
    if (line && len(line) + 1 + len(w) <= width) {
      line += ` ${w}`;
      continue;
    }
    if (line && len(w) > width) {
      const room = width - len(line) - 1; // a word no line can hold: its head fills this one
      if (room > 0) {
        line += ` ${w.slice(0, room)}`;
        w = w.slice(room);
      }
    }
    if (line) out.push(line);
    while (len(w) > width) {
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    line = w;
  }
  if (line) out.push(line);
  return out;
}

export type Frame = { title?: string; note?: string; edge?: Paint; width?: number };

/**
 * A frame around lines: the title in the top edge at the left, the note at the right, the
 * border painted with `edge`. Given a width the frame is that wide and long lines wrap
 * inside it; without one it fits its content.
 */
export function box(lines: string[], frame: Frame = {}): string[] {
  const { title = '', note = '', edge = cyan } = frame;
  const head = (title ? len(title) + 3 : 0) + (note ? len(note) + 3 : 0); // the top edge's text and its spacing
  const inner = frame.width ? frame.width - 4 : Math.max(...lines.map(len), head, 24);
  const body = lines.flatMap((l) => (len(l) <= inner ? [l] : wrap(l, inner)));
  const top =
    edge(G.tl) +
    (title ? `${edge(G.h)} ${edge(bold(title))} ` : '') +
    edge(h(inner + 2 - head)) +
    (note ? ` ${edge(note)} ${edge(G.h)}` : '') +
    edge(G.tr);
  return [top, ...body.map((l) => `${edge(G.v)} ${pad(l, inner)} ${edge(G.v)}`), edge(`${G.bl}${h(inner + 2)}${G.br}`)];
}

/** a table: header bold, borders painted with `edge`; cells may carry colour of their own */
export function table(headers: string[], rows: string[][], edge: Paint = cyan): string[] {
  const widths = headers.map((hd, i) => Math.max(len(hd), ...rows.map((r) => len(r[i] ?? ''))));
  const line = (l: string, m: string, r: string) => edge(`${l}${widths.map((w) => h(w + 2)).join(m)}${r}`);
  const row = (cells: string[], paint: Paint = plain) =>
    `${edge(G.v)} ${widths.map((w, i) => pad(paint(cells[i] ?? ''), w)).join(` ${edge(G.v)} `)} ${edge(G.v)}`;
  return [line(G.tl, G.tt, G.tr), row(headers, bold), line(G.lt, G.x, G.rt), ...rows.map((r) => row(r)), line(G.bl, G.bt, G.br)];
}

/** the model's punctuation in ASCII: em and en dashes, curly quotes, the multiplication sign, bullets */
export const ascii = (s: string) =>
  s
    .replace(/[\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00d7/g, 'x')
    .replace(/\u2022/g, '-')
    .replace(/\u00a0/g, ' ');

/**
 * The model's markdown report for the console: headings bold, pipe tables as tables (or
 * as label: value lines when the table would not fit the width), code dim, prose wrapped.
 */
export function markdown(text: string, columns = width()): string[] {
  const inline = (s: string) =>
    s.replace(/\*\*([^*]+)\*\*/g, (_, t: string) => bold(t)).replace(/`([^`]+)`/g, (_, t: string) => cyan(t));
  const isSeparator = (l: string) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l);
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => inline(c.trim()));
  const out: string[] = [];
  const lines = ascii(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      while (++i < lines.length && !/^\s*```/.test(lines[i])) out.push(dim(`    ${lines[i]}`));
    } else if (/^\s*\|/.test(l)) {
      const block: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) block.push(lines[i++]);
      i--;
      const rows = block.filter((r) => !isSeparator(r)).map(cells);
      if (rows.length === 0) continue;
      const t = table(rows[0], rows.slice(1));
      if (len(t[0]) <= columns) out.push(...t);
      else {
        const label = Math.max(...rows[0].map(len));
        rows.slice(1).forEach((r, n) => {
          if (n > 0) out.push('');
          r.forEach((cell, c) => out.push(`${bold(pad(rows[0][c] ?? '', label))}  ${cell}`));
        });
      }
    } else if (/^#{1,6}\s/.test(l)) {
      out.push(bold(l.replace(/^#{1,6}\s+/, '')));
    } else if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(l)) {
      out.push(dim(h(40)));
    } else if (l.trim() === '') {
      out.push('');
    } else {
      const lead = l.match(/^\s*/)?.[0] ?? ''; // the line's own indentation is kept
      const item = l.slice(lead.length).match(/^((?:[-*]|\d+\.)\s+)/)?.[1] ?? ''; // a list item's turnover lines up with its text
      const turnover = lead + ' '.repeat(item.length);
      wrap(inline(l.trim()), Math.max(1, columns - lead.length)).forEach((w, n) => out.push(n === 0 ? lead + w : turnover + w));
    }
  }
  return out;
}
