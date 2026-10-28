# demo: the 3am rate limit

Demo assets for "Query before mutation: guardrail patterns for agents that touch production infrastructure" (AI Engineering Night, Melbourne, 29 October 2026, 18 minutes including demo and Q&A). The talk makes the argument (the human pause is gone; put the judgement back into the system); this demo is where StackQL appears, as the implementation of the guardrails.

## the scenario

One Cloudflare zone (a throwaway, free plan), with one rate limit rule declared in a `stackql-deploy` manifest and asserted against the live API with no state file: block any client over 100 requests per 10 seconds. At 3am someone saw a burst of bot traffic, tightened the rule in the dashboard to 5, left a note in the description, and went back to bed. Every page load with more than five assets now gets a 429.

That is drift, and it is hurting. A scheduled platform agent reviews the zone with the StackQL MCP server as its only tool surface, reads the live rule, reads when the declaration last changed (GitHub), reads the last hour of traffic, and decides. It can propose exactly one write: the assertion of the declared rule. Whether that write runs is decided by three gates the platform owns and the model cannot change.

## how it maps to the talk

| Guardrail (slide) | Where it shows in the demo |
| --- | --- |
| 01 Query before mutation | The agent's first statements are `SELECT`s against `cloudflare.rulesets.phases`, `github.repos.commits`, `cloudflare.zones.http_requests_adaptive_groups`. It proposes nothing until it has read live state, and it reads the declaration's history too. |
| 02 Idempotent assertions | `scripts/build.sh` is one `stackql-deploy build`: the createorupdate anchor runs the same REPLACE whether the rule is missing, drifted or already right, and the statecheck confirms it. The same command creates the rule and converges it after the drift. The agent's one permitted write is that same assertion, so a retry changes nothing. |
| 03 Policy gates | `agent/src/policy.ts`: four rules, in code, checked before the statement leaves the agent process. Then the server mode: `read_only` refuses, `safe` asks. Then a human, bound to the exact statement. |
| 04 Scoped credentials and mutation surfaces | The token is scoped to one zone and lives in the server process, never in the model's context. The mutation surface is one statement on one resource, given to the model verbatim; the policy declines anything else, field for field. |
| 05 Recovery paths | Blocked: the agent reports the statement and stops; it does not rephrase or retry. A human replays it through the gate (`npm run probe` in `safe`), or the declaration is re-asserted (`scripts/restore.sh`). Failed: re-assert; the build is idempotent. |

## layout

| Path | What it is |
| --- | --- |
| `stack/stackql_manifest.yml`, `stack/resources/rate_limit.iql` | the estate and the declaration: one rate limit rule, a post-build summary query |
| `agent/src/agent.ts` | the agent. Starts the MCP server in the mode the platform chose, renders the prompts with the declared rule and the permitted write, wraps the write tool with the policy, runs the loop, prints every statement, writes a transcript |
| `agent/src/policy.ts` | the policy gate: a pure function, `check(sql, declared)`, with `agent/test/policy.test.ts` |
| `agent/src/declaration.ts` | the declared rule and the permitted write, rendered from the manifest; `agent/test/declaration.test.ts` checks it against the `.iql` anchor field for field |
| `agent/src/console.ts` | the screen: colour, box-drawing frames and tables, the renderer for the model's markdown report |
| `agent/src/audit.ts` | `npm run audit`: every audit sink of the session as one table |
| `recordings/` | the transcript of the dry run, for `npm run replay` |
| `agent/prompts/system.md` | the briefing: the surface, the resource shapes, the one permitted write |
| `agent/prompts/intent.md` | the intent: the scheduled review, with `{{ placeholders }}` filled from `.env` and the manifest |
| `scripts/_env.sh` | sourced by the scripts: `.env`, defaults, refuses to run without a named zone |
| `scripts/build.sh` | `stackql-deploy build`: the rule, and the convergence |
| `scripts/drift.sh`, `scripts/drift.sql` | the 3am change, one statement |
| `scripts/traffic.sh` | a burst of requests at the zone, so the hour of traffic has 429s in it |
| `scripts/restore.sh` | `build.sh` under the name the running order uses, then the rule read back |
| `scripts/shell.sh`, `scripts/shell.iql` | the human view of the same estate, for `stackql shell` |
| `scripts/denied.sql` | a plausible write that is not the declaration, for the policy beat |

## prerequisites

