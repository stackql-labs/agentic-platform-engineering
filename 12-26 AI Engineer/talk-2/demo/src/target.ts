/**
 * The one thing this demo is about: a production table and one safety setting on it.
 * The statements here are the ones the system itself runs (to look, and to stage). The
 * agent writes its own.
 */
import { cfg } from './config.ts';
import type { Platform, Row } from './platform.ts';
import type { Look } from './policy.ts';

export const TABLE_RESOURCE = 'aws.dynamodb.tables';

/** the look: one row, read live from the provider */
export const lookSql = (): string =>
  `SELECT table_name, table_status, deletion_protection_enabled FROM ${TABLE_RESOURCE} WHERE region = '${cfg.region}' AND TableName = '${cfg.table}'`;

/** the end state, as one statement. Safe to run twice: it says what should be, not what to do. */
export const assertSql = (on: boolean): string =>
  `UPDATE ${TABLE_RESOURCE} SET DeletionProtectionEnabled = ${on} WHERE region = '${cfg.region}' AND TableName = '${cfg.table}'`;

const truthy = (v: unknown) => v === true || v === 1 || String(v).toLowerCase() === 'true';

/** does this statement read the table this demo is about? */
export const readsTheTable = (sql: string): boolean =>
  /^\s*SELECT\b/i.test(sql) &&
  new RegExp(`\\b${TABLE_RESOURCE.replace(/\./g, '\\.')}\\b`, 'i').test(sql) &&
  sql.includes(`'${cfg.table}'`) &&
  sql.includes(`'${cfg.region}'`);

/** what a look saw, from the rows of a statement that read the table, or undefined */
export function lookFrom(rows: Row[] | undefined, at = Date.now()): Look | undefined {
  const row = rows?.find((r) => 'deletion_protection_enabled' in r);
  return row ? { at, protectionOn: truthy(row.deletion_protection_enabled) } : undefined;
}

export type Observation = { exists: boolean; status?: string; look?: Look; error?: string };

/** the system's own look: it does not take the model's word for the state of the table */
export async function observe(platform: Platform): Promise<Observation> {
  const result = await platform.select(lookSql());
  if (!result.ok) {
    return /ResourceNotFoundException|not found/i.test(result.text) ? { exists: false } : { exists: false, error: result.text };
  }
  const row = result.rows?.[0];
  if (!row) return { exists: false };
  return { exists: true, status: String(row.table_status ?? ''), look: lookFrom(result.rows) };
}
