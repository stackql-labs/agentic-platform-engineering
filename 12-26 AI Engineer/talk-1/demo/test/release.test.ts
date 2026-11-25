import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertSql, evidenceId, lookSql, parseLive, parseRoute, promoteSql, routeValue, short, toParams, type Param } from '../src/release.ts';

const DIGEST = `sha256:${'ab'.repeat(32)}`;

const preview = (route = 'none@0', revision = 1): Param[] => [
  { name: '/checkout-preview/live', value: `sha256:${'cd'.repeat(32)}`, version: 1 },
  { name: '/checkout-preview/candidate', value: route, version: revision },
];
const candidate = (over: Record<string, string> = {}): Param[] =>
  Object.entries({
    digest: DIGEST,
    source_repo: 'https://code.example.invalid/platform/checkout',
    source_ref: 'refs/heads/release/2026.12',
    builder: 'demo-ci',
    signer: 'demo-release-key',
    signature_valid: 'true',
    checks: 'unit=passed integration=passed policy=passed',
    findings: 'critical=0 high=0',
    release_note: 'a note',
    ...over,
  }).map(([k, v]) => ({ name: `/checkout-candidate/${k}`, value: v, version: 1 }));

test('two looks parse into one state', () => {
  const live = parseLive('checkout-preview', preview(), candidate());
  assert.ok(!('error' in live));
  assert.equal(live.route.digest, null);
  assert.equal(live.route.percent, 0);
  assert.equal(live.candidate.signature_valid, true);
  assert.deepEqual(live.candidate.checks, { unit: 'passed', integration: 'passed', policy: 'passed' });
  assert.deepEqual(live.candidate.findings, { critical: 0, high: 0 });
  assert.equal(live.params.length, 11);
});

test('missing state is an error, not a guess', () => {
  assert.ok('error' in parseLive('checkout-preview', [], candidate()));
  assert.ok('error' in parseLive('checkout-preview', preview(), candidate().filter((p) => !p.name.endsWith('/signer'))));
});

test('the route is one value: a digest and its share of traffic', () => {
  assert.deepEqual(parseRoute(routeValue(DIGEST, 10), 3), { digest: DIGEST, percent: 10, raw: `${DIGEST}@10`, revision: 3 });
  assert.equal(parseRoute('none@0', 1).digest, null);
});

test('the evidence id moves when any value or any revision moves', () => {
  const id = (p: Param[], c: Param[]) => {
    const live = parseLive('checkout-preview', p, c);
    assert.ok(!('error' in live));
    return evidenceId(live);
  };
  const base = id(preview(), candidate());
  assert.equal(id(preview(), candidate()), base);
  assert.notEqual(id(preview('none@0', 2), candidate()), base, 'a revision');
  assert.notEqual(id(preview(), candidate({ signer: 'someone-else' })), base, 'a value');
  assert.notEqual(id(preview(), candidate({ release_note: 'another note' })), base, 'even the untrusted note');
});

test('the statements the system renders', () => {
  assert.equal(lookSql('ap-southeast-2', '/checkout-preview'), "SELECT name, value, version FROM aws.ssm.parameters_by_paths WHERE region = 'ap-southeast-2' AND Path = '/checkout-preview'");
  assert.equal(
    promoteSql('ap-southeast-2', 'checkout-preview', DIGEST, 10),
    `REPLACE aws.ssm.parameters SET Name = '/checkout-preview/candidate', Value = '${DIGEST}@10', Type = 'String', Overwrite = true WHERE region = 'ap-southeast-2'`,
  );
  assert.match(assertSql('r', '/n', "it's"), /Value = 'it''s'/, 'a quote in a value is escaped');
});

test('rows from the server become parameters, and a digest has a short form', () => {
  assert.deepEqual(toParams([{ name: '/a/b', value: 'v', version: '3' }, { other: 1 }]), [{ name: '/a/b', value: 'v', version: 3 }]);
  assert.equal(short(DIGEST), 'sha256:abababab..abab');
  assert.equal(short(null), 'none');
});
