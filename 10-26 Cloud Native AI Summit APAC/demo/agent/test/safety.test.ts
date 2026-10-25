import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createFixture,
  dispatchTool,
  evidenceId,
  executeApprovedRepair,
  issueApproval,
  planImageRepair,
  resolveUncertainRepair,
} from '../src/safety.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(
  readFileSync(path.resolve(here, '../../../../11-26 AI Engineer/workshop/scenarios/policy-cases.json'), 'utf8'),
) as Array<{
  id: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  allowed: boolean;
  approval?: { approver: string; token: string };
}>;

test('shared policy contract covers valid and invalid calls in the fixture', () => {
  const state = createFixture();
  assert.equal(evidenceId(state).length, 64);
  for (const item of cases) {
    const args = structuredClone(item.arguments ?? {});
    if (args.evidence_id === 'fixture-evidence') args.evidence_id = evidenceId(state);
    const result = item.approval
      ? Boolean(item.approval.approver && item.approval.token === 'never-valid')
      : dispatchTool(item.tool ?? '', args, state).allowed;
    assert.equal(result, item.allowed, item.id);
  }
});

test('read-only identity cannot execute a repair, even with valid approval', () => {
  const state = createFixture();
  const plan = planImageRepair(state, state.approvedDesiredState.image);
  const approval = issueApproval(plan, 'facilitator', 1000, 300, 'nonce');
  assert.deepEqual(executeApprovedRepair(state, plan, approval, 'read_only', 2000), {
    status: 'denied',
    reason: 'read_only_identity_cannot_mutate',
  });
});

test('safe repair is plan-bound, fresh, single-use, and verified', () => {
  const state = createFixture();
  const plan = planImageRepair(state, state.approvedDesiredState.image);
  const approval = issueApproval(plan, 'facilitator', 1000, 300, 'nonce');
  assert.equal(executeApprovedRepair(state, plan, approval, 'read_only', 1500).status, 'denied');
  assert.deepEqual(executeApprovedRepair(state, plan, approval, 'safe', 2000), {
    status: 'verified',
    reason: 'approved_image_repair_verified',
  });
  assert.equal(state.image, state.approvedDesiredState.image);
  assert.deepEqual(
    state.audit.map((event) => event.event),
    ['policy_decision', 'approval', 'operation', 'verification'],
  );
  assert.deepEqual(executeApprovedRepair(state, plan, approval, 'safe', 2001).status, 'denied');
});

test('stale evidence, altered plan, expired approval, and failed verification deny or fail closed', () => {
  const state = createFixture();
  const plan = planImageRepair(state, state.approvedDesiredState.image);
  const approval = issueApproval(plan, 'facilitator', 1000, 10, 'nonce');
  state.resourceVersion = 'fixture-rv-18';
  assert.equal(executeApprovedRepair(state, plan, approval, 'safe', 2000).reason, 'stale_or_altered_plan');

  const fresh = createFixture();
  const freshPlan = planImageRepair(fresh, fresh.approvedDesiredState.image);
  const expired = issueApproval(freshPlan, 'facilitator', 1000, 1, 'expired');
  assert.equal(executeApprovedRepair(fresh, freshPlan, expired, 'safe', 3000).reason, 'missing_expired_or_invalid_approval');

  const alteredState = createFixture();
  const alteredPlan = planImageRepair(alteredState, alteredState.approvedDesiredState.image);
  const alteredApproval = issueApproval(alteredPlan, 'facilitator', 1000, 300, 'altered');
  assert.equal(
    executeApprovedRepair(alteredState, { ...alteredPlan, image: 'attacker/image:latest' }, alteredApproval, 'safe', 2000).status,
    'denied',
  );

  const verifyState = createFixture();
  const verifyPlan = planImageRepair(verifyState, verifyState.approvedDesiredState.image);
  const verifyApproval = issueApproval(verifyPlan, 'facilitator', 1000, 300, 'verify');
  assert.equal(executeApprovedRepair(verifyState, verifyPlan, verifyApproval, 'safe', 2000, false).status, 'failed');
});

test('approval requires a human identity and bounded expiry', () => {
  const state = createFixture();
  const plan = planImageRepair(state, state.approvedDesiredState.image);
  assert.throws(() => issueApproval(plan, '', 1000, 60, 'nonce'), /approver identity/);
  assert.throws(() => issueApproval(plan, 'facilitator', 1000, 301, 'nonce'), /expiry/);

  const valid = issueApproval(plan, 'facilitator', 1000, 60, 'nonce');
  assert.equal(
    executeApprovedRepair(state, plan, { ...valid, approver: 'different-operator' }, 'safe', 2000).reason,
    'missing_expired_or_invalid_approval',
  );
});

test('stale evidence and malformed tool arguments are denied before dispatch', () => {
  const state = createFixture();
  assert.equal(dispatchTool('propose_image_repair', {
    namespace: 'shop',
    name: 'checkout',
    image: state.approvedDesiredState.image,
    evidence_id: 'stale-evidence',
  }, state).allowed, false);
  assert.equal(dispatchTool('get_inventory', null, state).allowed, false);
});

test('uncertain mutation result is resolved by a fresh read without a duplicate operation', () => {
  const state = createFixture();
  const plan = planImageRepair(state, state.approvedDesiredState.image);
  state.image = state.approvedDesiredState.image;
  state.readyReplicas = state.desiredReplicas;
  state.resourceVersion = 'fixture-rv-18';
  assert.equal(resolveUncertainRepair(state, plan).status, 'verified');
  assert.equal(state.appliedPlans.size, 0);
  assert.equal(state.audit.at(-1)?.event, 'uncertain_outcome_verification');
});
