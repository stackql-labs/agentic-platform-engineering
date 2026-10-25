# Agentic Platform Engineering with StackQL

**Infracoders** · speaking slot: 15–20 minutes · planned content: 18 minutes  
**Thesis:** As agents operate infrastructure, the "C" in IaC shifts from Code to Context. Query actual provider state before proposing changes; use a declarative, statefile-less deployment framework to converge toward reviewed intent.

This is an event-specific talk. The separate AI Engineer talk covers release provenance and rollout gates; this session focuses on StackQL, provider context, MCP-based discovery, and `stackql-deploy`.

## Slide 1 — Title · 0:45 (0:45)

**Agentic Platform Engineering with StackQL**

As agents start operating infrastructure, the "C" in IaC shifts from Code to Context.

**Speaker note:** This is a platform interface change, not a claim that code, review, or operators disappear.

## Slide 2 — IaC's missing input · 1:15 (2:00)

- Infrastructure code describes intended changes.
- State snapshots and plans can age while the real provider keeps changing.
- An agent needs current, explainable context before it recommends an action.
- Querying state is necessary—but it does not itself authorize mutation.

## Slide 3 — Context as a first-class interface · 1:30 (3:30)

**Discover → query → compare → propose → converge → verify**

- Make provider resources discoverable as structured data.
- Keep evidence close to the target and observation time.
- Put deterministic policy and operator approval between reasoning and writes.
- Re-query after convergence; distinguish observed state from intended state.

## Slide 4 — StackQL: providers as queryable data · 1:30 (5:00)

- StackQL exposes cloud and SaaS provider resources through SQL.
- SQL provides a familiar, composable read surface for agent tools.
- Provider/resource discovery lets the agent learn available fields and operations.
- Keep reads narrow and explicit; avoid dumping entire provider schemas into context.

**Caveat:** Provider coverage, permissions, API freshness, and supported methods vary. A query result is evidence, not a guarantee that the underlying system cannot change.

## Slide 5 — MCP connects the agent to provider context · 1:30 (6:30)

**Agent ↔ StackQL MCP server ↔ provider/resource**

- The MCP server exposes StackQL discovery and query capabilities to the agent.
- The agent can inspect live state without embedding provider-specific SDK logic in its prompt.
- Use a deliberately scoped connector and a least-privilege identity.
- Treat returned fields and descriptions as untrusted data; they do not override policy.

**Show:** the configured StackQL MCP connector in the Anthropic connector directory and its available read/query tools. Never show credential values.

## Slide 6 — From queried state to declarative intent · 1:30 (8:00)

- Separate observed context from reviewed desired state.
- `stackql-deploy` evaluates resources against their declared state.
- A build can create or update resources when current state differs from the declaration.
- Re-running the build converges without maintaining a separate state file.

**Caveat:** Statefile-less does not mean policy-free, transactionally atomic, or drift-proof. The provider remains the authority; changes between observation and execution still matter.

## Slide 7 — Demo map · 0:30 (8:30)

**Disposable local cluster only**

1. Query the demo deployment through StackQL MCP.
2. Compare live image/replicas to the reviewed manifest.
3. Demonstrate a bounded, intentional drift.
4. Run `stackql-deploy` in dry-run mode; review generated queries.
5. Explicitly approve the local build; re-query to verify convergence.

## Slide 8 — Live demo · 5:00 (13:30)

| Time | Beat |
| --- | --- |
| 0:00–0:40 | State the live/fixture label and confirm the disposable target. |
| 0:40–1:30 | Use the Anthropic StackQL MCP connector to read the deployment and its labels, image, replicas, and readiness. |
| 1:30–2:10 | Compare the result with the manifest; explain that live observation is context, not approval. |
| 2:10–2:50 | Show bounded drift on the disposable target; do not touch any other context. |
| 2:50–3:50 | Run `stackql-deploy build` dry run and inspect the planned SQL. |
| 3:50–4:30 | Confirm the fixed demo target and apply the declarative build. |
| 4:30–5:00 | Query again, show convergence, and label the result accurately. |

**Fallback:** labelled fixture replay of the same query/plan/verification beats. Do not call fixture data live evidence.

## Slide 9 — Guardrails around query-before-mutation · 1:30 (15:00)

- A query is not an authorization decision.
- Bind every proposal to the target, evidence, and intended values.
- Keep MCP credentials scoped to the disposable environment.
- Review `stackql-deploy`'s dry-run queries before building.
- Use an explicit operator confirmation and verify with a fresh query.
- Treat uncertain outcomes as a reason to inspect—not blindly retry.

## Slide 10 — What statefile-less changes (and doesn't) · 1:30 (16:30)

- Removes a separate state snapshot that can diverge from provider reality.
- Makes each build evaluate current provider state against declared intent.
- Does not eliminate stale reads, API races, provider limits, or semantic errors.
- Does not replace approvals, identity controls, audit retention, or rollback.

## Slide 11 — Close · 1:30 (18:00)

**Code declares intent. Context grounds the decision. Policy bounds the action.**

StackQL makes provider context queryable; `stackql-deploy` makes reviewed intent convergent. The agent proposes—the platform and operator control what happens next.

## Timing summary

| Slide | Duration | Cumulative |
| --- | ---: | ---: |
| 1 | 0:45 | 0:45 |
| 2 | 1:15 | 2:00 |
| 3 | 1:30 | 3:30 |
| 4 | 1:30 | 5:00 |
| 5 | 1:30 | 6:30 |
| 6 | 1:30 | 8:00 |
| 7 | 0:30 | 8:30 |
| 8 | 5:00 | 13:30 |
| 9 | 1:30 | 15:00 |
| 10 | 1:30 | 16:30 |
| 11 | 1:30 | 18:00 |

The 18-minute content fits the requested 15–20 minute slot; hold the remaining two minutes as delivery buffer.
