import assert from 'node:assert/strict';
import { test } from 'node:test';

import { check, freshPass, type GateState, type Verification } from '../src/policy.js';
import type { Cell } from '../src/cells.js';

// the estate where the talk starts: the canary is on the candidate, the rest are not
const cell = (name: string, region: string, wave: number, release: string): Cell => ({ name, region, wave, release, file: `cells/${name}.env` });
const NOW = 1_800_000_000_000;
const state = (over: Partial<GateState> = {}, releases: Record<string, string> = {}): GateState => ({
  cells: [
    cell('syd', 'ap-southeast-2', 0, releases.syd ?? '1.5.0'),
    cell('pdx', 'us-west-2', 1, releases.pdx ?? '1.4.0'),
    cell('fra', 'eu-central-1', 2, releases.fra ?? '1.4.0'),
  ],
  rollout: { service: 'orders', candidate: '1.5.0', previous: '1.4.0' },
  verified: [],
  now: NOW,
  freshnessMs: 600_000,
  ...over,
});
const pass = (name: string, ago = 1000, release = '1.5.0', passed = true): Verification => ({ cell: name, release, passed, at: NOW - ago });
const rule = (v: ReturnType<typeof check>) => (v.ok ? 'ok' : v.rule);

test('a cell the declaration does not name is declined, whatever is asked of it', () => {
  for (const action of ['test', 'converge', 'promote'] as const) {
    assert.equal(rule(check({ action, cell: 'prod', release: '1.5.0' }, state())), 'scope');
  }
  assert.equal(rule(check({ action: 'converge', cell: '' }, state())), 'scope');
});

test('testing or converging a declared cell passes policy and needs no verification of other cells', () => {
  for (const action of ['test', 'converge'] as const) {
    const v = check({ action, cell: 'syd' }, state());
    assert.ok(v.ok);
    assert.deepEqual(v.ok && v.verify, []);
  }
});

test('the model cannot choose the release: only the rollout candidate can be promoted', () => {
  assert.equal(rule(check({ action: 'promote', cell: 'pdx', release: '9.9.9' }, state())), 'candidate');
  assert.equal(rule(check({ action: 'promote', cell: 'pdx', release: '1.4.0' }, state())), 'candidate');
  assert.equal(rule(check({ action: 'promote', cell: 'pdx' }, state())), 'candidate');
});

test('promoting a cell that is already on the candidate is a no-op, not a promotion', () => {
  assert.equal(rule(check({ action: 'promote', cell: 'syd', release: '1.5.0' }, state())), 'no-op');
});

test('waves go in order: wave 2 cannot be promoted while wave 1 is still on the previous release', () => {
  const v = check({ action: 'promote', cell: 'fra', release: '1.5.0' }, state());
  assert.equal(rule(v), 'wave order');
  assert.match(v.ok ? '' : v.reason, /pdx \(wave 1\) is declared at 1\.4\.0/);
});

test('the next wave passes policy, and the gate is told to verify the waves in front of it itself', () => {
  const v = check({ action: 'promote', cell: 'pdx', release: '1.5.0' }, state());
  assert.ok(v.ok);
  assert.deepEqual(v.ok && v.verify.map((c) => c.name), ['syd']);
});

test('a fresh pass made by the gate counts; a stale one, a failed one or one at another release does not', () => {
  const verifyOf = (verified: Verification[]) => {
    const v = check({ action: 'promote', cell: 'pdx', release: '1.5.0' }, state({ verified }));
    return v.ok ? v.verify.map((c) => c.name) : ['declined'];
  };
  assert.deepEqual(verifyOf([pass('syd')]), []);
  assert.deepEqual(verifyOf([pass('syd', 601_000)]), ['syd']);
  assert.deepEqual(verifyOf([pass('syd', 1000, '1.5.0', false)]), ['syd']);
  assert.deepEqual(verifyOf([pass('syd', 1000, '1.4.0')]), ['syd']);
  // the newest check of a cell is the one that counts
  assert.deepEqual(verifyOf([pass('syd', 5000), pass('syd', 1000, '1.5.0', false)]), ['syd']);
  assert.equal(freshPass(state({ verified: [pass('syd')] }), state().cells[0], '1.5.0'), true);
});

test('one wave per run: after wave 1 is promoted, wave 2 waits for the next run', () => {
  const after = state({ promotedWave: 1, verified: [pass('syd'), pass('pdx')] }, { pdx: '1.5.0' });
  assert.equal(rule(check({ action: 'promote', cell: 'fra', release: '1.5.0' }, after)), 'one wave');
});

test('with every earlier wave on the candidate and no promotion yet this run, the last wave passes policy', () => {
  const v = check({ action: 'promote', cell: 'fra', release: '1.5.0' }, state({}, { pdx: '1.5.0' }));
  assert.ok(v.ok);
  assert.deepEqual(v.ok && v.verify.map((c) => c.name), ['syd', 'pdx']);
});

test('the first wave has nothing in front of it to verify', () => {
  const v = check({ action: 'promote', cell: 'syd', release: '1.5.0' }, state({}, { syd: '1.4.0' }));
  assert.ok(v.ok);
  assert.deepEqual(v.ok && v.verify, []);
});
