# Stateless IaC for Agents: stackql-deploy

**Infracoders Melbourne, November meetup** - 10 November 2026 - presentation 1 of 2 - about 25 minutes including about 5 for Q&A.

**Thesis:** an agent should read the live estate freely and write only by asserting a reviewed declaration. `stackql-deploy` makes that practical because it keeps no state file: every build asks the provider what exists, compares it with what is declared, and creates or updates only what differs.

The deck is [slides/Stateless IaC for Agents.pptx](slides/Stateless%20IaC%20for%20Agents.pptx); speaker notes are in the file. The demo is in [demo/](demo/README.md), with an on-screen [runsheet](demo/runsheet.md). This outline is the running order and the clock.

## Running order

| # | Slide | Time | Clock |
| --- | --- | ---: | ---: |
| 1 | Title: Stateless IaC for Agents | 0:30 | 0:30 |
| 2 | StackQL: unified cross-plane analytics, automation and IaC | 0:45 | 1:15 |
| 3 | Cloud providers as data sources | 1:00 | 2:15 |
| 4 | How to use StackQL: one engine, four consumption patterns | 0:45 | 3:00 |
| 5 | Section: Agentic platform ops | 0:15 | 3:15 |
| 6 | IaC and platform ops in the agent era: four assumptions inverted | 1:15 | 4:30 |
| 7 | Infrastructure-as-code becomes infrastructure-as-context | 0:30 | 5:00 |
| 8 | The new contract: query, reason about and act on actual state | 0:45 | 5:45 |
| 9 | Section: StackQL MCP | 0:15 | 6:00 |
| 10 | What the StackQL MCP server is | 0:45 | 6:45 |
| 11 | The MCP tool surface, modes and audit | 1:00 | 7:45 |
| 12 | Section: stackql-deploy, the write path for agents | 0:15 | 8:00 |
| 13 | State file-less IaC | 1:30 | 9:30 |
| 14 | Read wide, write narrow | 1:30 | 11:00 |
| 15 | One declaration, every cell (the demo map) | 1:00 | 12:00 |
| 16 | Demo | 6:30 | 18:30 |
| 17 | Same interface, other jobs | 0:45 | 19:15 |
| 18 | What to take home | 0:30 | 19:45 |
| 19 | Thank you | 0:15 | 20:00 |

If the clock is behind at slide 12, cut slide 17 to one sentence and go from the demo to slide 18.

## What each new slide carries

### 12. stackql-deploy (section)

The MCP server is how an agent reads. `stackql-deploy` is how it should write. Open source, SQL-native, on the same engine. The one thing to remember: no state file.

### 13. State file-less IaC

- A resource is a file of SQL with named anchors: `exists`, `create`, `statecheck`, `update`, `exports`.
- `exists` and `statecheck` are SELECTs against the live API; `create` and `update` run only when they answer no.
- Run it twice and the second run changes nothing. Run it after drift and it converges.
- Nothing is remembered between runs, so nothing can disagree with reality.

Caveat to say aloud: no lock also means two writers can race. Idempotent assertions make a race converge; they do not make it atomic.

### 14. Read wide, write narrow

Two doors for an agent: one to look, one to change.

- Read: the StackQL MCP server in `read_only` mode. Any SELECT, control plane and data plane, credentials in the server process, every statement audited.
- Write: the agent cannot run a write statement and never edits the manifest or the queries. Its only write is asking for `stackql-deploy build` of the reviewed stack.
- Drift: the build runs the stack as written and puts things back. No file changes.
- Rollout: one line in one cell file (the release) moves to the release already approved in `rollout.env`. The gate makes that edit, not the model, after a person approves. Then the same build.
- Tuning (spoken, not in the demo): the rollout case with a different limit. One value, such as a rate limit, moves inside bounds declared in the manifest; the gate checks the number against the bounds, then the same build. Because the state check is a query it can also accept a range instead of one value, so a build leaves an in-range value alone and resets anything outside it. Range and set checks run today; a first-class tunable in the manifest is an idea, not a feature.
- In front of all three: policy in code, then a human on the exact command.
- The agent decides when to ask. The reviewed stack decides what changes.

If an agent should change what the stack says, that is a pull request, reviewed like any other change. It is not this path.

### 15. One declaration, every cell

The demo estate: an `orders` service in three cells (Sydney, Oregon, Frankfurt), each one region and one rollout wave. One manifest describes a cell; a file per cell says where it is and which release it runs. Release 1.5.0 is on the canary; the rest are on 1.4.0; Frankfurt is built on stage.

### 16. Demo

See the [runsheet](demo/runsheet.md). Five beats: build a cell from nothing and again; the whole rollout in one query; drift on the canary; the gate declining without the model; the agent converging the canary and promoting the next wave, each with an approval.

### 17. Same interface, other jobs

Rollout gate (the demo), posture sweep, incident triage, cost analysis, 3am drift review, environment reaper. The agent does not need a new tool per job: it needs SQL, discovery and a narrow way to write.

### 18. What to take home

Code declares intent. Context grounds the decision. Policy bounds the action.

## Likely questions

| Question | Short answer |
| --- | --- |
| How is this different from `terraform plan`, which also refreshes? | Plan refreshes into a state file that then has to be stored, locked and kept honest for every writer. Here the checks are queries you can read and run by hand, and there is no artefact to share between a pipeline, a person and an agent. |
| What stops two builds racing? | Nothing locks. Each assertion is idempotent, so a race converges rather than corrupts. If you need mutual exclusion, put it in the pipeline or the gate. |
| How do deletes work without state? | `teardown` runs the `delete` anchors in reverse order. A resource removed from the manifest is not deleted by a build; that is a deliberate difference from state-based tools. |
| Why not let the agent write SQL in `safe` mode with approvals? | It works, and the MCP server supports it. Asserting a declaration is narrower: the human approves a known command, not a statement they have to read for intent. |
| Which providers? | Anything in the StackQL registry: AWS, Google, Azure, Kubernetes, GitHub, Okta, Databricks, Snowflake, Cloudflare and others. The demo is AWS only. |
| Does the model see credentials? | No. They live in the stackql server and stackql-deploy processes. |
