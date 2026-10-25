# Trust is not a boolean: release gates for infrastructure agents

**AI Engineer Sydney** · Tuesday 8 December 2026 · 13:00–13:18 · 16:9 · own laptop  
**Talk:** 18 minutes · **Transition:** 2 minutes  
**Full-length dry run:** AI Engineering Night, Thursday 29 October 2026, 18:00–21:00 event window; speaker slot is not established.

This talk takes a different case study from the Cloud Native AI Summit talk: release promotion and artifact provenance rather than incident diagnosis and repair. It emphasizes preventive controls and one important limit: provenance and policy checks do not establish that an artifact is semantically correct. The demo is a deterministic, offline fixture replay; it makes no model or infrastructure calls.

## Slide 1 — Title · 0:30 (0:30)

**Trust is not a boolean**  
Release gates for infrastructure agents

**Note:** “Production” is the threat-model context, not a claim that this demo is connected to production.

## Slide 2 — Incident and stakes · 1:30 (2:00)

- A candidate release has a valid-looking signature and passing checks.
- An agent can move quickly—and can also overstate what those signals prove.
- “Verified provenance” is not proof that software is safe or correct.
- Release policy must constrain what can be promoted and how far.

## Slide 3 — Query before mutation · 1:30 (3:30)

**Provenance → policy → bounded promotion**

- Check source, builder, signer, required checks, and finding thresholds.
- Bind evidence to the current release revision and candidate digest.
- Allow only the named preview target and 10% traffic.
- Revalidate freshness before an approved fixture operation.

## Slide 4 — Four independent control boundaries · 3:00 (6:30)

1. **Provenance:** approved source, builder, signer, and required checks.
2. **Policy:** fixed preview target, candidate digest, and traffic bound.
3. **Approval:** operator approves the exact plan and bounded expiry.
4. **Verification:** fresh state confirms the promoted digest and traffic.

**Note:** A fixture signature flag is not cryptographic verification. Production provenance requires a trusted verification implementation.

## Slide 5 — Demo: what to watch · 0:30 (7:00)

Use this talk's separate synthetic release-promotion case. Label on-screen: `FIXTURE REPLAY`.

## Slide 6 — Demo · 4:00 (11:00)

1. Inspect the candidate digest, source, builder, signer, checks, findings, and untrusted release note.
2. Submit a 100% rollout request; deterministic policy denies it terminally.
3. Start a separate proposal for the exact 10% preview policy.
4. Review the plan and plan-bound local approval.
5. Simulate promotion and verify the resulting digest and traffic.

**Show:** policy decision, exact plan, and structured audit. **Do not:** auto-reformulate after denial or call fixture output a real signature check or deployment.

## Slide 7 — Recovery and limits · 3:00 (14:00)

- The operation is an in-memory preview simulation; process exit resets it.
- An unknown live mutation outcome would require a fresh read; never blindly replay.
- If verification fails, surface failure; do not return success-shaped output.
- Audit retention is only as durable as its storage backend.
- Fixture approval is self-attested, not an authenticated operator interface.

## Slide 8 — A failure the controls do not catch · 1:30 (15:30)

**A permitted change can still be wrong.**

The artifact may come from the approved source, builder, and signer and still contain a defect. Signature validity and passing fixture checks do not establish semantic correctness. Add independent review and runtime signals, and retain a rollback plan.

## Slide 9 — Practical checklist · 1:30 (17:00)

- Verify source, builder, signer, and required checks independently.
- Keep release targets and rollout bounds explicit.
- Expose one typed promotion capability—not arbitrary deploy commands.
- Bind authenticated approval to the exact plan and expiry.
- Verify the rollout and handle uncertainty without blind retries.

## Slide 10 — Close · 1:00 (18:00)

**Provenance informs. Policy constrains. Runtime evidence verifies.**

Repository: [stackql-labs/agentic-platform-engineering](https://github.com/stackql-labs/agentic-platform-engineering)

**Transition:** 2 minutes after talk content. Sponsor acknowledgement remains pending approval.

## Timing check

| Slide | Duration | Cumulative |
| --- | ---: | ---: |
| 1 | 0:30 | 0:30 |
| 2 | 1:30 | 2:00 |
| 3 | 1:30 | 3:30 |
| 4 | 3:00 | 6:30 |
| 5 | 0:30 | 7:00 |
| 6 | 4:00 | 11:00 |
| 7 | 3:00 | 14:00 |
| 8 | 1:30 | 15:30 |
| 9 | 1:30 | 17:00 |
| 10 | 1:00 | 18:00 |

**Recording plan:** Record the coding/product demo with live narration for Sydney. If a recording is unavailable, use the explicit fixture replay and label it accurately. Do not create or claim a recording as part of repository preparation.
