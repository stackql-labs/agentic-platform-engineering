import { randomUUID } from 'node:crypto';
import {
  createState,
  evidenceId,
  executePromotion,
  issueApproval,
  proposePromotion,
} from './policy.js';

const state = createState();
const now = Date.now();

console.log('FIXTURE REPLAY — no model, network, credentials, or deployment');
console.log(
  JSON.stringify(
    {
      scenario: state.scenarioId,
      target: state.environment.target,
      current_digest: state.environment.current_digest,
      candidate_digest: state.candidate.digest,
      provenance: {
        source_repo: state.candidate.source_repo,
        source_ref: state.candidate.source_ref,
        builder: state.candidate.builder,
        signer: state.candidate.signer,
        signature_valid: state.candidate.signature_valid,
      },
      required_checks: state.candidate.checks,
      findings: state.candidate.findings,
      release_note_untrusted: state.candidate.release_note,
      evidence_id: evidenceId(state),
    },
    null,
    2,
  ),
);

const unsafe = proposePromotion(state, {
  target: 'checkout-preview',
  digest: state.candidate.digest,
  traffic_percent: 100,
  evidence_id: evidenceId(state),
});
console.log(`unsafe proposal: ${JSON.stringify(unsafe)} (terminal denial)`);

const proposal = proposePromotion(state, {
  target: 'checkout-preview',
  digest: state.candidate.digest,
  traffic_percent: 10,
  evidence_id: evidenceId(state),
});
if (proposal.status !== 'approval_required') {
  throw new Error(`Expected bounded proposal, received ${proposal.status}: ${proposal.reason}`);
}
console.log(`exact plan: ${JSON.stringify(proposal.plan, null, 2)}`);

const approval = issueApproval(proposal.plan, 'fixture-operator', now, 300, randomUUID());
const result = executePromotion(state, proposal.plan, approval, 'safe', Date.now());
console.log(`promotion: ${JSON.stringify(result)}`);
console.log(`audit (ephemeral): ${JSON.stringify(state.audit)}`);
console.log(
  'Residual risk: valid fixture provenance and passing policy checks do not prove semantic correctness.',
);

if (result.status !== 'verified') process.exitCode = 1;
