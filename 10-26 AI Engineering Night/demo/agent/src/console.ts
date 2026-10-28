/**
 * Console output: colour, ASCII boxes and tables, and a renderer for the model's markdown
 * report. ASCII only, so it survives any terminal font and code page. Colour follows the
 * terminal: on for a TTY, off when piped or NO_COLOR is set, on regardless with
 * FORCE_COLOR=1. Transcripts keep the colour, so a replay looks like the run.
 */

const colour =
  process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== ''
    ? process.env.FORCE_COLOR !== '0'
    : process.env.NO_COLOR === undefined && Boolean(process.stdout.isTTY);
const sgr = (open: number, close: number) => (s: string) => (colour ? `\x1b[${open}m${s}\x1b[${close}m` : s);

export const bold = sgr(1, 22);
export const dim = sgr(2, 22);
export const red = sgr(31, 39);
export const green = sgr(32, 39);
export const yellow = sgr(33, 39);
export const magenta = sgr(35, 39);
export const cyan = sgr(36, 39);

/** the text without its colour codes */
export const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const len = (s: string) => strip(s).length;
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - len(s)));

/** a section rule: --- title ------ */
export const rule = (title: string, width = 80) => `${dim('--- ')}${bold(title)} ${dim('-'.repeat(Math.max(4, width - len(title) - 5)))}`;

/** greedy word wrap; a word longer than the width is split */
export function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of s.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (len(w) > width) {
      if (line) {
        out.push(line);
        line = '';
      }
      out.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line) line = w;
    else if (len(line) + 1 + len(w) <= width) line += ` ${w}`;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

/** a box around lines, the title in the top edge, the border painted with `edge` */
export function box(lines: string[], title = '', edge: (s: string) => string = dim): string[] {
  const inner = Math.max(...lines.map(len), len(title) + 6, 24);
  const top = title
    ? `${edge('+-- ')}${bold(title)}${edge(` ${'-'.repeat(inner - len(title) - 2)}+`)}`
    : edge(`+${'-'.repeat(inner + 2)}+`);
  return [top, ...lines.map((l) => `${edge('|')} ${pad(l, inner)} ${edge('|')}`), edge(`+${'-'.repeat(inner + 2)}+`)];
}

/** an ASCII table: header bold, borders dim; cells may carry colour of their own */
export function table(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((h, i) => Math.max(len(h), ...rows.map((r) => len(r[i] ?? ''))));
  const edge = dim(`+${widths.map((w) => '-'.repeat(w + 2)).join('+')}+`);
  const row = (cells: string[], paint = (s: string) => s) =>
    `${dim('|')} ${widths.map((w, i) => pad(paint(cells[i] ?? ''), w)).join(` ${dim('|')} `)} ${dim('|')}`;
  return [edge, row(headers, bold), edge, ...rows.map((r) => row(r)), edge];
}

/** the model's punctuation in ASCII: em and en dashes, curly quotes, the multiplication sign, bullets */
export const ascii = (s: string) =>
  s
    .replace(/[‒–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/•/g, '-')
    .replace(/ /g, ' ');

/**
 * The model's markdown report for the console: headings bold, pipe tables as ASCII tables
 * (or as label: value lines when the table would not fit the terminal), code dim.
 */
export function markdown(text: string, columns = process.stdout.columns ?? 120): string[] {
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
      out.push(dim('-'.repeat(40)));
    } else {
      out.push(inline(l));
    }
  }
  return out;
}
