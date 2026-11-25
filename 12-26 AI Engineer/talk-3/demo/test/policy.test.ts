import assert from 'node:assert/strict';
import { test } from 'node:test';

import { answersFor, check, CHECKS, normalise, statementId, type Approval, type Context, type Verdict } from '../src/policy.ts';

// offline: no model, no server, no cloud. The gate is a pure function.

const NOW = 1_800_000_000_000;
const GOOD = "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND TableName = 'customers'";
const DELETE = "DELETE FROM aws.dynamodb.tables WHERE region = 'ap-southeast-2' AND TableName = 'customers'";

const ctx = (over: Partial<Context> = {}): Context => ({
  region: 'ap-southeast-2',
  table: 'customers',
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

/** the four checks as one word each, in order: what the frame on screen shows */
const states = (v: Verdict): string => v.checks.map((c) => c.state).join(' ');

test('the write path is off: a good statement with no approval is held, not run', () => {
  const v = check(GOOD, ctx());
  assert.equal(v.outcome, 'held');
  assert.equal(v.rule, 'needs-a-person');
  assert.equal(states(v), 'ok ok ok waiting');
  assert.deepEqual(v.checks.map((c) => c.name), [...CHECKS]);
});

test('a named approval for this exact statement lets it through, and all four checks say so', () => {
  const v = check(GOOD, ctx({ approval: approval() }));
  assert.equal(v.outcome, 'allowed');
  assert.match(v.reason, /A\. Person/);
  assert.equal(states(v), 'ok ok ok ok');
});

test('an approval is bound to its statement, its window and one use', () => {
  const other = "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND table_name = 'customers'";
  assert.equal(check(other, ctx({ approval: approval() })).outcome, 'held', 'a different spelling is a different statement');
  assert.equal(check(GOOD, ctx({ approval: approval({ expiresAt: NOW }) })).outcome, 'held', 'expired');
  assert.equal(check(GOOD, ctx({ approval: approval({ used: true }) })).outcome, 'held', 'already used');
});

test('look first: no read, or a stale read, and the statement goes no further', () => {
  const none = check(GOOD, ctx({ look: undefined }));
  assert.equal(none.rule, 'look-first');
  assert.equal(states(none), 'ok ok no not-reached');
  assert.equal(check(GOOD, ctx({ look: { at: NOW - 121_000, protectionOn: false } })).rule, 'look-first');
  assert.equal(check(GOOD, ctx({ look: undefined, approval: approval() })).outcome, 'refused', 'an approval does not replace the look');
});

test('the end state already holds: nothing to do, whoever approved, and a person is not needed', () => {
  const on = { at: NOW - 1_000, protectionOn: true };
  const v = check(GOOD, ctx({ look: on }));
  assert.equal(v.outcome, 'noop');
  assert.equal(v.rule, 'already-so');
  assert.equal(states(v), 'ok ok ok not-reached');
  assert.equal(check(GOOD, ctx({ look: on, approval: approval() })).outcome, 'noop');
  assert.equal(check(GOOD, ctx({ look: on, approval: approval({ used: true }) })).outcome, 'noop', 'run it twice: the used approval is never reached');
});

test('never: a delete is refused at the first check, before anybody is asked, approval or not', () => {
  for (const sql of [DELETE, 'DROP TABLE customers', DELETE.toLowerCase().replace("'customers'", "'customers'"), 'TRUNCATE TABLE customers']) {
    const v = check(sql, ctx({ approval: approval({ statementId: statementId(sql) }) }));
    assert.equal(v.outcome, 'refused', sql);
    assert.equal(v.rule, 'never-delete', sql);
    assert.equal(states(v), 'no not-reached not-reached not-reached', sql);
  }
});

test('never: what the agent read does not come into it. The gate is given the statement, not the note', () => {
  // the same refusal with a fresh look, with protection already on, and with no look at all
  for (const look of [{ at: NOW - 1_000, protectionOn: false }, { at: NOW - 1_000, protectionOn: true }, undefined]) {
    assert.equal(check(DELETE, ctx({ look })).rule, 'never-delete');
  }
});

test('one door: only this resource, only this setting, only on', () => {
  const cases: Array<[string, string]> = [
    ["UPDATE aws.dynamodb.tables SET BillingMode = 'PROVISIONED' WHERE region = 'ap-southeast-2' AND TableName = 'customers'", 'one-door'],
    ["UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true, BillingMode = 'PROVISIONED' WHERE region = 'ap-southeast-2' AND TableName = 'customers'", 'one-door'],
    ["UPDATE aws.s3.buckets SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND TableName = 'customers'", 'one-door'],
    ["INSERT INTO aws.dynamodb.tables (region, TableName) SELECT 'ap-southeast-2', 'customers2'", 'one-door'],
    ["REPLACE aws.ssm.parameters SET Name = '/ops-notes/customers', Value = 'x', Type = 'String', Overwrite = true WHERE region = 'ap-southeast-2'", 'one-door'],
    ["UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = false WHERE region = 'ap-southeast-2' AND TableName = 'customers'", 'end-state'],
  ];
  for (const [sql, rule] of cases) {
    const v = check(sql, ctx({ approval: approval({ statementId: statementId(sql) }) }));
    assert.equal(v.outcome, 'refused', sql);
    assert.equal(v.rule, rule, sql);
    assert.equal(states(v), 'ok no not-reached not-reached', sql);
  }
});

test('one door: another table, another region, or a wider WHERE is refused', () => {
  for (const sql of [
    "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND TableName = 'orders'",
    "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'us-east-1' AND TableName = 'customers'",
    "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2'",
    "UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND TableName = 'customers' AND 1 = 1",
  ]) {
    assert.equal(check(sql, ctx()).rule, 'this-table-only', sql);
  }
});

test('never: one statement. Chaining and comments are refused', () => {
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
  assert.equal(answersFor(ask(GOOD.replace("'customers'", "'orders'")), approval(), NOW), false, 'a different statement');
  assert.equal(answersFor(ask(DELETE), approval(), NOW), false, 'a delete, with an approval for something else');
  assert.equal(answersFor(ask(GOOD), undefined, NOW), false, 'no approval');
  assert.equal(answersFor(ask(GOOD), approval({ used: true }), NOW), false, 'used');
  assert.equal(answersFor(ask(GOOD), approval(), NOW + 300_000), false, 'expired');
  assert.equal(answersFor('Approve something?', approval(), NOW), false, 'no statement in the question');
});
