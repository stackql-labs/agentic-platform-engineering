# demo: an agent at the rollout gate

Demo assets for "Stateless IaC for Agents: stackql-deploy" (Infracoders Melbourne, 10 November 2026, about 20 minutes plus Q&A). The talk argues that agents should read the live estate freely and write only by asserting a reviewed declaration. This demo is both halves on three AWS regions: `stackql-deploy` builds and converges the estate with no state file, and a small agent uses it as its only way to change anything.

## the scenario

An `orders` service runs as three cells, one per region: `syd` (ap-southeast-2), `pdx` (us-west-2) and `fra` (eu-central-1). Each cell is one rollout wave. A cell is a DynamoDB table with deletion protection on, and a release pointer (an SSM parameter that stands in for whatever your deploy flips). One `stackql-deploy` manifest declares a cell; a three-line file per cell says where it is, which wave it is in and which release it runs.

Release 1.5.0 is on the canary (`syd`, wave 0). The other cells are on 1.4.0. Since the canary went out, somebody switched deletion protection off on its table, outside the declaration.

A release agent is asked to move 1.5.0 forward by one wave. It reads the whole rollout with one SQL statement through the StackQL MCP server, sees the canary is not what was declared, finds who changed it and when in CloudTrail, and asks the platform to converge the canary and then promote the next wave. Whether either happens is decided by a gate the model cannot see or change.

## how it maps to the talk

| Idea (slide) | Where it shows in the demo |
| --- | --- |
| No state file, ask the provider | `scripts/build.sh fra` creates a cell from nothing; the same command again changes nothing; after the drift it converges. Each resource is `exists`, `create`, `statecheck`, `update` queries in `stack/resources/*.iql`. The directory holds no state. |
| Read wide | The agent's reads are SELECTs through the StackQL MCP server in `read_only` mode: the rollout board (three regions, two services, one statement) and CloudTrail. The server refuses writes and the agent is not given its write tools. |
| Write narrow | The agent has two tools of the platform's own: `cell_converge` and `cell_promote`. Each is a fixed `stackql-deploy` command against the reviewed stack. It cannot compose a mutation. |
| Policy bounds the action | `agent/src/policy.ts`: the cell must be declared, the release must be the rollout's candidate, waves go in order, one wave per run, and the gate checks the waves in front of a promotion itself with `stackql-deploy test`. Then a human approves the exact command. |
| One interface for provisioning and SRE | The same SQL surface provisions the cell, sweeps its posture, and attributes the drift (`aws.cloudtrail.events`). |

## layout

| Path | What it is |
| --- | --- |
| `stack/stackql_manifest.yml`, `stack/resources/*.iql` | the declaration of one cell: the table, its guardrails, the release pointer |
| `cells/syd.env`, `cells/pdx.env`, `cells/fra.env` | one file per cell: region, wave, declared release. No secrets |
| `rollout.env` | the rollout in flight: the candidate release and the one it replaces |
| `scripts/build.sh`, `test.sh`, `teardown.sh` | `stackql-deploy build`, `test` and `teardown` for one cell |
| `scripts/drift.sh` | the out-of-band change: deletion protection off on one cell's table |
| `scripts/board.sh`, `scripts/shell.iql` | the rollout board from the command line, and the same statements for `stackql shell` |
| `scripts/stage.sh` | puts the estate where the talk starts |
| `agent/src/agent.ts` | the agent: starts the MCP server read-only, wraps the tools so every call is drawn on screen, runs the loop, writes a transcript |
| `agent/src/policy.ts` | the gate's rules, a pure function, with `agent/test/policy.test.ts` |
| `agent/src/deploy.ts` | how the gate runs `stackql-deploy` and reads what it decided |
| `agent/src/cells.ts` | the cells and the rollout as the gate reads them; the one line a promotion changes |
| `agent/src/audit.ts` | `npm run audit`: every statement and every gate decision as one table |
| `agent/prompts/` | the system briefing and the intent, with placeholders filled from the declaration |
| `agent/audit/` (untracked) | audit sinks (JSONL) and transcripts, one per run |
| `recordings/` | a transcript of a full rehearsal, for `npm run replay` |

## prerequisites

- `stackql` (v1.0 or later) and `stackql-deploy` (2.4.0 or later) on the PATH
- Node 24.19 or later
- an AWS identity that can create and delete one DynamoDB table and one SSM parameter in each of the three regions, and call `cloudtrail:LookupEvents`. See `.env.example` for the exact actions
- an OpenAI API key

