/**
 * The fallback: replay a recorded transcript under a banner that says what it is. No model,
 * no network, no credentials.
 *
 * On a terminal a replay is paced the way the live beats are: one frame per key press. With
 * `--auto`, or when the output is piped, it plays on a timer instead.
 *
 *   npm run replay                  the three beats, as recorded in recordings/
 *   npm run replay -- 1             beat 1: the write is held
 *   npm run replay -- 2             beat 2: approved, applied, looked at again, and the record
 *   npm run replay -- 3             beat 3: the bait, and the delete that is refused
 *   npm run replay -- failed        beat 2 where the write fails first and is recovered
 *   npm run replay -- <file>        any transcript from runs/
 *   npm run replay -- 1 --auto      on a timer, not on a key press
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { cfg, demoRoot } from './config.ts';
import { bold, box, dim, yellow } from './console.ts';
import { blocks } from './pace.ts';
import { cut, endPacing, say, startPacing, W } from './screen.ts';

const NAMED: Record<string, string> = { '1': 'beat-1-held', '2': 'beat-2-recovered', '3': 'beat-3-bait', failed: 'beat-2-failed-then-recovered' };

function recording(prefix: string): string | undefined {
  if (!existsSync(cfg.recordingsDir)) return undefined;
  return readdirSync(cfg.recordingsDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.txt'))
    .sort()
    .map((f) => path.join(cfg.recordingsDir, f))
    .pop();
}

function banner(file: string): string[] {
  const recorded = statSync(file).mtime.toISOString().slice(0, 16).replace('T', ' ');
  return box([`${path.relative(demoRoot, file)}   ${dim(`recorded ${recorded} UTC`)}`, bold('a recording, not a live run')], { title: 'REPLAY', edge: yellow, width: W });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const auto = process.argv.includes('--auto') || !process.stdin.isTTY || !process.stdout.isTTY;
  const files = args.length ? args.map((a) => (NAMED[a] ? recording(NAMED[a]) : path.resolve(a))) : [recording(NAMED['1']), recording(NAMED['2']), recording(NAMED['3'])];
  if (!auto) startPacing(true);
  for (const [n, file] of files.entries()) {
    if (!file || !existsSync(file)) throw new Error(`no transcript to replay${args[n] ? ` for "${args[n]}"` : ''} (looked in ${path.relative(demoRoot, cfg.recordingsDir)})`);
    const parts = blocks(readFileSync(file, 'utf8'));
    // the banner shares a block with the recording's first frame, so it is never on screen alone
    for (const l of banner(file)) say(l);
    say();
    for (const [b, block] of parts.entries()) {
      for (const line of block) {
        say(line);
        if (auto) await sleep(35);
      }
      // the last block of the last recording carries the closing line, so it needs no key of its own
      if (n === files.length - 1 && b === parts.length - 1) say(dim('(end of replay)'));
      cut();
      if (auto) await sleep(900);
    }
  }
}

main()
  .then(() => endPacing())
  .catch(async (error) => {
    await endPacing(true);
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
