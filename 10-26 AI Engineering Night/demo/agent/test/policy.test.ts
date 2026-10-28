import assert from 'node:assert/strict';
import { test } from 'node:test';

import { check, firstDiff, rulesOf, type Declared } from '../src/policy.js';

const zoneId = '0123456789abcdef0123456789abcdef';
const rule = (threshold: number, description = 'edge-estate rate limit (managed by stackql-deploy)') => `[
  {
    "action": "block",
    "description": "${description}",
    "enabled": true,
    "expression": "(starts_with(http.request.uri.path, \\\\"/\\\\"))",
    "ratelimit": { "characteristics": ["ip.src", "cf.colo.id"], "period": 10, "requests_per_period": ${threshold}, "mitigation_timeout": 10 }
  }
]`;
const replace = (rules: string, zone = zoneId, phase = 'http_ratelimit') =>
  `REPLACE cloudflare.rulesets.phases SET rules = '${rules}' WHERE zone_id = '${zone}' AND ruleset_phase = '${phase}'`;

const declared: Declared = { sql: replace(rule(100)), zoneId, phase: 'http_ratelimit' };

test('the declared assertion passes, whatever the whitespace', () => {
  assert.deepEqual(check(declared.sql, declared), { ok: true });
  assert.deepEqual(check(`  ${declared.sql.replace(/\s+/g, '\n')} ;`, declared), { ok: true });
});

test('rulesOf unescapes the expression the way the SQL parser does', () => {
  const rules = rulesOf(declared.sql) as Array<{ expression: string }>;
  assert.equal(rules[0].expression, '(starts_with(http.request.uri.path, "/"))');
});

test('a different threshold is not the declaration', () => {
  const v = check(replace(rule(1000)), declared);
  assert.equal(v.ok, false);
  if (!v.ok) {
    assert.equal(v.rule, 'declaration');
    assert.match(v.reason, /requests_per_period: 1000 vs declared 100/);
  }
});

test('a different description is not the declaration', () => {
  const v = check(replace(rule(100, 'TEMP bot scare 03:12 - put back later')), declared);
  assert.equal(v.ok, false);
  if (!v.ok) assert.match(v.reason, /description/);
});

test('another zone is out of scope', () => {
  const v = check(replace(rule(100), 'ffffffffffffffffffffffffffffffff'), declared);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.rule, 'scope');
});

test('another phase is out of scope', () => {
  const v = check(replace(rule(100), zoneId, 'http_request_firewall_custom'), declared);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.rule, 'scope');
});

test('another resource, or another verb, is off the mutation surface', () => {
  for (const sql of [
    `DELETE FROM cloudflare.dns.records WHERE zone_id = '${zoneId}' AND dns_record_id = 'x'`,
    `UPDATE cloudflare.rulesets.phases SET rules = '[]' WHERE zone_id = '${zoneId}' AND ruleset_phase = 'http_ratelimit'`,
    `INSERT INTO cloudflare.dns.records(zone_id, name) SELECT '${zoneId}', 'x'`,
  ]) {
    const v = check(sql, declared);
    assert.equal(v.ok, false, sql);
    if (!v.ok) assert.equal(v.rule, 'mutation surface', sql);
  }
});

test('two statements are one too many', () => {
  const v = check(`${declared.sql}; ${declared.sql}`, declared);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.rule, 'one statement');
});

test('a rules value that is not JSON is declined, not thrown', () => {
  const v = check(replace('not json'), declared);
  assert.equal(v.ok, false);
  if (!v.ok) assert.equal(v.rule, 'declaration');
});

test('firstDiff names the first path that differs', () => {
  assert.equal(firstDiff({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] }), undefined);
  assert.equal(firstDiff({ a: 1, b: [1, 3] }, { a: 1, b: [1, 2] }), '$.b[1]: 3 vs declared 2');
  assert.equal(firstDiff({ a: 1 }, { a: 1, c: true }), '$.c: missing vs declared true');
});
