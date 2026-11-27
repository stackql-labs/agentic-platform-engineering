/**
 * The fallback: replay a recorded transcript with the pacing of a run, under a banner that
 * says what it is. No model, no network, no credentials.
 *
 *   npm run replay                  the blocked run, then the promotion, as recorded in recordings/
 *   npm run replay -- blocked       the denied request only
 *   npm run replay -- promote       the promotion only
 *   npm run replay -- <file>        any transcript from runs/
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { cfg, demoRoot } from './config.ts';
import { bold, box, corner, dim, strip, yellow } from './console.ts';
import { W } from './screen.ts';

const NAMED: Record<string, string> = { blocked: 'blocked', promote: 'promote', note: 'note' };

function recording(prefix: string): string | undefined {
  if (!existsSync(cfg.recordingsDir)) return undefined;
  return readdirSync(cfg.recordingsDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.txt'))
    .sort()
    .map((f) => path.join(cfg.recordingsDir, f))
    .pop();
}

async function play(file: string): Promise<void> {
  const recorded = statSync(file).mtime.toISOString().slice(0, 16).replace('T', ' ');
  const banner = [`${path.relative(demoRoot, file)}   ${dim(`recorded ${recorded} UTC`)}`, bold('a recording, not a live run')];
  for (const l of box(banner, { title: 'REPLAY', edge: yellow, width: W })) console.log(l);
  console.log();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (strip(line).startsWith(corner)) await sleep(900); // a frame is starting
    console.log(line);
    await sleep(35);
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  const files = arg
    ? [NAMED[arg] ? recording(NAMED[arg]) : path.resolve(arg)]
    : [recording(NAMED.blocked), recording(NAMED.promote)];
  for (const file of files) {
    if (!file || !existsSync(file)) throw new Error(`no transcript to replay${arg ? ` for "${arg}"` : ''} (looked in ${path.relative(demoRoot, cfg.recordingsDir)})`);
    await play(file);
  }
  console.log(dim('(end of replay)'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
