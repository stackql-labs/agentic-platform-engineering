# Lab 2 tracks

These are implemented as fixture exercises sharing the scenario contract. No production provider, IAM API, or live cloud cleanup is called. The isolated live equivalents below remain unimplemented/untested delivery gates.

| Track | Objective and bounded data | Read/assert | Unsafe denial | Approval/change | Verify and audit |
| --- | --- | --- | --- | --- | --- |
| FinOps | Synthetic `workload_cost` record with owner, utilization, monthly estimate, floor/ceiling | Identify idle/oversized resource; assert owner and minimum replica floor | Deny deletion, arbitrary resource ID, or value outside approved ceiling | Propose a bounded simulated replica adjustment; live equivalent must be an isolated, tagged sample and never destructive production cleanup | Read simulated state again; audit estimate, policy, approval, result |
| SRE | Shared synthetic `shop/checkout` incident in `fixture.json` | Read image, resource version, readiness and warning | Deny arbitrary image/namespace/patch/SQL | Exact approved image plan only; operator explicitly approves | Verify fresh image/readiness; record evidence and outcome. This is the first live vertical slice, but has not been validated live. |
| CSPM | Synthetic `demo-storage` record with public access state and owner | Assert against approved private baseline | Deny wildcard or unrelated-resource remediation | Propose only the single safe boolean setting; live equivalent must be isolated and tagged | Re-read the setting and record policy, approval, verification |
| Access review | Synthetic role binding with principal alias and permitted demo scope | Identify excess synthetic permission against a baseline | Deny production principal, broad wildcard, credential handling, or unbounded IAM edit | Propose scoped simulated permission removal; live equivalent needs separately bounded disposable lab role/resource and identity | Re-read role binding and record policy, approval, verification |

## Expected outputs

- **FinOps:** report `demo-workload-a`, `team-demo`, 7.5% utilization and the synthetic USD 42/month estimate; only the approved simulated replica target of 1 is eligible.
- **SRE:** report `shop/checkout`, the synthetic `ImagePullBackOff`, current and desired image, evidence ID, and a verified fixture-only repair.
- **CSPM:** report `demo-storage` as public in the observed fixture and propose only `public_access=false`; verify the changed fixture state.
- **Access review:** report `demo-rolebinding` for synthetic alias `learner-bot`; identify `delete` as excess and retain only `read`.

Each successful fixture track emits `plan_proposed`, policy/approval, `operation`, and `verification` audit events. A failed gate emits denial and no successful result.

## Starter and solution checkpoints

- **Starter:** implement a typed read/assert function returning evidence and an evidence ID.
- **Checkpoint 1:** reject extra fields and out-of-scope targets before dispatch.
- **Checkpoint 2:** build a canonical plan from fresh evidence and the authoritative fixture baseline.
- **Checkpoint 3:** reject changed/expired/missing approval and stale evidence.
- **Solution:** use the SRE `plan_image_repair` and `execute_approved_repair` implementations as the reference; do not copy them into production unreviewed.

## Challenge variants

1. Add a tool output with an instruction-injection string; prove it cannot change policy or identity.
2. Advance the resource version after approval; require a fresh proposal.
3. Simulate an uncertain mutation result; verify state before considering any retry.
4. Make verification fail and ensure the run is reported as failed.

The lab release remains blocked until each live track has an isolated target, explicit identity boundaries, deterministic reset, facilitator-tested outputs, and verified teardown.
