import assert from 'node:assert/strict';
import { test } from 'node:test';

import { box } from '../src/console.ts';
import { blocks, Pacer } from '../src/pace.ts';

// offline, and no terminal: the pacer is a queue with a key() method

/** a pacer that writes to an array, with the "more is ready" mark recorded as it changes */
function stage() {
  const shown: string[] = [];
  const marks: boolean[] = [];
  const pacer = new Pacer({ line: (text) => shown.push(text), mark: (on) => marks.push(on) });
  const block = (...lines: string[]) => {
    for (const l of lines) pacer.write(l);
    pacer.cut();
  };
  return { pacer, shown, marks, block };
}

test('the first block shows at once, and each key shows one more', () => {
  const { pacer, shown, block } = stage();
  block('one');
  block('two', 'two again');
  block('three');
  assert.deepEqual(shown, ['one']);
  pacer.key();
  assert.deepEqual(shown, ['one', 'two', 'two again']);
  pacer.key();
  assert.deepEqual(shown, ['one', 'two', 'two again', 'three']);
  assert.equal(pacer.pending, 0);
});

test('a key pressed before the next block exists is remembered, once', () => {
  const { pacer, shown, block } = stage();
  block('one');
  pacer.key();
  pacer.key();
  pacer.key(); // three presses while the run is still working: one block's worth, not three
  block('two');
  block('three');
  block('four');
  assert.deepEqual(shown, ['one', 'two']);
});

test('the run does not wait for the presenter: writing never blocks, and shown() resolves on the last key', async () => {
  const { pacer, shown, block } = stage();
  block('one');
  block('two');
  pacer.write('three'); // not cut: shown() ends the open block
  let done = false;
  const all = pacer.shown().then(() => (done = true));
  await Promise.resolve();
  assert.equal(done, false);
  pacer.key();
  await Promise.resolve();
  assert.equal(done, false);
  pacer.key();
  await all;
  assert.deepEqual(shown, ['one', 'two', 'three']);
});

test('the mark is on while a block is waiting for a key, and off when it is shown', () => {
  const { pacer, marks, block } = stage();
  block('one');
  assert.deepEqual(marks, []);
  block('two');
  assert.deepEqual(marks, [true]);
  pacer.key();
  assert.deepEqual(marks, [true, false]);
});

test('hold waits for a key of its own, and a key pressed earlier does not count', async () => {
  const { pacer, shown, block } = stage();
  block('one');
  pacer.key(); // early, with nothing waiting
  await pacer.shown();
  let released = false;
  const held = pacer.hold().then(() => (released = true));
  await Promise.resolve();
  assert.equal(released, false);
  pacer.key();
  await held;
  assert.equal(released, true);
  assert.deepEqual(shown, ['one']);
});

test('flush shows everything now: the run failed, and the error must not be hidden behind a key press', () => {
  const { pacer, shown, block } = stage();
  block('one');
  block('two');
  pacer.write('three');
  pacer.flush();
  assert.deepEqual(shown, ['one', 'two', 'three']);
});

test('a transcript splits into the blocks a paced run showed: one per frame, with loose lines attached', () => {
  const frame = (title: string) => [...box(['x'], { title, width: 30 }), ''];
  const transcript = ['  ok  staged', ...frame('first'), 'approved by A. Person', '', ...frame('second'), ...frame('third'), 'the record: npm run audit'].join('\n') + '\n';
  const parts = blocks(transcript);
  assert.equal(parts.length, 3);
  assert.equal(parts[0][0], '  ok  staged', 'lines before the first frame belong to it');
  assert.equal(parts[0].at(-2), 'approved by A. Person', 'lines after a frame stay with it');
  assert.equal(parts[2].at(-1), 'the record: npm run audit');
  assert.equal(parts.flat().join('\n') + '\n', transcript, 'nothing is lost or reordered');
});

test('the summary frame stays joined to the report above it, as it is in the live run', () => {
  const frame = (title: string) => [...box(['x'], { title, width: 40 }), ''];
  const parts = blocks([...frame('the agent reports, and stops'), ...frame('run complete'), ...frame('the job')].join('\n'));
  assert.equal(parts.length, 2);
  assert.equal(parts[0].length, 8, 'two frames and their blank lines in one block');
});
