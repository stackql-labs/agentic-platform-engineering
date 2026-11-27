/**
 * The declaration, as the gate reads it: the cells (cells/<cell>.env, one per region) and
 * the rollout in flight (rollout.env). These files are the reviewed intent. The agent
 * never writes them directly; the one line a promotion changes is written here, by the
 * gate, after policy and a human have said yes.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type Cell = { name: string; region: string; wave: number; release: string; file: string };
export type Rollout = { service: string; candidate: string; previous: string };

/** KEY=VALUE lines; comments and blank lines ignored, surrounding quotes dropped */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function parseCell(name: string, text: string, file = ''): Cell {
  const env = parseEnv(text);
  const need = (key: string) => {
    if (!env[key]) throw new Error(`cell ${name}: ${key} is not declared`);
    return env[key];
  };
  const wave = Number(need('CELL_WAVE'));
  if (!Number.isInteger(wave) || wave < 0) throw new Error(`cell ${name}: CELL_WAVE is not a wave number`);
  return { name, region: need('CELL_REGION'), wave, release: need('CELL_RELEASE'), file };
}

/** every cell in the directory, in rollout order: by wave, then by name */
export function readCells(dir: string): Cell[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.env'))
    .map((f) => parseCell(path.basename(f, '.env'), readFileSync(path.join(dir, f), 'utf8'), path.join(dir, f)))
    .sort((a, b) => a.wave - b.wave || a.name.localeCompare(b.name));
}

export function parseRollout(text: string): Rollout {
  const env = parseEnv(text);
  for (const key of ['ROLLOUT_SERVICE', 'ROLLOUT_CANDIDATE', 'ROLLOUT_PREVIOUS']) {
    if (!env[key]) throw new Error(`rollout: ${key} is not declared`);
  }
  return { service: env.ROLLOUT_SERVICE, candidate: env.ROLLOUT_CANDIDATE, previous: env.ROLLOUT_PREVIOUS };
}

export const readRollout = (file: string): Rollout => parseRollout(readFileSync(file, 'utf8'));

/** the cell file's text with its declared release changed, and nothing else */
export function withRelease(text: string, release: string): string {
  if (!/^CELL_RELEASE=.*$/m.test(text)) throw new Error('no CELL_RELEASE line to change');
  return text.replace(/^CELL_RELEASE=.*$/m, `CELL_RELEASE=${release}`);
}

/** change one cell's declared release on disk; returns the text it replaced, for a revert */
export function setRelease(cell: Cell, release: string): string {
  const before = readFileSync(cell.file, 'utf8');
  writeFileSync(cell.file, withRelease(before, release));
  return before;
}
