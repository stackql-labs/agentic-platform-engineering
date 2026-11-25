# demo: one safety setting on a production table

Demo assets for version B of "Query before mutation: guardrail patterns for agents that touch production infrastructure" (AI Engineer Sydney, 8 December 2026). The talk shows a write being blocked, explains four guardrails from what was just watched, then shows the same write recovered. This demo is both halves.

It is a small TypeScript program on the OpenAI SDK (Responses API) with `gpt-6-luna`, and the StackQL MCP server started over stdio from npm (`@stackql/mcp-server`). It runs against a real AWS account.

## the scenario

A production DynamoDB table called `orders` in `ap-southeast-2`. Deletion protection, the setting that stops the table being deleted by accident, should be on and is off. An agent is asked to put it back.

There is no backstory about who changed it or when. One table, one setting, one statement.

## what the model decides, and what it does not

The model has two tools, both on the one MCP server: `run_select_query` and `run_mutation_query`. It decides what to read and what to propose. Everything after that is the system's.

| Step | Who | Where |
| --- | --- | --- |
| Look | the agent, and later the system again | a `SELECT` through the MCP server; the harness notes what was seen and when |
| Propose | the agent | one `UPDATE` sent to `run_mutation_query`; it goes to the gate, not to the server |
| Check | the system | `src/policy.ts`, a pure function with tests |
| Apply | the system, after a named approval | the same server in `safe` mode, which asks before every write |
| Look again | the system | a fresh `SELECT`; nothing is believed until the provider shows it |

## how it maps to the talk

| Pattern (slide) | Where it shows in the demo |
| --- | --- |
| 01 Look before you write | The first thing the agent does is read the table. The gate refuses a write with no fresh read behind it (rule `look-first`), and the system reads again before it applies. |
| 02 Say the end state, not the steps | The proposal is one statement: `SET DeletionProtectionEnabled = true`. If the end state already holds, the gate answers `already-so` and nothing is sent. |
| 03 Rules in code, not in the prompt | `src/policy.ts`. Three outcomes: refused (never allowed, nobody is asked), held (allowed, but not without a person), allowed (a named approval for this exact statement). |
| 04 The model never holds the key | The harness gives the AWS credential to the server process and nothing to the model. The model-facing server is `read_only`, so it would refuse the write even if the gate were wrong. |
| 05 Blocked means stop. Failed means look again. | After a held or refused write the model has no tools left, only a report. A failed write is followed by a fresh look and at most one re-assert. |

## prerequisites

- Node 22.23.4 or later (24.22.1 or later on the 24 line). The sources are TypeScript and run on Node directly; there is no build step.
- An OpenAI API key with access to `gpt-6-luna`.
- AWS credentials for one account, in the environment or in `.env`. The identity needs `dynamodb:CreateTable`, `DescribeTable`, `UpdateTable` and `DeleteTable` in `ap-southeast-2`.

Nothing else. The npm launcher downloads the `stackql` binary on first run, and staging pulls the `aws` provider if it is missing.

## setup

```bash
cp ../../.env.example ../../.env     # OPENAI_API_KEY, and AWS keys if they are not in your environment
npm install
npm run stage                        # creates the table if needed, switches protection off. About 20 s
```

`npm run stage` creates a real resource: one on-demand DynamoDB table named `orders` with no items. It has no standing charge. Remove it with `npm run teardown`.

## running order

[runsheet.md](runsheet.md) is the walkthrough for recording the two clips. In short:

| Beat | Command | What is on screen |
| --- | --- | --- |
| Demo 1 - Blocked | `npm run agent` | the job, the one tool, a look (`false`), a proposal, an amber `HELD - write path off`, the agent's report. About 5 s |
| Demo 2 - Recovered | `npm run approve` | the held statement, a name and a yes, a look (`false`), a green `APPLIED`, a look again (`true`). About 4 s after the prompts |
| Run it twice | `npm run agent` | a look (`true`), nothing to do. About 4 s |
| The record | `npm run audit` | who proposed, who decided, who approved, what ran |

Two optional beats:

