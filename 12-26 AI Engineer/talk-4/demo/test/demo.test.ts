import assert from 'node:assert/strict';
import test from 'node:test';
import OpenAI from 'openai';
import { fixtureTurn, investigate, modelTurn, selectModel } from '../src/agent.ts';
import { parseRule, repairSql } from '../src/cloud.ts';
import { fixture } from '../src/fixture.ts';
import { desired, planFor, recover, type Estate } from '../src/policy.ts';

async function evidence(estate: Estate) {
  return { rule: await estate.rule(), traffic: await estate.traffic(), declaration: await estate.declaration(), firstRead: Date.now() };
}
const proposal = { target: 'demo.example', threshold: 100 };
async function fixturePlan(estate: Estate) { return planFor(proposal, await evidence(estate), estate.target); }
const quiet = () => {};

test('fixture repairs once and the second investigation sends no write', async () => {
  const estate = fixture();
  const lines: string[] = [];
  const plan = await investigate(estate, fixtureTurn(estate.target), s => lines.push(s));
  assert.ok(plan);
  assert.equal((await estate.rule()).threshold, 5);
  assert.ok(lines.some(s => s.startsWith('BLOCKED')));
  assert.equal(await recover(estate, plan, async () => true, quiet), true);
  assert.deepEqual(await estate.probe(), [{ status: 200, requests: 30 }]);
  assert.equal(await investigate(estate, fixtureTurn(estate.target), quiet), undefined);
});

test('policy requires observed drift, a fresh declaration, traffic and the right target', async () => {
  const estate = fixture();
  const seen = await evidence(estate);
  for (const bad of [{}, { ...seen, traffic: [] }, { ...seen, firstRead: 0 },
    { ...seen, declaration: { ...seen.declaration, committed: 'unknown' } },
    { ...seen, rule: { ...seen.rule, enabled: false } },
    { ...seen, rule: { ...seen.rule, target: 'other.example' } }]) {
    assert.throws(() => planFor(proposal, bad, estate.target));
  }
  assert.throws(() => planFor({ ...proposal, threshold: 1000 }, seen, estate.target));
  assert.throws(() => planFor({ ...proposal, target: 'other.example' }, seen, estate.target));
});

test('refused, changed and expired plans cannot write', async () => {
  const estate = fixture();
  const plan = await fixturePlan(estate);
  estate.write = async () => assert.fail('Unexpected write');
  assert.equal(await recover(estate, plan, async () => false, quiet), false);
  const other = { ...plan.rule, revision: 'somebody-edited-this' };
  await assert.rejects(recover({ ...estate, rule: async () => other }, plan, async () => true, quiet), /stale/);
  await assert.rejects(recover(estate, { ...plan, issued: 0 }, async () => true, quiet), /stale/);
  const declaration = { ...plan.declaration, revision: 'different' };
  await assert.rejects(recover({ ...estate, declaration: async () => declaration }, plan, async () => true, quiet), /Declaration changed/);
});

test('unknown write outcome is read back with no blind retry', async () => {
  for (const applied of [true, false]) {
    const estate = fixture();
    const plan = await fixturePlan(estate);
    const apply = estate.write;
    let attempts = 0;
    estate.write = async rule => { attempts++; if (applied) await apply(rule); throw new Error('timeout'); };
    const result = recover(estate, plan, async () => true, quiet);
    if (applied) assert.equal(await result, true);
    else await assert.rejects(result, /Could not verify/);
    assert.equal(attempts, 1);
  }
});

test('model family is explicit', () => {
  assert.equal(selectModel(), 'gpt-6-luna');
  assert.equal(selectModel('gpt-6.2-astra'), 'gpt-6.2-astra');
  for (const invalid of ['gpt-5', 'auto', 'gpt-6-', '']) assert.throws(() => selectModel(invalid));
});

test('official Responses SDK executes the tool loop against scripted HTTP responses', async () => {
  const estate = fixture();
  let count = 0;
  const calls = [
    ['inspect', { source: 'traffic', question: 'Which responses were refused?' }],
    ['inspect', { source: 'rule', question: 'What limit was active?' }],
    ['inspect', { source: 'declaration', question: 'What did the team approve?' }],
    ['propose', { target: estate.target, threshold: 100, finding: 'The rule is tighter than declared.' }],
  ] as const;
  const client = new OpenAI({ apiKey: 'offline-example', baseURL: 'http://offline.invalid/v1', maxRetries: 0,
    fetch: async (url, init) => {
      assert.equal(String(url), 'http://offline.invalid/v1/responses');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'gpt-6-luna');
      assert.equal(body.store, false);
      if (count) assert.equal(body.input.at(-1).call_id, 'call-' + (count - 1));
      const [name, args] = calls[count];
      const output = [{ type: 'function_call', call_id: 'call-' + count, name, arguments: JSON.stringify(args), status: 'completed' }];
      count++;
      return new Response(JSON.stringify({ id: 'resp-' + count, object: 'response', status: 'completed', output }), { headers: { 'content-type': 'application/json' } });
    } });
  const plan = await investigate(estate, modelTurn(client, 'gpt-6-luna', estate.target), quiet);
  assert.ok(plan);
  assert.equal(count, 4);
  assert.equal((await estate.rule()).threshold, 5);
});

test('the Cloudflare update preserves the named rule and targets only its own rule ID', () => {
  const zone = 'a'.repeat(32), set = 'b'.repeat(32), id = 'c'.repeat(32);
  const rule = { id, ref: desired.ref, description: desired.description, enabled: true, action: 'block', expression: '(http.request.uri.path eq "/talk4-check")',
    last_updated: '2026-12-08T03:00:00Z', ratelimit: { characteristics: ['ip.src','cf.colo.id'], period: 10, mitigation_timeout: 10, requests_per_period: 5 } };
  const parsed = parseRule([{ id: set, rules: JSON.stringify([rule, { id: 'sibling' }]) }], 'demo.example', id);
  const sql = repairSql(zone, parsed);
  assert.match(sql, /^UPDATE cloudflare\.rulesets\.rules SET/);
  for (const value of [zone, set, id, desired.description, desired.ref, 'enabled = true', '"requests_per_period":100']) assert.ok(sql.includes(value));
  for (const bad of [{ ...rule, enabled: false }, { ...rule, action_parameters: {} }, { ...rule, ref: 'other' }, { ...rule, ratelimit: { ...rule.ratelimit, counting_expression: 'custom' } }]) {
    assert.throws(() => parseRule([{ id: set, rules: [bad] }], 'demo.example', id));
  }
});