The first `scripts/build.sh` pulls the `aws` provider into `.stackql/` under the demo root; the agent's MCP server reads the same store. Run the scripts from Git Bash on Windows.

## setup

```bash
cp .env.example .env            # keys and model
cd agent && npm install && cd ..
scripts/stage.sh                # about 75 s: builds syd and pdx, removes fra, applies the drift
```

`scripts/stage.sh` creates real resources: per cell, one on-demand DynamoDB table named `orders` and one standard SSM parameter named `/orders/release`. Neither has a standing charge at this size. Remove them with `scripts/teardown.sh <cell>`.

## running order

[runsheet.md](runsheet.md) is the on-screen walkthrough with the talk track. In short:

| Beat | Command | What the room sees |
| --- | --- | --- |
| A cell from nothing | `scripts/build.sh fra` | `exists` says no, `create` runs, `statecheck` retries until the table is ACTIVE. About 30 s |
| The same again | `scripts/build.sh fra` | every resource "is in the desired state"; nothing changes. `ls -a`: no state file |
| The rollout board | `scripts/board.sh` | three regions and two services in one statement; `deletion_protection = false` on the canary |
| The gate, no model | `cd agent && npm run gate -- promote fra 1.5.0` | declined by policy: wave order. Instant |
| The agent | `npm run agent` | the board, CloudTrail, a convergence request and its approval, a promotion and its approval, the board again, a report. About 75 s with two approvals |
| The log | `npm run audit` | every statement and every gate decision, one row each |

## fallback

`npm run replay` (in `agent/`) replays the transcript in `recordings/` with the pacing of a run, under a banner that says it is a replay. Use it when there is no network or no key. Do not present it as a live run.

## after the talk

```bash
for c in syd pdx fra; do scripts/teardown.sh "$c"; done
```

Deletion protection is part of the declaration, so `teardown.sh` switches it off first.

## what it proves, and does not

- It demonstrates stateless build, re-run and convergence, and a gated agent write path, on one cloud (AWS) across three regions.
- A query is an observation, not a lock. There is no state lock either: two builds of the same cell can race. Idempotent assertions make a race converge; they do not make it atomic.
- The release pointer is a stand-in. Promoting a real service means whatever your deploy does; the gate and the declaration change work the same way.
- The approval at the terminal binds the answer to the exact command for whoever is at the keyboard. It is not an authenticated production approval service.
- The agent's blast radius is the credential's. The policy would still hold with a broader identity; the identity is the backstop.
- CloudTrail lookups run a few minutes behind. If the drift is newer than that, the agent says the change is not visible yet and still converges the cell.
- The S3 part of a cell was dropped: the `aws` provider version pinned here does not build the nested XML bodies S3 writes need. DynamoDB and SSM use JSON and work.

## status

Run end to end on 10 November 2026 on Windows 11 (Git Bash for the scripts, PowerShell or cmd for the agent) with stackql v1.0.888, stackql-deploy 2.4.0, the aws provider v26.08.00444, Node 24.22.1, `ai` 7.0.154, `@ai-sdk/openai` 4.0.102, `@ai-sdk/mcp` 2.0.85 and `gpt-6.1-sol`. `npm run typecheck` and `npm test` (28 tests, offline) pass.

| Beat | Wall time |
| --- | --- |
| `scripts/build.sh <cell>`, cell does not exist | 28 to 34 s, of which about 14 s is the deploy; the rest is stackql-deploy starting and stopping its server |
| `scripts/build.sh <cell>`, converged | 17 to 19 s |
| `scripts/test.sh <cell>` | about 18 s |
| `scripts/drift.sh`, `scripts/board.sh` | 2 to 3 s each |
| `scripts/stage.sh` | about 75 s |
| `npm run gate -- promote fra 1.5.0` | under 2 s |
| `npm run gate -- promote pdx 1.5.0` with the canary drifted | about 19 s (the gate runs `stackql-deploy test` on the canary and declines) |
| `npm run agent`, two approvals given promptly | 70 to 72 s, 7 steps, 6 tool calls, about 62k tokens in |
| `npm run audit`, `npm run replay` | about 1 s, about 25 s |

`recordings/agent_rehearsal_2026-11-10.txt` is the last full rehearsal of the day: drift found, attributed in CloudTrail, the canary converged, `pdx` promoted, both with approval.

The statements use the request body column names as the provider documents them (`TableName`, `DeletionProtectionEnabled`, `Path`). The `data__` prefixed form that `describe_method` prints is also accepted by this provider version; both were run against it on the day.
