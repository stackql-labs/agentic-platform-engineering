import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/release.json', import.meta.url), 'utf8'),
);

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function record(state, event, decision, reason, details = {}) {
  state.audit.push({
    correlation_id: state.correlationId,
    event,
    decision,
    reason,
    details,
  });
}

export function createState() {
  return {
    scenarioId: fixture.scenario_id,
    environment: structuredClone(fixture.environment),
    candidate: structuredClone(fixture.candidate),
    policy: structuredClone(fixture.policy),
    appliedPlans: new Set(),
    correlationId: randomUUID(),
    audit: [],
  };
}

export function evidenceId(state) {
  return hash([
    state.scenarioId,
    state.environment.target,
    state.environment.revision,
    state.environment.current_digest,
    state.candidate,
  ]);
}

function candidateDenial(state) {
  const { candidate, policy } = state;
  if (!/^sha256:[a-f0-9]{64}$/.test(candidate.digest)) return 'invalid_candidate_digest';
  if (candidate.source_repo !== policy.source_repo) return 'unapproved_source_repository';
  if (candidate.source_ref !== policy.source_ref) return 'unapproved_source_ref';
  if (candidate.builder !== policy.builder) return 'unapproved_builder';
  if (candidate.signer !== policy.signer || candidate.signature_valid !== true) {
    return 'candidate_provenance_not_approved';
  }
  if (!policy.required_checks.every((check) => candidate.checks[check] === 'passed')) {
    return 'required_check_not_passed';
  }
  if (
    !Number.isInteger(candidate.findings?.critical) ||
    !Number.isInteger(candidate.findings?.high) ||
    candidate.findings.critical < 0 ||
    candidate.findings.high < 0
  ) {
    return 'invalid_findings_summary';
  }
  if (candidate.findings.critical > policy.max_critical_findings || candidate.findings.high > policy.max_high_findings) {
    return 'finding_threshold_exceeded';
  }
  return undefined;
}

function planFields(state, request) {
  const expectedKeys = ['digest', 'evidence_id', 'target', 'traffic_percent'];
  if (
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    Object.keys(request).sort().join(',') !== expectedKeys.join(',')
  ) {
    return { error: 'invalid_proposal_shape' };
  }
  const denial = candidateDenial(state);
  if (denial) return { error: denial };
  if (
    request.target !== state.policy.target ||
    request.digest !== state.candidate.digest ||
    request.traffic_percent !== state.policy.allowed_traffic_percent
  ) {
    return { error: 'proposal_outside_release_policy' };
  }
  if (request.evidence_id !== evidenceId(state)) return { error: 'stale_or_invalid_evidence' };

  return {
    fields: {
      target: state.environment.target,
      operation: 'promote_candidate_to_preview',
      expectedRevision: state.environment.revision,
      expectedDigest: state.environment.current_digest,
      candidateDigest: state.candidate.digest,
      trafficPercent: state.policy.allowed_traffic_percent,
      evidenceId: evidenceId(state),
    },
  };
}

function denied(state, reason, event = 'policy_decision') {
  record(state, event, 'denied', reason);
  return { status: 'denied', reason };
}

export function proposePromotion(state, request) {
  const result = planFields(state, request);
  if (result.error) return denied(state, result.error);

  const plan = { ...result.fields, digest: hash(result.fields) };
  record(state, 'plan_proposed', 'approval_required', 'bounded_preview_promotion', {
    plan_digest: plan.digest,
    candidate_digest: plan.candidateDigest,
  });
  return { status: 'approval_required', plan };
}

export function issueApproval(plan, approver, now, ttlSeconds, nonce) {
  if (typeof approver !== 'string' || !approver.trim()) {
    throw new Error('Approver identity is required.');
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
    throw new Error('Approval expiry must be between 1 and 300 seconds.');
  }
  const binding = {
    approver: approver.trim(),
    planDigest: plan.digest,
    issuedAt: now,
    expiresAt: now + ttlSeconds * 1000,
    nonce,
  };
  return { ...binding, token: hash(binding) };
}

export function executePromotion(state, plan, approval, mode, now) {
  if (mode === 'read_only') return denied(state, 'read_only_identity_cannot_mutate');
  if (mode !== 'safe') return denied(state, 'unknown_policy_mode');
  if (state.appliedPlans.has(plan?.digest)) return denied(state, 'duplicate_execution_denied');

  const request = {
    target: plan?.target,
    digest: plan?.candidateDigest,
    traffic_percent: plan?.trafficPercent,
    evidence_id: plan?.evidenceId,
  };
  const result = planFields(state, request);
  if (result.error) return denied(state, 'stale_or_altered_plan');
  const canonical = { ...result.fields, digest: hash(result.fields) };
  if (JSON.stringify(canonical) !== JSON.stringify(plan)) {
    return denied(state, 'stale_or_altered_plan');
  }

  const binding = {
    approver: approval?.approver,
    planDigest: approval?.planDigest,
    issuedAt: approval?.issuedAt,
    expiresAt: approval?.expiresAt,
    nonce: approval?.nonce,
  };
  if (
    typeof binding.approver !== 'string' ||
    !binding.approver.trim() ||
    binding.planDigest !== plan.digest ||
    !Number.isInteger(binding.issuedAt) ||
    binding.issuedAt > now ||
    !Number.isInteger(binding.expiresAt) ||
    binding.expiresAt <= now ||
    binding.expiresAt - binding.issuedAt > 300_000 ||
    approval?.token !== hash(binding)
  ) {
    return denied(state, 'missing_expired_or_invalid_approval', 'approval');
  }

  record(state, 'approval', 'accepted', 'exact_plan_approved', {
    plan_digest: plan.digest,
    approver: binding.approver,
  });
  state.appliedPlans.add(plan.digest);
  record(state, 'operation', 'started', 'single_bounded_fixture_promotion', {
    plan_digest: plan.digest,
  });
  state.environment.current_digest = plan.candidateDigest;
  state.environment.traffic_percent = plan.trafficPercent;
  state.environment.revision = 'release-rv-8';

  if (
    state.environment.current_digest !== plan.candidateDigest ||
    state.environment.traffic_percent !== plan.trafficPercent
  ) {
    record(state, 'verification', 'failed', 'post_promotion_verification_failed');
    return { status: 'failed', reason: 'post_promotion_verification_failed' };
  }
  record(state, 'verification', 'passed', 'preview_promotion_verified', {
    revision: state.environment.revision,
    candidate_digest: state.environment.current_digest,
    traffic_percent: state.environment.traffic_percent,
  });
  return { status: 'verified', reason: 'preview_promotion_verified' };
}
