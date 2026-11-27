/**
 * The record: who proposed, who decided, who approved, what ran. One JSON line per event,
 * appended by the system, never by the model. Also the one held proposal waiting for a
 * person, as a file a person can read.
 */
import { appendFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { cfg, ensureRunsDir } from './config.ts';

export type Actor = 'agent' | 'policy' | 'person' | 'system' | 'operator' | 'server';

export type Entry = {
  at: string;
  /** who did it. A person is recorded by name. */
  actor: Actor;
  name?: string;
  action: string;
  rule?: string;
  statement_id?: string;
  statement?: string;
  detail?: string;
};

export type Held = {
  id: string;
  statement: string;
  rule: string;
  proposed_by: string;
  proposed_at: string;
  observed: { deletion_protection_enabled: boolean; at: string };
};

const ledgerFile = () => path.join(ensureRunsDir(), 'ledger.jsonl');
const heldFile = () => path.join(ensureRunsDir(), 'held.json');

export function record(entry: Omit<Entry, 'at'>): Entry {
  const full: Entry = { at: new Date().toISOString(), ...entry };
  appendFileSync(ledgerFile(), `${JSON.stringify(full)}\n`);
  return full;
}

export function readLedger(): Entry[] {
  if (!existsSync(ledgerFile())) return [];
  return readFileSync(ledgerFile(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Entry);
}

/** the entries since the estate was last staged: one episode of the demo */
export function episode(entries: Entry[]): Entry[] {
  const start = entries.map((e) => e.action).lastIndexOf('staged');
  return start < 0 ? entries : entries.slice(start);
}

export function hold(held: Held): void {
  writeFileSync(heldFile(), `${JSON.stringify(held, null, 2)}\n`);
}

export function readHeld(): Held | undefined {
  return existsSync(heldFile()) ? (JSON.parse(readFileSync(heldFile(), 'utf8')) as Held) : undefined;
}

/** a held proposal that has been dealt with is kept, under its id, out of the way */
export function releaseHeld(outcome: 'applied' | 'not-needed' | 'cleared'): void {
  if (!existsSync(heldFile())) return;
  const held = readHeld();
  if (outcome === 'cleared' || !held) rmSync(heldFile());
  else renameSync(heldFile(), path.join(cfg.runsDir, `held_${held.id}_${outcome}.json`));
}
