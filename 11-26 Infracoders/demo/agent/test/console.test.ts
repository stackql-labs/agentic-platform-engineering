import assert from 'node:assert/strict';
import { test } from 'node:test';

import { box, markdown, strip, table, wrap } from '../src/console.js';

// the frames as ASCII, so the expectations read: corners and tees +, the rule -, the upright |
const ascii = (s: string) =>
  strip(s)
    .replace(/[\u250c\u2510\u2514\u2518\u251c\u2524\u252c\u2534\u253c]/g, '+')
    .replace(/\u2500/g, '-')
    .replace(/\u2502/g, '|');

test('a box is rectangular, whatever the content, and drawn with the box-drawing block', () => {
  const lines = box(['short', 'a much longer line of text'], { title: 'title' }).map(ascii);
  for (const l of lines) assert.equal(l.length, lines[0].length, l);
  assert.match(lines[0], /^\+- title -+\+$/);
  assert.match(lines[lines.length - 1], /^\+-+\+$/);
  assert.match(strip(box(['x'])[0]), /^\u250c\u2500+\u2510$/);
});

test('a box of a given width wraps long lines and carries the note at the right of the top edge', () => {
  const lines = box(['one two three four five six'], { title: 't', note: '4.2s', width: 20 }).map(ascii);
  for (const l of lines) assert.equal(l.length, 20, l);
  assert.equal(lines[0], '+- t ------- 4.2s -+');
  assert.deepEqual(lines.slice(1, -1), ['| one two three    |', '| four five six    |']);
});

test('a table aligns its columns', () => {
  const lines = table(['a', 'bb'], [['1', '22'], ['333', '4']]).map(ascii);
  assert.deepEqual(lines, ['+-----+----+', '| a   | bb |', '+-----+----+', '| 1   | 22 |', '| 333 | 4  |', '+-----+----+']);
});

test('markdown tables become tables; headings, code and bullets survive; prose wraps', () => {
  const report = ['## status', '', '| declared | live |', '| --- | --- |', '| 100 | 5 |', '', '```sql', 'SELECT 1', '```', '- a **bold** item'];
  assert.deepEqual(markdown(report.join('\n')).map(ascii), [
    'status',
    '',
    '+----------+------+',
    '| declared | live |',
    '+----------+------+',
    '| 100      | 5    |',
    '+----------+------+',
    '',
    '    SELECT 1',
    '- a bold item',
  ]);
  assert.deepEqual(markdown('- one two three four', 12).map(strip), ['- one two', '  three four']);
  assert.deepEqual(markdown('  - **a b** c', 40).map(strip), ['  - a b c']);
  assert.deepEqual(markdown('x **aa bb**', 5).map(strip), ['x aa', 'bb']); // a bold span wrapped across lines leaves no asterisks behind
});

test('the report comes out in ASCII, and a table too wide for the terminal becomes label: value lines', () => {
  assert.deepEqual(markdown('a \u2014 b \u00d7 c \u2026 \u201cd\u201d \u2018e\u2019').map(strip), ['a - b x c ... "d" \'e\'']);
  const wide = ['| declared | live |', '| --- | --- |', '| one hundred requests | five requests |'].join('\n');
  assert.deepEqual(markdown(wide, 20).map(strip), ['declared  one hundred requests', 'live      five requests']);
});

test('wrap keeps words whole where it can', () => {
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four']);
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(wrap('-> abcdefghij', 8), ['-> abcde', 'fghij']); // a long word fills the line it starts on
});
