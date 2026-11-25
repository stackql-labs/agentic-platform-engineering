/**
 * Staging, run by the operator. No model.
 *
 *   npm run stage      put the release state where the talk starts: checkout-preview serves
 *                      the live digest, the candidate has 0% of traffic, and the candidate's
 *                      evidence is on record
 *   npm run teardown   remove every parameter this demo wrote
 *
 * This is the only command that starts the server in full_access mode, and it is never
 * given to a model. It writes real resources: eleven standard Parameter Store parameters,
 * which have no charge. The values come from fixtures/release.json and are synthetic.
 * Staging looks before it writes: a parameter that already has its value is left alone.
 */
import { cfg, releasePolicy, seed } from './config.ts';
import { record } from './ledger.ts';
import { ensureProvider, startPlatform, type Platform } from './platform.ts';
import { assertSql, CANDIDATE_PATH, lookSql, previewPath, toParams, WRITE_RESOURCE } from './release.ts';
import { bold, dim, frame, green, openTranscript, say } from './screen.ts';

/** every parameter of the demo, and the value it starts with */
function wanted(): Array<{ name: string; value: string }> {
  const preview = previewPath(seed.environment.target);
  return [
    { name: `${preview}/live`, value: seed.environment.live },
    { name: `${preview}/candidate`, value: seed.environment.candidate },
    ...Object.entries(seed.candidate).map(([key, value]) => ({ name: `${CANDIDATE_PATH}/${key}`, value })),
  ];
}

async function existing(platform: Platform): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const p of [previewPath(seed.environment.target), CANDIDATE_PATH]) {
    const result = await platform.select(lookSql(cfg.region, p));
    if (!result.ok) throw new Error(result.text);
    for (const param of toParams(result.rows)) found.set(param.name, param.value);
  }
  return found;
}

async function stage(platform: Platform): Promise<void> {
  if (await ensureProvider(platform, 'aws')) say(`  ${green('ok')}  pulled the aws provider`);
  const now = await existing(platform);
  let written = 0;
  for (const { name, value } of wanted()) {
    if (now.get(name) === value) continue;
    const result = await platform.mutate(assertSql(cfg.region, name, value));
    if (!result.ok) throw new Error(`could not write ${name}: ${result.text}`);
    written += 1;
    say(`  ${green('ok')}  ${name}`);
  }
  say(`  ${green('ok')}  ${wanted().length - written} of ${wanted().length} parameters already as staged`);
  record({ actor: 'operator', event: 'staged', details: { target: seed.environment.target, written } });
  frame(
    'staged',
    [
      `${bold(releasePolicy.target)} in ${cfg.region}: serving the live digest, candidate at ${bold('0%')}.`,
      `Candidate evidence on record under ${CANDIDATE_PATH}. Synthetic values.`,
      dim('next: npm run blocked, then npm run promote'),
    ],
    green,
  );
}

async function teardown(platform: Platform): Promise<void> {
  const now = await existing(platform);
  for (const name of now.keys()) {
    const result = await platform.mutate(`DELETE FROM ${WRITE_RESOURCE} WHERE region = '${cfg.region}' AND Name = '${name}'`);
    if (!result.ok) throw new Error(`could not delete ${name}: ${result.text}`);
    say(`  ${green('ok')}  deleted ${name}`);
  }
  if (now.size === 0) say(`  ${green('ok')}  nothing to remove`);
  record({ actor: 'operator', event: 'removed', details: { parameters: now.size } });
}

async function main(): Promise<void> {
  openTranscript('stage');
  const remove = process.argv.includes('--teardown');
  say(bold(remove ? `teardown: ${releasePolicy.target} in ${cfg.region}` : `stage: ${releasePolicy.target} in ${cfg.region}`));
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
