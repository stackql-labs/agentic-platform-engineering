import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface FixtureState {
  namespace: string;
  name: string;
  label: { key: string; value: string };
  resourceVersion: string;
  image: string;
  desiredReplicas: number;
  readyReplicas: number;
  waitingReason: string;
  event: string;
  approvedDesiredState: { image: string; desired_replicas: number };
  appliedPlans: Set<string>;
  correlationId: string;
  audit: AuditEvent[];
}

export interface AuditEvent {
  correlation_id: string;
  timestamp: string;
  event: string;
  decision: string;
  reason: string;
  details: Record<string, unknown>;
}

export interface RepairPlan {
  operation: 'repair_deployment_image';
  namespace: string;
  name: string;
  expectedResourceVersion: string;
  expectedImage: string;
  image: string;
  evidenceId: string;
  digest: string;
}

export interface Approval {
  approver: string;
  planDigest: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  token: string;
}

interface FixtureFile {
  scope: { namespace: string; name: string; label: { key: string; value: string } };
  observed: {
    resource_version: string;
    image: string;
    desired_replicas: number;
    ready_replicas: number;
    waiting_reason: string;
    event: string;
  };
  approved_desired_state: { image: string; desired_replicas: number };
}

const scenario = JSON.parse(
  readFileSync(
    process.env.SCENARIO_PATH ?? new URL('../../../../workshop/scenarios/fixture.json', import.meta.url),
    'utf8',
  ),
) as FixtureFile;

export function createFixture(): FixtureState {
  const { scope, observed, approved_desired_state: desired } = scenario;
  return {
    namespace: scope.namespace,
    name: scope.name,
    label: { ...scope.label },
    resourceVersion: observed.resource_version,
    image: observed.image,
    desiredReplicas: observed.desired_replicas,
    readyReplicas: observed.ready_replicas,
    waitingReason: observed.waiting_reason,
    event: observed.event,
    approvedDesiredState: { ...desired },
    appliedPlans: new Set<string>(),
    correlationId: randomUUID(),
    audit: [],
  };
}

function record(
  state: FixtureState,
  event: string,
  decision: string,
  reason: string,
  details: Record<string, unknown> = {},
): void {
  state.audit.push({
    correlation_id: state.correlationId,
    timestamp: new Date().toISOString(),
    event,
    decision,
    reason,
    details,
  });
}

export function recordApprovalDenial(state: FixtureState, plan: RepairPlan, reason: string): void {
  record(state, 'approval', 'denied', reason, { plan_digest: plan.digest });
}

export function recordPolicyDenial(state: FixtureState, reason: string): void {
  record(state, 'policy_decision', 'denied', reason, { operation: 'repair_deployment_image' });
}

export function dispatchTool(
  name: string,
  args: unknown,
  state: FixtureState,
): { allowed: boolean; result: unknown; plan?: RepairPlan; terminal: boolean } {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    record(state, 'tool_policy', 'denied', 'arguments_must_be_object', { tool: name });
    return { allowed: false, result: { status: 'denied', reason: 'arguments_must_be_object' }, terminal: true };
  }
  const input = args as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  if (name === 'get_inventory' && keys.join(',') === 'namespace' && input.namespace === 'shop') {
    record(state, 'evidence_read', 'allowed', 'scoped_inventory_read', { evidence_id: evidenceId(state) });
    return {
      allowed: true,
      result: {
        status: 'ok',
        evidence_id: evidenceId(state),
        inventory: {
          namespace: state.namespace,
          name: state.name,
          resource_version: state.resourceVersion,
          image: state.image,
          desired_replicas: state.desiredReplicas,
          ready_replicas: state.readyReplicas,
          waiting_reason: state.waitingReason,
          event: state.event,
        },
      },
      terminal: false,
    };
  }
  if (name === 'get_desired_state' && keys.join(',') === 'name' && input.name === 'checkout') {
    record(state, 'desired_state_read', 'allowed', 'approved_fixture_baseline', { name: 'checkout' });
    return { allowed: true, result: { status: 'ok', desired: state.approvedDesiredState }, terminal: false };
  }
  if (
    name === 'propose_image_repair' &&
    keys.join(',') === 'evidence_id,image,name,namespace' &&
    input.namespace === 'shop' &&
    input.name === 'checkout' &&
    input.image === state.approvedDesiredState.image &&
    input.evidence_id === evidenceId(state)
  ) {
    const plan = planImageRepair(state, input.image);
    record(state, 'plan_proposed', 'approval_required', 'exact_image_repair', { plan_digest: plan.digest });
    return { allowed: true, result: { status: 'approval_required', plan }, plan, terminal: true };
  }
  record(state, 'tool_policy', 'denied', 'unknown_tool_or_invalid_arguments', { tool: name });
  return { allowed: false, result: { status: 'denied', reason: 'unknown_tool_or_invalid_arguments' }, terminal: true };
}

