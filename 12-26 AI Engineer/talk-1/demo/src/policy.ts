/**
 * The release gate: four boundaries in code, each of which can say no on its own. Pure
 * functions: a request, the live state and the reviewed policy in; a decision out. The
 * model never sees this file and cannot change what it decides.
 *
 *   evidence    the run read the live state, recently, and the gate has read it again
 *               itself (query before mutation). A plan is bound to exactly what was read
 *   provenance  approved source, builder and signer; required checks; finding thresholds
 *   policy      the named preview target, the candidate digest, and the traffic bound
 *   approval    a named person approves the exact plan, for a few minutes, once
 *
 * After the write, verification is a fresh read: the change is not believed until the
 * provider shows it.
 *
 * A denial is terminal for the run. The agent does not get to rephrase the request until
 * it fits: a new proposal is a new run, started by a person.
 */
import { createHash } from 'node:crypto';

import { evidenceId, promoteSql, routeValue, type Live } from './release.ts';

export type ReleasePolicy = {
  target: string;
  source_repo: string;
  source_ref: string;
  builder: string;
  signer: string;
  required_checks: string[];
  max_critical_findings: number;
  max_high_findings: number;
  allowed_traffic_percent: number;
  evidence_freshness_seconds: number;
  approval_ttl_seconds: number;
};

/** the one thing the agent can ask for */
export type PromotionRequest = { target: string; digest: string; traffic_percent: number };

export type Plan = {
  operation: 'promote_candidate_to_preview';
  target: string;
  candidate_digest: string;
  traffic_percent: number;
  /** the one statement the system will send, rendered by the system */
  statement: string;
  /** the route's revision when the plan was made: the write is refused if it has moved */
  expected_revision: number;
  evidence_id: string;
  plan_id: string;
};

export type Approval = { approver: string; plan_id: string; approved_at: number; expires_at: number; used?: boolean };

export type Denial = { status: 'denied'; rule: string; reason: string; terminal: boolean };
export type Decision = Denial | { status: 'noop'; rule: string; reason: string } | { status: 'approval_required'; plan: Plan };

/** when the run last read each half of the live state */
export type Looks = { preview?: number; candidate?: number };

export type Context = { region: string; now: number; looks: Looks; priorDenial?: boolean };

const deny = (rule: string, reason: string, terminal = true): Denial => ({ status: 'denied', rule, reason, terminal });

const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);

export const normalise = (sql: string): string => sql.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();

/** provenance: is this candidate one the policy lets anywhere at all? */
export function provenanceDenial(live: Live, policy: ReleasePolicy): Denial | undefined {
  const c = live.candidate;
  if (!/^sha256:[a-f0-9]{64}$/.test(c.digest)) return deny('invalid_candidate_digest', 'the candidate digest is not a sha256 digest');
  if (c.source_repo !== policy.source_repo) return deny('unapproved_source_repository', `source ${c.source_repo} is not the approved repository`);
  if (c.source_ref !== policy.source_ref) return deny('unapproved_source_ref', `ref ${c.source_ref} is not the approved release ref`);
  if (c.builder !== policy.builder) return deny('unapproved_builder', `builder ${c.builder} is not the approved builder`);
  if (c.signer !== policy.signer || c.signature_valid !== true) {
    return deny('candidate_provenance_not_approved', `signer ${c.signer} with signature_valid=${c.signature_valid} is not an approved signature`);
  }
  const failed = policy.required_checks.filter((check) => c.checks[check] !== 'passed');
  if (failed.length) return deny('required_check_not_passed', `required checks not passed: ${failed.join(', ')}`);
  const { critical, high } = c.findings;
  if (!Number.isInteger(critical) || !Number.isInteger(high) || critical < 0 || high < 0) {
    return deny('invalid_findings_summary', 'the findings summary is not two whole numbers');
  }
  if (critical > policy.max_critical_findings || high > policy.max_high_findings) {
    return deny('finding_threshold_exceeded', `findings critical=${critical} high=${high} exceed the thresholds`);
  }
  return undefined;
}

/**
 * The agent's proposal, decided. `live` is the gate's own reading, taken just now; the
 * agent's reading only has to exist and be recent.
 */
