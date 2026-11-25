import assert from 'node:assert/strict';
import { test } from 'node:test';

import { answersFor, check, normalise, statementId, type Approval, type Context } from '../src/policy.ts';

// offline: no model, no server, no cloud. The gate is a pure function.

const NOW = 1_800_000_000_000;
const GOOD = "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND TableName = 'orders'";

const ctx = (over: Partial<Context> = {}): Context => ({
  region: 'ap-southeast-2',
  table: 'orders',
  now: NOW,
  freshnessMs: 120_000,
  look: { at: NOW - 5_000, protectionOn: false },
  ...over,
});

const approval = (over: Partial<Approval> = {}): Approval => ({
  approver: 'A. Person',
  statementId: statementId(GOOD),
  approvedAt: NOW - 1_000,
  expiresAt: NOW + 299_000,
  ...over,
});

test('the write path is off: a good statement with no approval is held, not run', () => {
  const v = check(GOOD, ctx());
  assert.equal(v.outcome, 'held');
  assert.equal(v.rule, 'needs-a-person');
});

test('a named approval for this exact statement lets it through', () => {
  const v = check(GOOD, ctx({ approval: approval() }));
  assert.equal(v.outcome, 'allowed');
  assert.match(v.reason, /A\. Person/);
});

test('an approval is bound to its statement, its window and one use', () => {
  const other = "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND table_name = 'orders'";
  assert.equal(check(other, ctx({ approval: approval() })).outcome, 'held', 'a different spelling is a different statement');
  assert.equal(check(GOOD, ctx({ approval: approval({ expiresAt: NOW }) })).outcome, 'held', 'expired');
  assert.equal(check(GOOD, ctx({ approval: approval({ used: true }) })).outcome, 'held', 'already used');
});

test('look first: no read, or a stale read, and the statement goes no further', () => {
  assert.equal(check(GOOD, ctx({ look: undefined })).rule, 'look-first');
  assert.equal(check(GOOD, ctx({ look: { at: NOW - 121_000, protectionOn: false } })).rule, 'look-first');
  assert.equal(check(GOOD, ctx({ look: undefined, approval: approval() })).outcome, 'refused', 'an approval does not replace the look');
});

test('the end state already holds: nothing to do, whoever approved', () => {
  const on = { at: NOW - 1_000, protectionOn: true };
  assert.equal(check(GOOD, ctx({ look: on })).outcome, 'noop');
  assert.equal(check(GOOD, ctx({ look: on, approval: approval() })).outcome, 'noop');
});

test('never-delete: refused before anybody is asked, approval or not', () => {
  for (const sql of [
    "DELETE FROM aws.dynamodb.tables WHERE region = 'ap-southeast-2' AND TableName = 'orders'",
    'DROP TABLE orders',
    "delete from aws.dynamodb.tables where region = 'ap-southeast-2' and TableName = 'orders'",
  ]) {
    const v = check(sql, ctx({ approval: approval({ statementId: statementId(sql) }) }));
    assert.equal(v.outcome, 'refused', sql);
    assert.equal(v.rule, 'never-delete', sql);
  }
});

test('one door: only this resource, only this setting, only on', () => {
  const cases: Array<[string, string]> = [
    ["UPDATE aws.dynamodb.tables SET BillingMode = 'PROVISIONED' WHERE region = 'ap-southeast-2' AND TableName = 'orders'", 'one-door'],
    ["UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true, BillingMode = 'PROVISIONED' WHERE region = 'ap-southeast-2' AND TableName = 'orders'", 'one-door'],
    ["UPDATE aws.s3.buckets SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND TableName = 'orders'", 'one-door'],
    ["INSERT INTO aws.dynamodb.tables (region, TableName) SELECT 'ap-southeast-2', 'orders2'", 'one-door'],
    ["UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = false WHERE region = 'ap-southeast-2' AND TableName = 'orders'", 'end-state'],
  ];
  for (const [sql, rule] of cases) {
    const v = check(sql, ctx({ approval: approval({ statementId: statementId(sql) }) }));
    assert.equal(v.outcome, 'refused', sql);
    assert.equal(v.rule, rule, sql);
  }
});

test('this table only: another table, another region, or a wider WHERE is refused', () => {
  for (const sql of [
    "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND TableName = 'payments'",
    "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'us-east-1' AND TableName = 'orders'",
    "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2'",
    "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND TableName = 'orders' AND 1 = 1",
  ]) {
    assert.equal(check(sql, ctx()).rule, 'this-table-only', sql);
  }
});

test('one statement: chaining and comments are refused', () => {
  assert.equal(check(`${GOOD}; ${GOOD}`, ctx()).rule, 'one-statement');
  assert.equal(check(`${GOOD} -- and the rest`, ctx()).rule, 'one-statement');
  assert.equal(check(`${GOOD};`, ctx()).outcome, 'held', 'one trailing semicolon is the same statement');
});

test('a statement keeps its identity across whitespace, and loses it across any other change', () => {
  assert.equal(statementId(`  ${GOOD.replace(/ /g, '\n  ')} ;`), statementId(GOOD));
  assert.notEqual(statementId(GOOD.replace('true', 'false')), statementId(GOOD));
  assert.equal(normalise('a\n  b ;'), 'a b');
});

test("the server's question is answered yes only for the approved statement", () => {
  const ask = (sql: string) => `Approve run_mutation_query (mutation_create)?\n\nSQL: ${sql}`;
  assert.equal(answersFor(ask(GOOD), approval(), NOW), true);
  assert.equal(answersFor(ask(GOOD.replace("'orders'", "'payments'")), approval(), NOW), false, 'a different statement');
  assert.equal(answersFor(ask(GOOD), undefined, NOW), false, 'no approval');
  assert.equal(answersFor(ask(GOOD), approval({ used: true }), NOW), false, 'used');
  assert.equal(answersFor(ask(GOOD), approval(), NOW + 300_000), false, 'expired');
  assert.equal(answersFor('Approve something?', approval(), NOW), false, 'no statement in the question');
});
