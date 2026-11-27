import assert from 'node:assert/strict';
import { test } from 'node:test';

import { commandLine, keep, summarise } from '../src/deploy.js';
import type { Cell } from '../src/cells.js';

const syd: Cell = { name: 'syd', region: 'ap-southeast-2', wave: 0, release: '1.5.0', file: 'cells/syd.env' };
const at = (level: string, msg: string) => `\x1b[2m[2026-11-10T09:23:10Z ${level} stackql_deploy]\x1b[0m ${msg}`;

test('the command line is fixed: the action, the stack, the cell and its own declaration file', () => {
  assert.deepEqual(commandLine('build', syd), ['build', 'stack', 'syd', '--env-file', 'cells/syd.env']);
  assert.deepEqual(commandLine('test', syd), ['test', 'stack', 'syd', '--env-file', 'cells/syd.env']);
});

test('the stream keeps what stackql-deploy decided and drops the rest', () => {
  assert.equal(keep(at('INFO', '[table] exists')), '[table] exists');
  assert.equal(keep(at('INFO', '[table_guardrails] is not in the desired state')), '[table_guardrails] is not in the desired state');
  assert.equal(keep(at('INFO', 'updating [table_guardrails]...')), 'updating [table_guardrails]...');
  assert.equal(keep(at('ERROR', 'test failed for table_guardrails.')), 'test failed for table_guardrails.');
  assert.equal(keep(at('INFO', 'deployment completed in 4.49s')), 'deployment completed in 4.49s');
  for (const noise of [
    at('INFO', 'Starting stackql server with PID: 25252'),
    at('INFO', 'running exists check for [table]...'),
    at('WARN', 'retries exhausted for [table_guardrails], last rendered query:'),
    'SELECT COUNT(*) AS count',
    '\u2502 Processing resource: [table] \u2502',
    'Connected to stackql server at localhost:5444',
  ]) {
    assert.equal(keep(noise), undefined, noise);
  }
});

test('a converged cell: nothing changed, nothing failed', () => {
  const lines = ['[table] exists', '[table] is in the desired state', '[release] exists', '[release] is in the desired state'];
  assert.deepEqual(summarise(lines, 0), { ok: true, changed: [], failed: [] });
});

test('a drifted cell, built: the update shows as a change and the last word on the resource wins', () => {
  const lines = [
    '[table_guardrails] exists',
    '[table_guardrails] is not in the desired state',
    'updating [table_guardrails]...',
    '[table_guardrails] exists',
    '[table_guardrails] is in the desired state',
  ];
  assert.deepEqual(summarise(lines, 0), { ok: true, changed: ['table_guardrails'], failed: [] });
});

test('a drifted cell, tested: the resource is named and the check fails', () => {
  const lines = ['[table] is in the desired state', 'test passed for table', '[table_guardrails] is not in the desired state', 'test failed for table_guardrails.'];
  assert.deepEqual(summarise(lines, 1), { ok: false, changed: [], failed: ['table_guardrails'] });
});

test('a non-zero exit is a failure even when no resource was named', () => {
  assert.deepEqual(summarise([], 1), { ok: false, changed: [], failed: [] });
});
