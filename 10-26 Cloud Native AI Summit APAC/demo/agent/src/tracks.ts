import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type Track = 'finops' | 'cspm' | 'access_review';
export type TrackScenario = {
  resource_id?: string;
  owner?: string;
  utilization_percent?: number;
  current_replicas?: number;
  minimum_replicas?: number;
  approved_replicas?: number;
  public_access?: boolean;
  approved_public_access?: boolean;
  role_binding?: string;
  principal?: string;
  grants?: string[];
  approved_grants?: string[];
  resource_version: string;
  monthly_savings_usd?: number;
  applied_plans: Set<string>;
  correlation_id: string;
  audit: Array<{ event: string; decision: string; reason: string; details: Record<string, unknown> }>;
};
export interface TrackPlan {
  track: Track;
  operation: string;
  target: string;
  expectedResourceVersion: string;
  requested: number | boolean | string;
  evidenceId: string;
  digest: string;
}

type TrackData = Omit<TrackScenario, 'applied_plans' | 'correlation_id' | 'audit'>;
const source = JSON.parse(
  readFileSync(
    process.env.TRACK_SCENARIOS_PATH ??
      new URL('../../../../11-26 AI Engineer/workshop/scenarios/tracks.json', import.meta.url),
    'utf8',
  ),
) as Record<Track, TrackData>;

