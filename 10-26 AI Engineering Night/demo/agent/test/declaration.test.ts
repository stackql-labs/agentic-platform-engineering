import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertion, readManifest } from '../src/declaration.js';
import { check, firstDiff, rulesOf } from '../src/policy.js';

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const zoneId = '0123456789abcdef0123456789abcdef';
const manifest = readManifest(path.join(demoRoot, 'stack', 'stackql_manifest.yml'));

/** the createorupdate anchor of rate_limit.iql, rendered the way stackql-deploy renders it */
function iqlAssertion(): string {
  const iql = readFileSync(path.join(demoRoot, 'stack', 'resources', 'rate_limit.iql'), 'utf8');
  const m = iql.match(/\/\*\+ createorupdate \*\/([\s\S]*?)(?=\/\*\+)/);
  assert.ok(m, 'rate_limit.iql has a createorupdate anchor');
  const vars: Record<string, string> = {
    zone_id: zoneId,
    ruleset_phase: manifest.phase,
    description: manifest.description,
    threshold: String(manifest.threshold),
    period: String(manifest.period),
  };
  return m[1].replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? assert.fail(`no value for {{ ${k} }}`)).trim();
}

test('the manifest declares the rule the demo talks about', () => {
  assert.equal(manifest.phase, 'http_ratelimit');
  assert.equal(manifest.threshold, 100);
  assert.equal(manifest.period, 10);
  assert.ok(manifest.description);
});

test('the .iql anchor and the rendered assertion are the same rule, field for field', () => {
  const rendered = assertion(zoneId, manifest.phase, manifest);
  const iql = iqlAssertion();
  assert.equal(firstDiff(rulesOf(iql), rulesOf(rendered)), undefined);
  assert.deepEqual(check(iql, { sql: rendered, zoneId, phase: manifest.phase }), { ok: true });
  assert.deepEqual(check(rendered, { sql: iql, zoneId, phase: manifest.phase }), { ok: true });
});

test('both escape the expression quotes for the SQL parser, as \\\\"/\\\\"', () => {
  for (const sql of [iqlAssertion(), assertion(zoneId, manifest.phase, manifest)]) assert.match(sql, /\\\\"\/\\\\"/);
});
