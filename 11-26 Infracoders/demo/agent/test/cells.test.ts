import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseCell, parseEnv, parseRollout, readCells, readRollout, withRelease } from '../src/cells.js';

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p: string[]) => readFileSync(path.join(demoRoot, ...p), 'utf8');

test('an env file is KEY=VALUE lines; comments, blanks and quotes do not get in', () => {
  assert.deepEqual(parseEnv('# a comment\n\nA=1\nexport B="two words"\n  C = no\nD=\'x\'\n'), { A: '1', B: 'two words', D: 'x' });
});

test('a cell needs a region, a wave and a release', () => {
  const c = parseCell('syd', 'CELL_REGION=ap-southeast-2\nCELL_WAVE=0\nCELL_RELEASE=1.5.0\n');
  assert.deepEqual({ ...c, file: undefined }, { name: 'syd', region: 'ap-southeast-2', wave: 0, release: '1.5.0', file: undefined });
  assert.throws(() => parseCell('x', 'CELL_REGION=r\nCELL_WAVE=0\n'), /CELL_RELEASE is not declared/);
  assert.throws(() => parseCell('x', 'CELL_REGION=r\nCELL_WAVE=soon\nCELL_RELEASE=1\n'), /not a wave number/);
});

test('a promotion changes one line of a cell file and nothing else', () => {
  const before = '# cell pdx\nCELL_REGION=us-west-2\nCELL_WAVE=1\nCELL_RELEASE=1.4.0\n';
  const after = withRelease(before, '1.5.0');
  assert.equal(after, before.replace('CELL_RELEASE=1.4.0', 'CELL_RELEASE=1.5.0'));
  assert.throws(() => withRelease('CELL_REGION=us-west-2\n', '1.5.0'), /no CELL_RELEASE line/);
});

test('the rollout names a service, a candidate and the release it replaces', () => {
  assert.deepEqual(parseRollout('ROLLOUT_SERVICE=orders\nROLLOUT_CANDIDATE=1.5.0\nROLLOUT_PREVIOUS=1.4.0\n'), { service: 'orders', candidate: '1.5.0', previous: '1.4.0' });
  assert.throws(() => parseRollout('ROLLOUT_SERVICE=orders\n'), /ROLLOUT_CANDIDATE is not declared/);
});

test('the checked-in declaration: three cells in wave order, one region and one wave each, no secrets', () => {
  const cells = readCells(path.join(demoRoot, 'cells'));
  assert.deepEqual(cells.map((c) => c.name), ['syd', 'pdx', 'fra']);
  assert.deepEqual(cells.map((c) => c.wave), [0, 1, 2]);
  assert.equal(new Set(cells.map((c) => c.region)).size, cells.length);
  const rollout = readRollout(path.join(demoRoot, 'rollout.env'));
  for (const c of cells) {
    assert.ok([rollout.candidate, rollout.previous].includes(c.release), `${c.name} is declared at ${c.release}`);
    assert.doesNotMatch(readFileSync(c.file, 'utf8'), /^\w*(KEY|SECRET|TOKEN|PASSWORD)\w*=/im); // no credential-shaped variable
  }
});

test('the stack asserts what the agent reads: same service name, same resources, every cell value from the cell file', () => {
  const manifest = read('stack', 'stackql_manifest.yml');
  const rollout = readRollout(path.join(demoRoot, 'rollout.env'));
  assert.match(manifest, new RegExp(`- name: service\\n\\s+value: ${rollout.service}\\n`));
  for (const v of ['CELL_REGION', 'CELL_WAVE', 'CELL_RELEASE']) assert.match(manifest, new RegExp(`\\{\\{ ${v} \\}\\}`));
  // a global and a resource with the same name collide in the template context
  const globals = [...manifest.split('resources:')[0].matchAll(/^ {2}- name: (\w+)$/gm)].map((m) => m[1]);
  const resources = [...manifest.split('resources:')[1].matchAll(/^ {2}- name: (\w+)$/gm)].map((m) => m[1]);
  assert.deepEqual(resources, ['table', 'table_guardrails', 'release']);
  assert.deepEqual(globals.filter((g) => resources.includes(g)), []);
  for (const r of resources) {
    const iql = read('stack', 'resources', `${r}.iql`);
    for (const anchor of ['exists', 'create', 'statecheck']) assert.match(iql, new RegExp(`^/\\*\\+ ${anchor}`, 'm'), `${r}.iql has no ${anchor} anchor`);
    assert.doesNotMatch(iql, /^\s*--/m, `${r}.iql has a full-line comment, which stackql-deploy passes to the CLI as a flag`);
  }
  // the posture the drift breaks is the posture the statecheck compares
  assert.match(read('stack', 'resources', 'table_guardrails.iql'), /deletion_protection_enabled = true/);
  assert.match(read('scripts', 'drift.sh'), /DeletionProtectionEnabled = false/);
});
