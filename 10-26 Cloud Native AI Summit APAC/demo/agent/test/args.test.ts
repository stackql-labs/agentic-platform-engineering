import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireExactFlag } from '../src/cli.js';

test('offline and live entry points reject unknown and extra flags', () => {
  assert.doesNotThrow(() => requireExactFlag(['--offline'], '--offline', 'usage'));
  assert.throws(() => requireExactFlag(['--smoke'], '--offline', 'usage'), /usage/);
  assert.throws(() => requireExactFlag(['--offline', '--live-model'], '--offline', 'usage'), /usage/);
  assert.throws(() => requireExactFlag([], '--live-model', 'usage'), /usage/);
});
