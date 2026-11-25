/**
 * The structured audit: one JSON line per event, appended by the system, never by the
 * model. Every line of a run carries the run's correlation id.
 */
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ensureRunsDir } from './config.ts';

export type Entry = {
  at: string;
  correlation_id: string;
  /** agent, gate, operator (by name), system, server */
  actor: string;
  event: string;
  decision?: string;
  reason?: string;
  details?: Record<string, unknown>;
};

export const correlationId = randomUUID().slice(0, 8);

const file = () => path.join(ensureRunsDir(), 'audit.jsonl');

export function record(entry: Omit<Entry, 'at' | 'correlation_id'>): Entry {
  const full: Entry = { at: new Date().toISOString(), correlation_id: correlationId, ...entry };
  appendFileSync(file(), `${JSON.stringify(full)}\n`);
  return full;
}

export function readAudit(): Entry[] {
  if (!existsSync(file())) return [];
  return readFileSync(file(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Entry);
}

/** the entries since the estate was last staged */
export function episode(entries: Entry[]): Entry[] {
  const start = entries.map((e) => e.event).lastIndexOf('staged');
  return start < 0 ? entries : entries.slice(start);
}