- `stackql` on PATH ([downloads](https://stackql.io/downloads)), with the `cloudflare` and `github` providers pulled (`stackql exec "REGISTRY PULL cloudflare"`, `stackql exec "REGISTRY PULL github"`). stackql's approot is `.stackql` under the directory it runs from: the first `scripts/build.sh` pulls `cloudflare` into the demo root's, `stackql shell` there needs `github` too, and the agent's MCP server uses `~/.stackql` (the launcher's default), which needs both. Or set `STACKQL_APPROOT` in `.env` and keep one store.
- `stackql-deploy` on the Git Bash PATH (`pip install stackql-deploy`); otherwise set `STACKQL_DEPLOY` in `.env` to the exe
- a Cloudflare zone you do not care about, on the free plan, and an API token scoped to that zone: Zone WAF Edit, Zone Read, Account Analytics Read
- Node 24 or later
- an OpenAI API key

Windows notes: run the scripts from Git Bash. `stackql-deploy` needs `PYTHONUTF8=1` (the scripts set it).

## setup

```bash
cp .env.example .env            # keys, zone, model
scripts/build.sh                # the rule, from nothing, in a few seconds
scripts/drift.sh                # the 3am change
cd agent && npm install
```

## running order

Before the talk: rule built, `scripts/drift.sh` applied, `scripts/shell.sh` rendered, `scripts/traffic.sh` run within the hour, a terminal in `agent/` with a wide window. [runsheet.md](runsheet.md) is the on-screen walkthrough.

| Beat | Command | What the room sees | Guardrail |
| --- | --- | --- | --- |
| The zone at 3am | `stackql shell`, paste from `runs/shell.iql` | threshold 5 (declared 100), the note in the description, `last_updated` at 3am; the declaration's last commit, older; `out_of_band = true` from one query across two providers; 429s if there has been traffic, and optionally the share and the per-minute shape with a CTE and window functions | 01 |
| The agent, `read_only` | `npm run agent` | the declared table; one frame per statement: rule, commits, traffic; the diagnosis; the one write proposed; the server refuses it; the agent reports and stops | 01, 03, 04, 05 |
| The gate, `safe` | `STACKQL_MCP_MODE=safe npm run probe` | the agent's proposal replayed: policy passes it, the approval box, `y`, the rule is restored | 03, 05 |
| The policy | `npm run probe -- ../scripts/denied.sql` | threshold 1000: declined by policy, `$[0].ratelimit.requests_per_period: 1000 vs declared 100`, before the server or a human is involved | 03, 04 |
| The event log | `npm run audit` | every run of the session in one table: the statement, the mode, the decision, one record each, including the policy decline | 03 |
| Converge (optional) | `scripts/restore.sh` | `stackql-deploy build`: the same REPLACE runs, the statecheck confirms it, the rule is read back where the manifest says | 02, 05 |

Say which mode the server is in before each run.

## fallback

`npm run replay` replays the newest transcript from `agent/audit/` (or `recordings/`) with the pacing of a run, under a banner that says it is a replay. Use it when there is no network or no key. Do not present it as a live run.

## what it proves, and does not

- It demonstrates the five guardrails on one public cloud (Cloudflare) plus one SaaS provider (GitHub), with the policy enforced in code, the mode enforced by the server, and the convergence done by a declarative build.
- A query is an observation, not a lock. The agent re-reads after a change; nothing here is an atomic precondition.
- The approval at the terminal is the MCP elicitation flow answered by whoever is at the keyboard. It binds the answer to the exact statement; it is not an authenticated production approval service.
- The agent's blast radius is the token's: one zone, WAF edit. A broader token would widen it silently; the policy would still hold, the token is the backstop.
- The traffic query needs traffic; `scripts/traffic.sh` makes some. Zero rows is a valid answer and the agent is told to say so.
- `safe` trusts the MCP client to show the prompt to a person; against an untrusted client use `read_only` or a narrowed tool set.

## status

Run end to end on 29 October 2026 on Windows 11 (Git Bash for the scripts, PowerShell for the agent) with stackql v0.12.824, `@stackql/mcp-server` 0.12.824, the cloudflare provider v26.07.00424, github v26.08.00448, stackql-deploy 2.4.0, Node 24.19.0, `ai` 7.0.154, `@ai-sdk/openai` 4.0.102, `@ai-sdk/mcp` 2.0.85 and `gpt-6.1-sol`. `npm run typecheck` and `npm test` (19 tests) pass; the `.iql` anchor and the agent's rendered statement are checked field for field.

| Beat | Wall time |
| --- | --- |
| `scripts/build.sh`, create or converge | 15 to 17 s, of which 2 to 3 s is the deploy; the rest is stackql-deploy starting its server |
| `scripts/drift.sh` | about 1 s |
| `scripts/traffic.sh` | about 7 s for 30 requests over one connection |
| `npm run tools` | about 1 s |
| `npm run agent`, `read_only` | 25 to 30 s, 5 steps, 4 tool calls, about 46k tokens in |
| `npm run probe`, `safe`, approved | about 7 s plus the pause at the prompt |
| `npm run probe -- ../scripts/denied.sql` | about 2 s |
| `npm run audit` | about 1 s |
| `npm run replay` | about 10 s |

`recordings/agent_dry-run_2026-10-29.txt` is the `read_only` run against the drifted zone, recorded after the folder was merged to `main`, so the commits query returns the manifest's history and the traffic query shows the 429s from `scripts/traffic.sh`. The zone was left drifted, ready for the talk. The server's three start-up lines on stderr are dropped from the screen; anything else it writes there still shows.
