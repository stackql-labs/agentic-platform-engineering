# Facilitator runbook

**Workshop:** Building Agents That Safely Operate Real Cloud Infrastructure  
**Date:** Wednesday 9 December 2026 · half day; exact start time pending confirmation  
**Capacity:** 30 learners + Jeffrey Aven + one additional facilitator  
**Delivery status:** fixture exercises are available; hosted isolated environment and live Lab 1/Lab 2 paths are not validated. Do not call this workshop-ready until all promised live gates pass or organizers explicitly approve a scope change.

## Delivery timing

| Minutes | Activity | Lead |
| ---: | --- | --- |
| 0–40 | Introduction and shared demo | Jeffrey |
| 40–85 | Lab 1 read-only inventory/audit | Both; second facilitator supports setup |
| 85–115 | Break | Both |
| 115–150 | Safe-write, approval and verification patterns | Jeffrey |
| 150–200 | Lab 2 choice of four tracks | Both; one track each as needed |
| 200–210 | Wrap-up and evaluation | Jeffrey |

Total: 180 teaching/lab minutes + 30-minute break = 210 elapsed minutes.

## Before learner arrival

### Local fixture fallback

- [ ] Run TypeScript `npm ci`, `npm run smoke`, `npm test`, `npm run typecheck`.
- [ ] Run Python `python -m unittest -v`.
- [ ] Prepare fixture-only outputs and visibly label them synthetic.
- [ ] Keep a local slide/demo copy; no network should be needed for smoke/tests.

### Promised hosted workshop release gate (not complete)

- [ ] Provision and verify one isolated environment per learner for 30 learners, plus Jeff and one facilitator (32 total).
- [ ] Pre-provision spare environments and a second-region standby; document feasibility and access.
- [ ] Prove a per-learner reset and teardown/redeploy within a few minutes.
- [ ] Confirm Lab 1 makes a live read-only query in each isolated environment.
- [ ] Confirm Lab 2 implements propose/approve/execute/verify for the selected live track(s).
- [ ] Verify least privilege, no cross-learner access, secret delivery, audit retention, cost ceilings, expiry, and cleanup.
- [ ] Verify connectivity to OpenAI GPT-6-family APIs and Codex access mechanism without assuming free credits.
- [ ] Test Windows paths, Docker/WSL requirements, accessibility, and spare-device workflow.
- [ ] Record a narrated fallback and provide offline outputs. A fallback does not by itself fulfill the hosted live promise.

If any contingency is infeasible or unverified, request explicit organizer agreement before claiming workshop-ready.

## Organizer/sponsor checklist — decisions still open

- [ ] Final internal approval and permission for any sponsor acknowledgement/branding.
- [ ] Per-person API access and GPT-6 model entitlements for 32 participants/facilitators.
- [ ] Credit allocation, spend limits, rate limits, expiry, and funding owner; no amount or free access is assumed.
- [ ] How Codex access is provisioned and how it differs from API runtime access.
- [ ] Data/privacy and retention terms for prompts, tool outputs, and audit records.
- [ ] Participant support/escalation process and outage contact (do not publish personal email).
- [ ] Offline/recording fallback acceptance and whether it satisfies the promised workshop experience.
- [ ] Confirm exact workshop start time and facilitator assignment.

## Facilitation notes

- Participants choose one language, not both. Codex assists development; the SDK is the runtime model integration.
- Keep tool outputs visibly marked as untrusted evidence.
- A denial is a stopping point. A corrected proposal begins only after a separate explicit operator instruction with fresh evidence.
- Never use participant personal cloud accounts, production IAM, customer data, or default cluster contexts for convenience.
- Local terminal approver identity is self-attested and only demonstrates exact-plan binding; it is not suitable as a hosted production approval system.

## Troubleshooting and escalation

| Symptom | Response |
| --- | --- |
| Dependency install fails | Stop installing; capture package/runtime versions and use the prepared offline fixture environment. |
| Model/API access unavailable | Do not substitute another family or personal key. Use the labelled fixture fallback and raise the access gate. |
| Isolated environment unavailable | Do not point to another learner's or a default environment. Use fallback and record a release incident. |
| Approval is missing/expired/altered | Deny; gather fresh evidence and require a new explicit plan/approval. |
| Mutation result uncertain | Read current state and verify; never issue a blind duplicate mutation. |
| Teardown target unclear | Stop cleanup until the resource is positively identified as lab-owned. |

## Closeout

- [ ] Collect anonymous feedback without API keys, personal data, or infrastructure identifiers.
- [ ] Confirm all isolated environments are reset and torn down by the approved automation.
- [ ] Retain audit output only under the published retention policy.
- [ ] Record unresolved live-track and contingency gates; do not report a fixture-only delivery as live.