export function propose(request: unknown, live: Live, policy: ReleasePolicy, ctx: Context): Decision {
  if (ctx.priorDenial) return deny('terminal_denial_in_effect', 'this run already has a denial. A new proposal is a new run');

  const keys = request && typeof request === 'object' && !Array.isArray(request) ? Object.keys(request).sort().join(',') : '';
  const r = request as PromotionRequest;
  if (keys !== 'digest,target,traffic_percent' || typeof r.target !== 'string' || typeof r.digest !== 'string' || !Number.isInteger(r.traffic_percent)) {
    return deny('invalid_proposal_shape', 'a proposal is exactly: target, digest, traffic_percent');
  }

  // evidence: query before mutation. Not terminal: the answer is to go and look.
  const freshness = policy.evidence_freshness_seconds * 1000;
  const stale = (at: number | undefined) => at === undefined || ctx.now - at > freshness;
  if (stale(ctx.looks.preview) || stale(ctx.looks.candidate)) {
    return deny('no_fresh_read', 'no fresh read of the live release state and the candidate evidence in this run. Query, then propose', false);
  }

  const provenance = provenanceDenial(live, policy);
  if (provenance) return provenance;

  if (r.target !== policy.target) return deny('proposal_outside_release_policy', `target ${r.target} is not ${policy.target}`);
  if (r.digest !== live.candidate.digest) return deny('proposal_outside_release_policy', 'the digest is not the candidate on record');
  if (r.traffic_percent !== policy.allowed_traffic_percent) {
    return deny('proposal_outside_release_policy', `${r.traffic_percent}% of traffic is outside the release policy: ${policy.target} takes ${policy.allowed_traffic_percent}%`);
  }

  if (live.route.raw === routeValue(r.digest, r.traffic_percent)) {
    return { status: 'noop', rule: 'already_promoted', reason: `already promoted: ${policy.target} routes ${r.traffic_percent}% to this candidate. Nothing to do` };
  }

  const fields = {
    operation: 'promote_candidate_to_preview' as const,
    target: policy.target,
    candidate_digest: live.candidate.digest,
    traffic_percent: policy.allowed_traffic_percent,
    statement: promoteSql(ctx.region, policy.target, live.candidate.digest, policy.allowed_traffic_percent),
    expected_revision: live.route.revision,
    evidence_id: evidenceId(live),
  };
  return { status: 'approval_required', plan: { ...fields, plan_id: hash(fields) } };
}

/** a named person's yes, bound to one plan and one window of time */
export function issueApproval(plan: Plan, approver: string, now: number, ttlSeconds: number): Approval {
  if (!approver.trim()) throw new Error('an approval needs a name');
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) throw new Error('an approval lasts between 1 and 300 seconds');
  return { approver: approver.trim(), plan_id: plan.plan_id, approved_at: now, expires_at: now + ttlSeconds * 1000 };
}

/**
 * Just before the write: the approval is for this plan and still good, and the live state
 * is still exactly what the plan was made from. `liveNow` is a fresh read.
 */
export function mayExecute(plan: Plan, approval: Approval | undefined, liveNow: Live, policy: ReleasePolicy, now: number): Denial | undefined {
  if (!approval || approval.plan_id !== plan.plan_id || approval.used || now >= approval.expires_at || approval.approved_at > now) {
    return deny('missing_expired_or_invalid_approval', 'no valid approval for this exact plan');
  }
  const { plan_id, ...fields } = plan;
  if (hash(fields) !== plan_id) return deny('stale_or_altered_plan', 'the plan does not match its id');
  if (evidenceId(liveNow) !== plan.evidence_id || liveNow.route.revision !== plan.expected_revision) {
    return deny('stale_or_altered_plan', 'the live state changed after the plan was made. Read again and start a new proposal');
  }
  return provenanceDenial(liveNow, policy);
}

/**
 * The server asks before it runs a write (MCP elicitation, safe mode). The answer is yes
 * only when the statement it is asking about is the approved plan's statement.
 */
export function answersFor(message: string, plan: Plan | undefined, approval: Approval | undefined, now: number): boolean {
  if (!plan || !approval || approval.plan_id !== plan.plan_id || approval.used || now >= approval.expires_at) return false;
  const asked = message.match(/SQL:\s*([\s\S]+)$/);
  return Boolean(asked) && normalise(asked![1]) === normalise(plan.statement);
}

/** after the write, from a fresh read: is the end state the plan's end state? */
export function verify(plan: Plan, liveAfter: Live): { ok: boolean; reason: string } {
  const want = routeValue(plan.candidate_digest, plan.traffic_percent);
  if (liveAfter.route.raw !== want) return { ok: false, reason: `post_promotion_verification_failed: the route reads ${liveAfter.route.raw}` };
  if (liveAfter.route.revision !== plan.expected_revision + 1) {
    return { ok: false, reason: `post_promotion_verification_failed: revision ${liveAfter.route.revision}, expected ${plan.expected_revision + 1}. Somebody else wrote it too` };
  }
  return { ok: true, reason: 'preview_promotion_verified' };
}