| Beat | Command | What is on screen |
| --- | --- | --- |
| A delete is refused | `npm run refused` | the agent proposes `DELETE FROM aws.dynamodb.tables ...`; red `REFUSED`, rule `never-delete`. Nobody is asked |
| A failed write is recovered | `npm run stage:hot`, `npm run agent`, `npm run approve` (inside 15 s of staging) | the provider throttles the write; `FAILED - look again`, a look, a 16 s wait, one re-assert, `APPLIED` |

## fallback

`npm run replay` plays the transcripts in `recordings/` with the pacing of a run, under a banner that says it is a replay. `npm run replay -- blocked`, `recovered`, `failed` or `refused` plays one. Use it when there is no network or no key. Do not present it as a live run.

## tests

```bash
npm test          # 17 tests, offline: no model, no server, no cloud
npm run typecheck
```

The tests cover the gate: every rule, the approval's binding to its statement, its window and its single use, and the answer the system gives when the server asks before a write.

## layout

| Path | What it is |
| --- | --- |
| `src/agent.ts` | Demo 1: the model loop, the look, the proposal, the gate's decision on screen |
| `src/approve.ts` | Demo 2: the named approval, then look, check, apply, look again. No model |
| `src/policy.ts` | the gate: a pure function, with `test/policy.test.ts` |
| `src/platform.ts` | starts the StackQL MCP server over stdio; decides what the server process is given and which mode it runs in |
| `src/target.ts` | the statements the system itself runs: the look, and the end state |
| `src/ledger.ts`, `src/audit.ts` | the record (one JSON line per event) and `npm run audit` |
| `src/stage.ts` | `npm run stage` and `npm run teardown`. The only place a `full_access` server is started, and never with a model |
| `src/replay.ts` | the replay |
| `prompts/` | the system briefing and the job |
| `recordings/` | transcripts of real runs, for the replay |
| `runs/` (untracked) | transcripts, the record, the server's own audit sink, the held statement |

## what it proves, and does not

- It demonstrates a blocked write, a named approval and a verified apply, on one cloud, one table and one setting.
- A look is an observation, not a lock. The system looks again before it applies, which narrows the window and does not close it.
- The approval is a name typed at a terminal. It binds the answer to the exact statement, for five minutes, once. It is not an authenticated approval service.
- The agent's blast radius is the credential's. The gate would still hold with a broader identity; the identity is the backstop.
- Putting the setting back does not undo anything that happened while it was off.
- All five patterns can pass and the change can still be wrong, if what was asked for was wrong.

## status

Run end to end on 25 November 2026 on Windows 11 with Node 24.22.1, `openai` 7.64.0, `@modelcontextprotocol/sdk` 1.32.2, `@stackql/mcp-server` 1.1.959 (stackql 1.1.959), the `aws` provider v26.08.00444 and `gpt-6-luna`. `npm test` (17 tests) and `npm run typecheck` pass.

| Beat | Wall time | Model use |
| --- | --- | --- |
| `npm run stage`, table exists | 2 s when nothing has to change, 20 s when protection has to be switched off (16 s of that is the wait). Creating the table was not timed | none |
| `npm run agent`, held | 4.6 to 5.5 s, 3 steps, 2 tool calls | about 2,200 tokens in, 200 out, $0.0003 |
| `npm run approve`, with `--as` and `--yes` | about 4 s | none |
| `npm run agent`, nothing to do | 2.7 to 4.4 s, 2 steps | about 1,400 tokens in, 90 out, $0.0002 |
| `npm run refused` | about 4 s, 3 steps | about 2,200 tokens in, 160 out, $0.0003 |
| `npm run audit` | under 1 s | none |

The wall times include starting Node and the MCP server, which is about a second of each.

Things found on the day that shaped the code:

- DynamoDB allows one change to deletion protection in 15 seconds. `npm run stage` waits that out so the approved write is not throttled; `npm run stage:hot` does not, which is how the failed-write beat is staged.
- The provider's request columns are the unprefixed names (`TableName`, `DeletionProtectionEnabled`). The `data__` prefixed snake case names that `list_methods` and `describe_method` print are not accepted in a statement, so the system prompt gives the model the shapes and the model is not given the discovery tools.
- The MCP SDK's stdio transport passes the server a short default environment, not the caller's. The harness adds the AWS variables by name, and that is the whole of what the server knows.
