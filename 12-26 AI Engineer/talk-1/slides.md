# Query before mutation: guardrail patterns for agents that touch production infrastructure

Version A of the talk. **AI Engineer Sydney**, Tuesday 8 December 2026, 12:40 pm, AI Engineering track. 18 minutes of talk and 2 minutes of transition, 16:9, own laptop.

**Deck:** [slides/Query Before Mutation - Version A.pptx](slides/Query%20Before%20Mutation%20-%20Version%20A.pptx). The notes pane of each slide carries its talk track and its timing.

This version tells, then shows, then gives the limits. It keeps the case study this outline started with, a release promotion, and the line it was first titled with, "Trust is not a boolean", which is now slide 2. It has one continuous live demo in the middle and uses the engineering vocabulary of the accepted abstract. Version B (`../talk-2`) is the other arm of the A/B test: show first, plain words, two short clips.

## What changed from the first outline

- **Title:** the accepted one. "Trust is not a boolean: release gates for infrastructure agents" is the hook on slide 2.
- **Guardrails:** the abstract's five, each with where it helps and where it does not (slide 5). The four control boundaries are still here (slide 4), now as evidence, provenance, policy and approval, with verification after the write, which is how the demo's gate reports them.
- **Demo:** live, not a fixture replay. A model proposes through the OpenAI SDK, the live state is read through the StackQL MCP server, and the same release policy decides. The denied request and the bounded one are separate runs.
- **Checklist:** ordered by protection for effort, as the abstract promises.
- **Count:** 11 slides plus the template's closing slide, and one hidden slide of fallback stills.

## Run of show

| # | Slide | Time | Ends | What lands |
| --- | --- | ---: | ---: | --- |
| 1 | Title | 0:30 | 0:30 | The name of the talk. "Production" is the threat model, not a claim about the demo |
| 2 | Trust is not a boolean | 1:30 | 2:00 | Plan-and-apply was safe because a person read the plan. A permission is a yes or a no; trust has to say what, where and how far |
| 3 | 01 Query before mutation | 1:30 | 3:30 | No fresh read of the live state, no write. Query, propose, gate, write, verify. The plan is bound to what was read |
| 4 | Four independent boundaries | 1:30 | 5:00 | Evidence, provenance, policy, approval. Each can say no on its own. Then verify |
| 5 | Five guardrails, and their limits | 1:45 | 6:45 | The abstract's five patterns: where each helps, where it does not |
| 6 | Demo: what to watch | 0:30 | 7:15 | The setup, and three things to watch: the query, the denial, the recovery |
| 7 | Demo | 4:00 | 11:15 | `npm run blocked`, `npm run promote`, `npm run audit` |
| - | The run, as recorded (hidden) | - | - | Fallback stills. Unhide only if the demo and the replay both fail |
| 8 | 05 Recovery paths | 2:15 | 13:30 | Blocked is a decision. Unknown is a question. Failed is an event. And the limits |
| 9 | A failure the controls do not catch | 1:15 | 14:45 | A permitted change can still be wrong |
| 10 | The ordered checklist | 1:30 | 16:15 | Six controls, most protection for the least effort first |
| 11 | What to take home | 1:00 | 17:15 | Provenance informs. Policy constrains. Runtime evidence verifies |
| 12 | Thank you | - | - | The template's closing slide. Stays up through the 2 minute transition |
| - | Slack | 0:45 | 18:00 | |

## Slides

### 1. Title

Query before mutation. Guardrail patterns for agents that touch production infrastructure. Jeffrey Aven, Maintainer, StackQL Studios.

"Production" is the threat model for the talk, not a claim that the demo is connected to anybody's production.

### 2. Trust is not a boolean

Byline: Plan-and-apply was safe because a person read the plan.

- A candidate release has a valid-looking signature and passing checks.
- An agent can move quickly, and can also overstate what those signals prove.
- "Verified provenance" is not proof that software is safe or correct.
- Release policy must constrain what can be promoted, and how far.

Picture: plan, a person reads it, apply; then the same with the middle box empty. Closing line: a permission is a yes or a no. Trust has to say what, where and how far.

### 3. 01 Query before mutation

Byline: No fresh read of the live state, no write.

Picture: five steps. Query the live state as SQL, propose one typed request, gate (provenance, policy, approval), write one statement of the end state, verify with a fresh read. The plan is bound to what was read: an evidence id and a revision.

- Helps: every decision rests on what is live now, not a state file, a cache, or what the model remembers.
- Does not help: a read is not a lock. State can move between the read and the write, so the gate reads again.

