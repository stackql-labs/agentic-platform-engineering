# AI native platform engineering: building the platform when agents are the primary consumer

**Cloud Native AI Summit Melbourne** · Wednesday 28 October 2026 · MCEC · 16:50–17:20
**Content:** 20 minutes · **Q&A:** 5 minutes · Speaker: Jeffrey Aven

The thesis: agents should query authoritative platform state before proposing a change. Deterministic policy, separately scoped identities, human approval, and post-change verification—not a persuasive prompt—govern execution.

This is a 16:9 slide source with speaker notes and demo cues. The live cluster/model path is not validated; use it only after release gates pass. Otherwise play a clearly labelled recording or fixture replay. Do not represent fixture output as a live run.

## Slide 1 — Title · 0:30 (cumulative 0:30)

**AI native platform engineering**
Building the platform when agents are the primary consumer

Cloud Native AI Summit Melbourne · Jeffrey Aven · 28 October 2026

**Visual:** A platform contract and a tightly scoped tool call; no robot stock art.

**Speaker note:** “The platform is still a product. The consumer now includes an agent that needs structured, discoverable contracts and an execution boundary it cannot prompt its way around.”

## Slide 2 — Start with a familiar incident · 1:30 (2:00)

- A checkout deployment is unhealthy.
- A human starts with current state, events, and the approved desired state.
- An agent can do the same work quickly—but it can also guess, retry, or act on stale evidence.
- The question is not “does the agent sound confident?” It is “what can it actually do?”

**Speaker note:** Describe the synthetic image-pull incident; identify it as a disposable example, not customer telemetry.

## Slide 3 — The platform has a new consumer · 1:00 (3:00)

- Agents need machine-readable contracts and progressive discovery.
- They need bounded context and explicit evidence, not a giant schema dump.
- They can run repeatedly and in parallel; tool output can contain hostile instructions.
- Human developer portals remain useful. Agent interfaces complement them.

**Visual:** Human and agent personas side by side, each with a distinct interface.

## Slide 4 — One contract, progressive discovery · 2:00 (5:00)

1. Discover a capability.
2. Read its precise schema and constraints.
3. Query current state and the authoritative desired-state artifact.
4. Propose a typed plan against fresh evidence.

**Concrete example:** StackQL offers a queryable platform surface; the safety pattern is tool-agnostic. Do not expose an unrestricted SQL or arbitrary patch tool as the repair operation.

**Speaker note:** A human may still use a portal or PR. The platform adds an agent-readable contract rather than declaring those interfaces obsolete.

## Slide 5 — Query before mutation · 2:00 (7:00)

**Evidence first**

- Current target and namespace
- Resource version / evidence identifier
- Observed image, readiness, and event
- Approved desired image from a trusted artifact

**Then:** validate scope → calculate exact plan → revalidate freshness → request approval.

**Visual:** Evidence card and desired-state card flowing into one canonical plan.

## Slide 6 — Controls belong in the process · 3:00 (10:00)

| Boundary | Enforced by |
| --- | --- |
| What can be called | Strict schema and application allowlist |
| What can be read | Read-only identity and target scope |
| What can be changed | One narrow operation, approved desired value only |
| Who may approve | Authenticated operator interface, bound to exact plan and expiry |
| Whether it worked | Fresh post-change read and explicit verification |

- Denial is terminal for that action; no alternate tool or prompt-based retry.
- An uncertain result triggers verification, never a blind duplicate mutation.
- Application policy is still not a lock: use atomic resource-version preconditions where available.

**Speaker note:** In this local teaching fixture, approval identity is self-attested; it is explicitly not the production approval service. The production/live integration remains a release gate.

## Slide 7 — Demo setup · 1:00 (11:00)

**Synthetic checkout incident**

`ImagePullBackOff` → read-only inventory → approved desired image → exact plan → operator gate → fixture verification

- Live version: isolated, disposable cluster only, after preflight.
- Fallback: local recording or labelled deterministic fixture replay.
- Both versions use the same scenario and safety outcomes.

## Slide 8 — Demo · 4:00 (15:00)

| Time | Beat |
| --- | --- |
| 0:00–0:40 | State that this is fixture replay or live isolated target; show incident and desired state. |
| 0:40–1:20 | Discover inventory; read evidence ID, resource version, event. |
| 1:20–2:00 | Attempt an out-of-scope/arbitrary image proposal; show deterministic denial and stop. |
| 2:00–2:50 | Separate operator instruction: propose the approved image using fresh evidence. |
| 2:50–3:30 | Show exact plan, approval binding, and single narrow operation. |
| 3:30–4:00 | Fresh verification and audit summary; disclose whether fixture or live. |

**Cue:** A denial does not trigger an automatic reformulation. The operator starts the corrected proposal separately.

## Slide 9 — Operate it like a workload · 2:00 (17:00)

- Separate identities for read-only and approved mutation paths.
- Explicitly scoped credentials; do not inherit a developer's default context.
- Bounded turns, output, time, and calls; API provider limits are separate spend controls.
- Correlated, structured audit; local logs are not durable evidence unless storage and retention prove it.
- Reset only positively identified lab-owned resources.

**Speaker note:** The checked-in CronJob is suspended and read-only; it is not a validated live agent deployment.

## Slide 10 — What this does not solve · 1:30 (18:30)

- A permitted, valid change can still be semantically wrong.
- The approved desired state itself may be wrong.
- A preflight read is not a lock; stale observations and API races remain.
- Prompt injection and outages are reduced by boundaries, not eliminated.
- The self-attested local approval and synthetic fixture do not prove production identity, RBAC, or atomicity.

## Slide 11 — Checklist · 1:00 (19:30)

Before an agent may write:

1. Can it show fresh evidence and an authoritative desired value?
2. Is the operation narrower than a generic patch?
3. Can the read identity mutate? (It must not.)
4. Is approval authenticated and plan-bound?
5. Is the outcome verified without blind retries?

## Slide 12 — Close · 0:30 (20:00)

**Build the contract. Bound the identity. Verify the outcome.**

Repository source: [stackql-labs/agentic-platform-engineering](https://github.com/stackql-labs/agentic-platform-engineering)

**Q&A:** separate 5-minute buffer; do not consume it with content. Sponsor acknowledgement is pending approval and omitted.

## Timing check

| Slide | Duration | Cumulative |
| --- | ---: | ---: |
| 1 | 0:30 | 0:30 |
| 2 | 1:30 | 2:00 |
| 3 | 1:00 | 3:00 |
| 4 | 2:00 | 5:00 |
| 5 | 2:00 | 7:00 |
| 6 | 3:00 | 10:00 |
| 7 | 1:00 | 11:00 |
| 8 | 4:00 | 15:00 |
| 9 | 2:00 | 17:00 |
| 10 | 1:30 | 18:30 |
| 11 | 1:00 | 19:30 |
| 12 | 0:30 | 20:00 |

**Fallback cue:** Start the recording at slide 8 with a visible `RECORDED DEMO` label. If the live path is unavailable, use a fixture replay and state that it is simulated; do not invent a recording.
