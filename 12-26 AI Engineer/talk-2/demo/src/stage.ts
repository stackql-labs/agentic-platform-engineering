/**
 * Staging, run by the operator. No model.
 *
 *   npm run stage      put the estate where the talk starts: the table exists, deletion
 *                      protection is OFF, nothing is held. Creates the table if it is missing
 *   npm run stage:hot  the same, without waiting out the provider's limit: the approved
 *                      write that follows within 15 s fails, and the system recovers it
 *   npm run teardown   remove the table
 *
 * This is the only command that starts the server in full_access mode, and it is never
 * given to a model. It creates a real resource: one on-demand DynamoDB table with no items,
 * which has no standing charge. The provider limits how often deletion protection can
 * change (once in 15 seconds), so staging waits when it has to.
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { cfg } from './config.ts';
import { record, releaseHeld } from './ledger.ts';
import { ensureProvider, startPlatform, type Platform } from './platform.ts';
import { bold, dim, frame, green, openTranscript, red, say } from './screen.ts';
import { assertSql, observe, TABLE_RESOURCE } from './target.ts';

const createSql = (): string =>
  `INSERT INTO ${TABLE_RESOURCE} (region, TableName, AttributeDefinitions, KeySchema, BillingMode, DeletionProtectionEnabled, Tags) ` +
  `SELECT '${cfg.region}', '${cfg.table}', '[{"AttributeName": "order_id", "AttributeType": "S"}]', ` +
  `'[{"AttributeName": "order_id", "KeyType": "HASH"}]', 'PAY_PER_REQUEST', false, ` +
  `'[{"Key": "managed-by", "Value": "query-before-mutation-demo"}]'`;

/** `--hot`: stage without waiting out the provider's limit, to show a failed write being recovered */
const hot = process.argv.includes('--hot');

const deleteSql = (): string => `DELETE FROM ${TABLE_RESOURCE} WHERE region = '${cfg.region}' AND TableName = '${cfg.table}'`;

/** run a write, waiting out the provider's limit on how often this setting changes */
async function write(platform: Platform, sql: string, what: string): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await platform.mutate(sql);
    if (result.ok) {
      say(`  ${green('ok')}  ${what}`);
      return;
    }
    if (attempt === 3) throw new Error(`${what} failed: ${result.text}`);
    say(dim(`  waiting 16 s, then trying once more (${result.text.replace(/\s+/g, ' ').slice(0, 90)})`));
    await sleep(16_000);
  }
}

async function setProtection(platform: Platform, on: boolean): Promise<void> {
  await write(platform, assertSql(on), `deletion protection ${on ? 'on' : 'off'}`);
  for (let i = 0; i < 10; i++) {
    await sleep(1500);
    if ((await observe(platform)).look?.protectionOn === on) return;
  }
  throw new Error(`the provider does not show deletion protection ${on ? 'on' : 'off'}`);
}

async function stage(platform: Platform): Promise<void> {
  if (await ensureProvider(platform, 'aws')) say(`  ${green('ok')}  pulled the aws provider`);
  let seen = await observe(platform);
  if (seen.error) throw new Error(seen.error);
  if (!seen.exists) {
    await write(platform, createSql(), `created table ${cfg.table} in ${cfg.region}`);
    for (let i = 0; i < 30 && seen.status !== 'ACTIVE'; i++) {
      await sleep(2000);
      seen = await observe(platform);
    }
    if (seen.status !== 'ACTIVE') throw new Error(`table ${cfg.table} did not become ACTIVE`);
    say(`  ${green('ok')}  table is ACTIVE`);
  } else {
    say(`  ${green('ok')}  table ${cfg.table} exists (${seen.status})`);
  }
  if (seen.look?.protectionOn !== false) {
    await setProtection(platform, false);
    if (hot) {
      say(dim('  --hot: not waiting. A write to this setting in the next 15 s will be throttled by the provider.'));
    } else {
      // the provider allows one change to this setting in 15 seconds. Wait it out here, so
      // the approved write that follows is not throttled
      say(dim('  waiting 16 s: the provider limits how often this setting changes'));
      await sleep(16_000);
    }
  } else {
    say(`  ${green('ok')}  deletion protection is already off`);
  }
  releaseHeld('cleared');
  record({ actor: 'operator', action: 'staged', detail: `${cfg.table} in ${cfg.region}: deletion protection off, nothing held` });
  frame('staged', [`${bold(cfg.table)} in ${cfg.region}: deletion protection is ${red(bold('off'))}. Nothing is held.`, dim('next: npm run agent')], green);
}

async function teardown(platform: Platform): Promise<void> {
  const seen = await observe(platform);
  if (!seen.exists) {
    say(`  ${green('ok')}  table ${cfg.table} is not there`);
  } else {
    if (seen.look?.protectionOn) await setProtection(platform, false);
    await write(platform, deleteSql(), `deleted table ${cfg.table} in ${cfg.region}`);
  }
  releaseHeld('cleared');
  record({ actor: 'operator', action: 'removed', detail: `${cfg.table} in ${cfg.region}` });
}

async function main(): Promise<void> {
  openTranscript('stage');
  const remove = process.argv.includes('--teardown');
  say(bold(remove ? `teardown: ${cfg.table} in ${cfg.region}` : `stage: ${cfg.table} in ${cfg.region}`));
  const platform = await startPlatform('full_access', { clientName: 'operator-staging' });
  try {
    if (remove) await teardown(platform);
    else await stage(platform);
  } finally {
    await platform.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
