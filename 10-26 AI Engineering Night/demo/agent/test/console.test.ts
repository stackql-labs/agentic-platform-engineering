import assert from 'node:assert/strict';
import { test } from 'node:test';

import { box, markdown, strip, table, wrap } from '../src/console.js';

test('a box is rectangular, whatever the content', () => {
  const lines = box(['short', 'a much longer line of text'], 'title').map(strip);
  for (const l of lines) assert.equal(l.length, lines[0].length, l);
  assert.match(lines[0], /^\+-- title -+\+$/);
  assert.match(lines[lines.length - 1], /^\+-+\+$/);
});

test('a table aligns its columns', () => {
  const lines = table(['a', 'bb'], [['1', '22'], ['333', '4']]).map(strip);
  assert.deepEqual(lines, ['+-----+----+', '| a   | bb |', '+-----+----+', '| 1   | 22 |', '| 333 | 4  |', '+-----+----+']);
});

test('markdown tables become ASCII tables; headings, code and bullets survive', () => {
  const report = ['## status', '', '| declared | live |', '| --- | --- |', '| 100 | 5 |', '', '```sql', 'SELECT 1', '```', '- a **bold** item'];
  assert.deepEqual(markdown(report.join('\n')).map(strip), [
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
});

test('the report comes out in ASCII, and a table too wide for the terminal becomes label: value lines', () => {
  assert.deepEqual(markdown('a — b × c … “d” ‘e’').map(strip), ['a - b x c ... "d" \'e\'']);
  const wide = ['| declared | live |', '| --- | --- |', '| one hundred requests | five requests |'].join('\n');
  assert.deepEqual(markdown(wide, 20).map(strip), ['declared  one hundred requests', 'live      five requests']);
});

test('wrap keeps words whole where it can', () => {
  assert.deepEqual(wrap('one two three four', 9), ['one two', 'three', 'four']);
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
});
