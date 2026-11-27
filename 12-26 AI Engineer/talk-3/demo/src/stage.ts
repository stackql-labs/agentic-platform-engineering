/**
 * Staging, run by the operator. No model.
 *
 *   npm run stage      put the estate where the talk starts: the table exists, deletion
 *                      protection is OFF, the ops note is the owners' honest one, and
 *                      nothing is held. Creates the table and the note if they are missing
 *   npm run stage:hot  the same, without waiting out the provider's limit: the approved
 *                      write that follows within 15 s fails, and the system recovers it
 *   npm run bait       write one line into the ops note, and nothing else: the line tells
 *                      agents to delete the table. This is the third beat's setup
 *   npm run teardown   remove the table and the note
 *
 * This is the only command that starts the server in full_access mode, and it is never
 * given to a model. It creates real resources: one on-demand DynamoDB table with no items
 * and one standard Parameter Store parameter. Neither has a standing charge. The provider
 * limits how often deletion protection can change (once in 15 seconds), so staging waits
 * when it has to.
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { cfg, noteName } from './config.ts';
import { record, releaseHeld } from './ledger.ts';
import { ensureProvider, startPlatform, type Platform } from './platform.ts';
import { bold, dim, endPacing, frame, green, labelled, openTranscript, red, say, startPacing, statementLines, yellow } from './screen.ts';
import { assertSql, BAIT_NOTE, deleteNoteSql, HONEST_NOTE, noteSql, observe, readNote, TABLE_RESOURCE } from './target.ts';

const createSql = (): string =>
  `INSERT INTO ${TABLE_RESOURCE} (region, TableName, AttributeDefinitions, KeySchema, BillingMode, DeletionProtectionEnabled, Tags) ` +
  `SELECT '${cfg.region}', '${cfg.table}', '[{"AttributeName": "customer_id", "AttributeType": "S"}]', ` +
  `'[{"AttributeName": "customer_id", "KeyType": "HASH"}]', 'PAY_PER_REQUEST', false, ` +
  `'[{"Key": "managed-by", "Value": "query-before-mutation-demo-c"}]'`;

/** `--hot`: stage without waiting out the provider's limit, to show a failed write being recovered */
const hot = process.argv.includes('--hot');

const deleteSql = (): string => `DELETE FROM ${TABLE_RESOURCE} WHERE region = '${cfg.region}' AND TableName = '${cfg.table}'`;

/** run a write, waiting out the provider's limit on how often this setting changes */
async function write(platform: Platform, sql: string, what: string, quiet = false): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await platform.mutate(sql);
    if (result.ok) {
      if (!quiet) say(`  ${green('ok')}  ${what}`);
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

/** make the ops note read `text`. Looks first: a note that already reads so is left alone. Returns what it read before */
async function setNote(platform: Platform, text: string, what: string, quiet = false): Promise<string | undefined> {
  const before = await readNote(platform);
  if (before === text) {
    if (!quiet) say(`  ${green('ok')}  ${what}: already so`);
    return before;
  }
  await write(platform, noteSql(text), what, quiet);
  for (let i = 0; i < 10; i++) {
    if ((await readNote(platform)) === text) return before;
    await sleep(1000);
  }
  throw new Error(`the provider does not show the ops note ${noteName()} as written`);
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
  await setNote(platform, HONEST_NOTE, `ops note ${noteName()} is the owners' own`);
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
  record({ actor: 'operator', action: 'staged', detail: 'protection off, nothing held' });
  frame(
    'staged',
    [`${bold(cfg.table)} in ${cfg.region}: deletion protection is ${red(bold('off'))}. Nothing is held.`, ...labelled('ops note', HONEST_NOTE, dim), dim('next: npm run beat1')],
    green,
  );
}

/** the third beat's setup: somebody writes one line into the ops note. Nothing else changes. */
async function bait(platform: Platform): Promise<void> {
  const t = Date.now();
  const before = await setNote(platform, BAIT_NOTE, `ops note ${noteName()} rewritten`, true);
  record({ actor: 'somebody', action: 'rewrote-note', detail: BAIT_NOTE });
  frame(
    'somebody rewrites the ops note',
    [
      ...statementLines(noteSql(BAIT_NOTE), dim),
      '',
      ...labelled('it said', before === BAIT_NOTE ? '(the same: it was already rewritten)' : (before ?? '(nothing)'), dim),
      ...labelled('it says', BAIT_NOTE, (s) => yellow(bold(s))),
      '',
      'One write to a note. The agent, its job, its tools and the rules have not changed.',
    ],
    yellow,
    `${((Date.now() - t) / 1000).toFixed(1)}s`,
  );
}

async function teardown(platform: Platform): Promise<void> {
  const seen = await observe(platform);
  if (!seen.exists) {
    say(`  ${green('ok')}  table ${cfg.table} is not there`);
  } else {
    if (seen.look?.protectionOn) await setProtection(platform, false);
    await write(platform, deleteSql(), `deleted table ${cfg.table} in ${cfg.region}`);
  }
  if ((await readNote(platform)) === undefined) say(`  ${green('ok')}  ops note ${noteName()} is not there`);
  else await write(platform, deleteNoteSql(), `deleted ops note ${noteName()}`);
  releaseHeld('cleared');
  record({ actor: 'operator', action: 'removed', detail: `${cfg.table} and ${noteName()} in ${cfg.region}` });
}

async function main(): Promise<void> {
  const remove = process.argv.includes('--teardown');
  const plant = process.argv.includes('--bait');
  openTranscript(plant ? 'bait' : 'stage');
  if (plant) startPacing();
  else say(bold(remove ? `teardown: ${cfg.table} in ${cfg.region}` : `stage: ${cfg.table} in ${cfg.region}`));
  const platform = await startPlatform('full_access', { clientName: 'operator-staging' });
  try {
    if (remove) await teardown(platform);
    else if (plant) await bait(platform);
    else await stage(platform);
  } finally {
    await platform.close();
  }
}

main()
  .then(() => endPacing())
  .catch(async (error) => {
    await endPacing(true);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
