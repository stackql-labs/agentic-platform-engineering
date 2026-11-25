/**
 * Presenter pacing. A live run takes about five seconds, and a room needs longer than that
 * to read one frame. With `--paced` the run goes at its own speed and only its output is
 * held back: the first block shows at once, and each key press shows the next one.
 *
 * The run is never waiting on the presenter, so nothing in it can go stale while somebody
 * is talking: a look is as fresh as it was, an approval has as long left as it had. The
 * times printed in the frames are the times the run took.
 *
 * This file is the queue, with no terminal in it, so it can be tested. The terminal is
 * attached in screen.ts.
 */
import { corner, strip } from './console.ts';

/** the horizontal of a frame's top edge, as console.ts draws it */
const rule = String.fromCharCode(0x2500);

/** where shown lines go, and how the "more is ready" mark is drawn and removed */
export type Stage = { line(text: string): void; mark?(on: boolean): void };

export class Pacer {
  /** complete blocks, waiting for a key */
  private readonly waiting: string[][] = [];
  /** the block being written */
  private open: string[] = [];
  /** blocks that may be shown without a key press: the first one, and one key pressed early */
  private credit = 1;
  private marked = false;
  private idle: Array<() => void> = [];
  private nextKey: Array<() => void> = [];
  private readonly stage: Stage;

  constructor(stage: Stage) {
    this.stage = stage;
  }

  /** a line of the block being written */
  write(line: string): void {
    this.open.push(line);
  }

  /** the block being written is complete: it is shown now if a key is owed, or it waits */
  cut(): void {
    if (this.open.length === 0) return;
    this.waiting.push(this.open);
    this.open = [];
    this.pump();
  }

  /** a key was pressed: show the next block, or remember the press (one, not several) for the block still being made */
  key(): void {
    const waiters = this.nextKey;
    this.nextKey = [];
    if (waiters.length > 0 && this.waiting.length === 0) {
      // somebody is waiting for a key for its own sake (the hold at the end of a command)
      this.mark(false);
      for (const resolve of waiters) resolve();
      return;
    }
    this.nextKey = waiters;
    this.credit = 1;
    this.pump();
  }

  /** how many blocks are waiting for a key */
  get pending(): number {
    return this.waiting.length;
  }

  /** resolves when every block written so far has been shown */
  shown(): Promise<void> {
    this.cut();
    if (this.waiting.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idle.push(resolve));
  }

  /** resolves at the next key press that is not needed to show a block */
  hold(): Promise<void> {
    this.credit = 0;
    this.mark(true);
    return new Promise((resolve) => this.nextKey.push(resolve));
  }

  /** show everything now, without waiting: the run is over or it failed */
  flush(): void {
    this.cut();
    this.mark(false);
    for (const block of this.waiting.splice(0)) for (const line of block) this.stage.line(line);
    this.settle();
  }

  private pump(): void {
    while (this.credit > 0 && this.waiting.length > 0) {
      this.mark(false);
      for (const line of this.waiting.shift()!) this.stage.line(line);
      this.credit -= 1;
    }
    if (this.waiting.length > 0) this.mark(true);
    else this.settle();
  }

  private settle(): void {
    if (this.waiting.length > 0) return;
    const done = this.idle;
    this.idle = [];
    for (const resolve of done) resolve();
  }

  private mark(on: boolean): void {
    if (on === this.marked) return;
    this.marked = on;
    this.stage.mark?.(on);
  }
}

/**
 * A recorded transcript as the blocks a paced run would have shown: a block starts at a
 * frame's top edge and runs to the next one. Lines before the first frame belong to it,
 * and a frame the live run joins to the one before it (the summary under the agent's
 * report) stays joined.
 */
export const JOINED = ['run complete'];

export function blocks(text: string, joined: string[] = JOINED): string[][] {
  const out: string[][] = [];
  let framed = false; // has the block being built reached its frame yet?
  for (const line of text.replace(/\n$/, '').split('\n')) {
    const plain = strip(line);
    const top = plain.startsWith(corner) && !joined.some((title) => plain.startsWith(`${corner}${rule} ${title} `));
    if (out.length === 0 || (top && framed)) {
      out.push([]);
      framed = false;
    }
    if (top) framed = true;
    out[out.length - 1].push(line);
  }
  return out;
}