export function evidenceId(state: FixtureState): string {
  return createHash('sha256')
    .update(JSON.stringify([state.namespace, state.name, state.resourceVersion, state.image, state.readyReplicas]))
    .digest('hex');
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function planImageRepair(state: FixtureState, image: string): RepairPlan {
  if (
    state.namespace !== 'shop' ||
    state.name !== 'checkout' ||
    state.label.key !== 'purpose' ||
    state.label.value !== 'agentic-demo' ||
    image !== state.approvedDesiredState.image
  ) {
    throw new Error('Policy denied: target or image is outside the approved scope.');
  }
  const fields = {
    operation: 'repair_deployment_image' as const,
    namespace: state.namespace,
    name: state.name,
    expectedResourceVersion: state.resourceVersion,
    expectedImage: state.image,
    image,
    evidenceId: evidenceId(state),
  };
  return { ...fields, digest: digest(fields) };
}

export function issueApproval(
  plan: { digest: string },
  approver: string,
  now: number,
  ttlSeconds: number,
  nonce: string,
): Approval {
  if (!approver.trim()) throw new Error('Policy denied: approver identity is required.');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
    throw new Error('Policy denied: approval expiry must be between 1 and 300 seconds.');
  }
  const issuedAt = now;
  const expiresAt = now + ttlSeconds * 1000;
  const binding = { approver: approver.trim(), planDigest: plan.digest, issuedAt, expiresAt, nonce };
  return { ...binding, token: digest(binding) };
}

export function executeApprovedRepair(
  state: FixtureState,
  plan: RepairPlan,
  approval: Approval,
  mode: 'read_only' | 'safe',
  now: number,
  verify = true,
): { status: 'verified' | 'denied' | 'failed'; reason: string } {
  const denied = (reason: string): { status: 'denied'; reason: string } => {
    record(state, 'policy_decision', 'denied', reason, { operation: 'repair_deployment_image' });
    return { status: 'denied', reason };
  };
  if (mode === 'read_only') return denied('read_only_identity_cannot_mutate');
  if (
    plan.operation !== 'repair_deployment_image' ||
    plan.namespace !== 'shop' ||
    plan.name !== 'checkout' ||
    plan.image !== state.approvedDesiredState.image
  ) return denied('out_of_scope_or_altered_plan');
  const canonical = planImageRepair(state, plan.image);
  if (canonical.digest !== plan.digest || plan.evidenceId !== evidenceId(state)) {
    return denied('stale_or_altered_plan');
  }
  const binding = {
    approver: approval.approver,
    planDigest: approval.planDigest,
    issuedAt: approval.issuedAt,
    expiresAt: approval.expiresAt,
    nonce: approval.nonce,
  };
  if (
    !approval.approver.trim() ||
    approval.planDigest !== plan.digest ||
    approval.expiresAt <= now ||
    approval.issuedAt > now ||
    approval.expiresAt - approval.issuedAt > 300_000 ||
    approval.token !== digest(binding)
  ) {
    return denied('missing_expired_or_invalid_approval');
  }
  if (state.appliedPlans.has(plan.digest)) return denied('duplicate_execution_denied');

  record(state, 'approval', 'accepted', 'exact_plan_approved', {
    plan_digest: plan.digest,
    approver: approval.approver,
    expires_at: new Date(approval.expiresAt).toISOString(),
  });
  state.appliedPlans.add(plan.digest);
  record(state, 'operation', 'started', 'single_narrow_fixture_change', { plan_digest: plan.digest });
  state.image = plan.image;
  state.resourceVersion = `fixture-rv-${Number(state.resourceVersion.split('-').at(-1)) + 1}`;
  state.readyReplicas = state.desiredReplicas;
  state.waitingReason = '';
  state.event = 'Synthetic fixture: repaired image observed.';
  if (!verify || state.image !== state.approvedDesiredState.image || state.readyReplicas !== state.desiredReplicas) {
    record(state, 'verification', 'failed', 'post_change_verification_failed', { plan_digest: plan.digest });
    return { status: 'failed', reason: 'post_change_verification_failed' };
  }
  record(state, 'verification', 'passed', 'approved_image_repair_verified', {
    resource_version: state.resourceVersion,
    ready_replicas: state.readyReplicas,
  });
  return { status: 'verified', reason: 'approved_image_repair_verified' };
}

export function resolveUncertainRepair(
  state: FixtureState,
  plan: RepairPlan,
): { status: 'verified' | 'failed'; reason: string } {
  const verified =
    state.namespace === plan.namespace &&
    state.name === plan.name &&
    state.image === plan.image &&
    state.image === state.approvedDesiredState.image &&
    state.readyReplicas === state.desiredReplicas;
  const result = verified
    ? { status: 'verified' as const, reason: 'uncertain_operation_confirmed_by_fresh_read' }
    : { status: 'failed' as const, reason: 'uncertain_operation_not_verified_no_retry' };
  record(state, 'uncertain_outcome_verification', result.status, result.reason, {
    plan_digest: plan.digest,
    resource_version: state.resourceVersion,
  });
  return result;
}