### 4. Four independent boundaries

Byline: Each can say no on its own. None of them is the model.

1. **Evidence:** the run queried the live state, and the gate reads it again itself. Says no to a proposal with no read behind it.
2. **Provenance:** approved source, builder and signer; required checks; finding thresholds. Says no to an unknown builder or a failed check.
3. **Policy:** the named preview target, the candidate digest, 10% of traffic. Says no to 100%.
4. **Approval:** a named person approves the exact plan, for five minutes, once. Says no to a plan that changed after the yes.

Then verify: after the write, a fresh read. The demo's provenance values are synthetic records; production provenance needs a trusted signature verification.

### 5. Five guardrails, and their limits

| Guardrail | Where it helps | Where it does not |
| --- | --- | --- |
| 01 Query before mutation | Decisions rest on live state, not a cache or the model's memory | A read is not a lock. State can move before the write |
| 02 Idempotent assertions | A retry converges, and an unknown outcome is settled by reading | A wrong end state is applied just as reliably |
| 03 Policy gates | Code cannot be talked out of a decision, by a prompt or by data | A rule that permits a bad change permits it every time |
| 04 Scoped credentials and surfaces | One typed capability, and a key the model never holds | One broad key makes every other guardrail advisory |
| 05 Recovery paths | A denial ends in a report a person can act on. Nothing is replayed blind | A terminal approval is not an authenticated approval service |

### 6. Demo: what to watch

The setup: `checkout-preview` serves the live release; the candidate has an approved source, builder and signer and every check passed; the policy says preview takes 10%; the agent is `gpt-6-luna` with one query tool and one typed capability.

Watch for the query, the denial, the recovery.

### 7. Demo

Four minutes. [demo/runsheet.md](demo/runsheet.md) has the commands and the talk track.

1. `npm run blocked`: the agent queries, proposes 100%, and is denied at the policy boundary. Terminal.
2. `npm run promote`: a separate run proposes 10%. The plan, a named approval, the write, the verification.
3. `npm run audit`: the structured audit.

Do not auto-reformulate after the denial, and do not call the signature flag a signature check.

### 8. 05 Recovery paths

- **Blocked:** the gate said no. Terminal for the run. The agent reports the request and the rule, then stops. A new proposal is a new run, started by a person. Never: rephrase until it fits.
- **Unknown:** the write errored or timed out. Do not replay it. Read the live state; the revision says whether it landed. Never: retry blind.
- **Failed:** the fresh read disagrees with the plan. Surface it as a failure. A person looks before anything else runs. Never: success-shaped output.

Limits: an approval at a terminal is self-attested, not an authenticated operator interface. An audit trail is only as durable as the place it is stored. A read and a revision check narrow the race; they do not close it.

### 9. A failure the controls do not catch

A permitted change can still be wrong. Every boundary passed and the release has a defect in it. An approved source, builder and signer, passing checks and a valid signature do not establish that the software is correct. Add independent review of the change itself, runtime signals after the rollout, and a rollback plan that has been run before.

### 10. The ordered checklist

| # | Control | Guardrail | Effort |
| --- | --- | --- | --- |
| 1 | Writes off by default: the agent gets a read-only identity | 04 | Minutes |
| 2 | Keep the credential in the tool server, out of the model's context | 04 | An hour |
| 3 | Require a fresh read before any proposal, and bind the plan to it | 01 | A day |
| 4 | One typed, idempotent capability, not arbitrary commands | 02, 04 | Days |
| 5 | Policy in code, with tests: targets, bounds, provenance | 03 | Days |
| 6 | Plan-bound approval, verification by a fresh read, no blind retries | 05 | Ongoing |

### 11. What to take home

**Provenance informs. Policy constrains. Runtime evidence verifies.**

Repository: [stackql-labs/agentic-platform-engineering](https://github.com/stackql-labs/agentic-platform-engineering)

### 12. Thank you

The template's closing slide. Two minutes of transition follow the talk content. Sponsor acknowledgement remains pending approval.

## Open items

- **Slide 2:** "Trust is not a boolean" is the old title used as a slide heading. It needs Jeff's ear next to the accepted title.
- **Slides 4 and 5:** the densest two slides, 3:15 between them. If the dry run goes long, slide 5 can become one spoken line per row.
- **Demo:** live by default. If it is recorded instead, label the clip a recording.
- **Closing QR:** the template's closing slide carries the existing StackQL QR code. Version B's close points at this repository instead.
- **Sponsor acknowledgement:** still pending approval.