export function createTrackState(): Record<Track, TrackScenario> {
  const copy = (track: Track): TrackScenario => ({
    ...source[track],
    grants: source[track].grants?.slice(),
    approved_grants: source[track].approved_grants?.slice(),
    applied_plans: new Set<string>(),
    correlation_id: `fixture-track-${track}`,
    audit: [],
  });
  return { finops: copy('finops'), cspm: copy('cspm'), access_review: copy('access_review') };
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function audit(
  state: TrackScenario,
  event: string,
  decision: string,
  reason: string,
  details: Record<string, unknown> = {},
): void {
  state.audit.push({ event, decision, reason, details });
}

export function trackEvidenceId(track: Track, state: TrackScenario): string {
  const facts =
    track === 'finops'
      ? [track, state.resource_id, state.resource_version, state.current_replicas, state.utilization_percent]
      : track === 'cspm'
        ? [track, state.resource_id, state.resource_version, state.public_access]
        : [track, state.role_binding, state.resource_version, state.principal, state.grants];
  return hash(facts);
}

function buildTrackPlan(
  track: Track,
  state: TrackScenario,
  args: Record<string, unknown>,
  recordProposal: boolean,
): TrackPlan {
  const evidence = trackEvidenceId(track, state);
  const deny = (reason: string): never => {
    audit(state, 'policy_decision', 'denied', reason, { track });
    throw new Error(`Policy denied: ${reason}.`);
  };
  let operation: string;
  let target: string;
  let requested: number | boolean | string;
  let expectedKeys: string;

  if (track === 'finops') {
    expectedKeys = 'evidence_id,replicas,resource_id';
    if (
      Object.keys(args).sort().join(',') !== expectedKeys ||
      args.resource_id !== 'demo-workload-a' ||
      args.replicas !== state.approved_replicas ||
      typeof args.replicas !== 'number' ||
      args.replicas < (state.minimum_replicas ?? Infinity) ||
      args.evidence_id !== evidence
    ) deny('invalid_finops_target_bounds_or_evidence');
    operation = 'set_simulated_replica_count';
    target = args.resource_id as string;
    requested = args.replicas as number;
  } else if (track === 'cspm') {
    expectedKeys = 'evidence_id,public_access,resource_id';
    if (
      Object.keys(args).sort().join(',') !== expectedKeys ||
      args.resource_id !== 'demo-storage' ||
      args.public_access !== false ||
      args.evidence_id !== evidence
    ) deny('invalid_cspm_target_baseline_or_evidence');
    operation = 'disable_public_access';
    target = args.resource_id as string;
    requested = false;
  } else {
    expectedKeys = 'evidence_id,principal,remove_permission,role_binding';
    if (
      Object.keys(args).sort().join(',') !== expectedKeys ||
      args.role_binding !== 'demo-rolebinding' ||
      args.principal !== 'learner-bot' ||
      args.remove_permission !== 'delete' ||
      !state.grants?.includes('delete') ||
      state.approved_grants?.includes('delete') ||
      args.evidence_id !== evidence
    ) deny('invalid_access_review_target_permission_or_evidence');
    operation = 'remove_excess_demo_grant';
    target = `${args.role_binding}:${args.principal}`;
    requested = args.remove_permission as string;
  }

  const fields = {
    track,
    operation,
    target,
    expectedResourceVersion: state.resource_version,
    requested,
    evidenceId: evidence,
  };
  const plan = { ...fields, digest: hash(fields) };
  if (recordProposal) {
    audit(state, 'plan_proposed', 'approval_required', 'bounded_track_change', {
      track,
      plan_digest: plan.digest,
      evidence_id: evidence,
    });
  }
  return plan;
}

export function proposeTrackPlan(track: Track, state: TrackScenario, args: Record<string, unknown>): TrackPlan {
  return buildTrackPlan(track, state, args, true);
}

export function executeTrackPlan(
  state: TrackScenario,
  plan: TrackPlan,
  approval: { approver: string; planDigest: string; issuedAt: number; expiresAt: number; nonce: string; token: string },
  mode: 'read_only' | 'safe',
  now: number,
): { status: 'verified' | 'denied' | 'failed'; reason: string } {
  const denied = (reason: string) => {
    audit(state, 'policy_decision', 'denied', reason, { track: plan.track, plan_digest: plan.digest });
    return { status: 'denied' as const, reason };
  };
  if (mode === 'read_only') return denied('read_only_identity_cannot_mutate');
  if (mode !== 'safe') return denied('unknown_policy_mode');
  if (state.applied_plans.has(plan.digest)) return denied('duplicate_execution_denied');
  const args =
    plan.track === 'finops'
      ? { resource_id: state.resource_id, replicas: plan.requested, evidence_id: trackEvidenceId(plan.track, state) }
      : plan.track === 'cspm'
        ? { resource_id: state.resource_id, public_access: plan.requested, evidence_id: trackEvidenceId(plan.track, state) }
        : {
            role_binding: state.role_binding,
            principal: state.principal,
            remove_permission: plan.requested,
            evidence_id: trackEvidenceId(plan.track, state),
          };
  let canonical: TrackPlan;
  try {
    canonical = buildTrackPlan(plan.track, state, args, false);
  } catch {
    return { status: 'denied', reason: 'stale_or_altered_plan' };
  }
  if (
    canonical.digest !== plan.digest ||
    canonical.track !== plan.track ||
    canonical.operation !== plan.operation ||
    canonical.target !== plan.target ||
    canonical.expectedResourceVersion !== plan.expectedResourceVersion ||
    canonical.requested !== plan.requested ||
    canonical.evidenceId !== plan.evidenceId ||
    plan.expectedResourceVersion !== state.resource_version
  ) return denied('stale_or_altered_plan');
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
    approval.token !== hash(binding)
  ) return denied('missing_expired_or_invalid_approval');

  audit(state, 'approval', 'accepted', 'exact_plan_approved', {
    plan_digest: plan.digest,
    approver: approval.approver,
  });
  state.applied_plans.add(plan.digest);
  audit(state, 'operation', 'started', 'single_narrow_fixture_change', {
    track: plan.track,
    plan_digest: plan.digest,
  });
  if (plan.track === 'finops') {
    state.current_replicas = plan.requested as number;
    state.resource_version = 'fin-rv-5';
    if (state.current_replicas !== state.approved_replicas) {
      audit(state, 'verification', 'failed', 'post_change_verification_failed', { track: plan.track });
      return { status: 'failed', reason: 'post_change_verification_failed' };
    }
  } else if (plan.track === 'cspm') {
    state.public_access = plan.requested as boolean;
    state.resource_version = 'cspm-rv-10';
    if (state.public_access !== state.approved_public_access) {
      audit(state, 'verification', 'failed', 'post_change_verification_failed', { track: plan.track });
      return { status: 'failed', reason: 'post_change_verification_failed' };
    }
  } else {
    state.grants = state.grants?.filter((permission) => permission !== plan.requested);
    state.resource_version = 'iam-rv-3';
    if (JSON.stringify(state.grants) !== JSON.stringify(state.approved_grants)) {
      audit(state, 'verification', 'failed', 'post_change_verification_failed', { track: plan.track });
      return { status: 'failed', reason: 'post_change_verification_failed' };
    }
  }
  audit(state, 'verification', 'passed', `${plan.track}_fixture_change_verified`, {
    track: plan.track,
    resource_version: state.resource_version,
  });
  return { status: 'verified', reason: `${plan.track}_fixture_change_verified` };
}
