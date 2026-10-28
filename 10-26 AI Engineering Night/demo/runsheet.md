# Runsheet

Terminal 1 is Git Bash (the scripts), Terminal 2 is PowerShell (the agent). No cluster, no proxy: the estate is one Cloudflare zone.

## Prerequisites

Before the day: push this folder to origin. The commits query and `out_of_band` read the manifest's history from GitHub and return nothing until it is there. Drift the zone after the push, so the rule's `last_updated` is newer than the newest commit.

**Terminal 1 (Git Bash):**

```bash
cd "/c/LocalGitRepos/stackql/demo-repos/agentic-platform-engineering/10-26 AI Engineering Night/demo"
scripts/shell.sh          # renders runs/shell.iql from .env
stackql shell             # from this directory: its .stackql holds the cloudflare and github providers
```

**Terminal 2 (PowerShell, 120 columns or wider):**

```powershell
cd "C:\LocalGitRepos\stackql\demo-repos\agentic-platform-engineering\10-26 AI Engineering Night\demo\agent"
npm run tools
# about a second: mode read_only, 15 tools, four marked [write]
```

The zone should already be drifted (threshold 5, description `TEMP bot scare 03:12 - put back later`). If it is not, in a Git Bash window:

```bash
scripts/restore.sh && scripts/drift.sh
```

## StackQL Background

**StackQL** is a SQL interface to cloud and SaaS APIs:

- providers are versioned interface documents pulled from a registry
- every query is a live API call
- there is no state file

The **StackQL MCP server** puts that surface in front of an agent as a small, fixed set of tools:

- **universal**: same query shape across every provider
- **self-describing**: the agent discovers the one contract it needs, not a tool per API
- **gated**: the server mode decides whether a write runs, not the prompt
- **audited**: every statement is an event

### Quick demo, Terminal 1 (`stackql shell`, paste from `runs/shell.iql`):

```sql
-- What is live: the rate limit rule on the zone
SELECT json_extract(rules, '$[0].description') AS description,
       json_extract(rules, '$[0].ratelimit.requests_per_period') AS threshold,
       json_extract(rules, '$[0].ratelimit.period') AS period,
       json_extract(rules, '$[0].enabled') AS enabled,
       last_updated
FROM cloudflare.rulesets.phases
WHERE zone_id = '<zone id>' AND ruleset_phase = 'http_ratelimit';
```

Threshold 5 against a declared 100, and a description that says someone meant to put it back. The `last_updated` is the 3am. (The shell wraps the description over two lines; the numbers are on the first.)

Same query shape, different provider:

```sql
-- What is declared, and when it last changed
SELECT substr(sha, 1, 7) AS sha,
       json_extract(commit, '$.author.date') AS committed,
       json_extract(commit, '$.author.name') AS author,
       json_extract(commit, '$.message') AS message
FROM github.repos.commits
WHERE owner = 'stackql-labs' AND repo = 'agentic-platform-engineering'
  AND path = '10-26 AI Engineering Night/demo/stack/stackql_manifest.yml'
ORDER BY committed DESC LIMIT 3;
```

The declaration last changed before the rule did. Nobody changed the intent; someone changed the zone. (Zero rows means the folder is not on origin yet; the agent says "not observed" and carries on.)

One question across the two (`CROSS JOIN`; the comma form of the join does not plan):

```sql
-- Did the rule change after the declaration did?
SELECT r.last_updated AS rule_changed,
       c.committed    AS declaration_changed,
       r.last_updated > c.committed AS out_of_band
FROM (SELECT last_updated FROM cloudflare.rulesets.phases
      WHERE zone_id = '<zone id>' AND ruleset_phase = 'http_ratelimit') r
CROSS JOIN
     (SELECT max(json_extract(commit, '$.author.date')) AS committed FROM github.repos.commits
      WHERE owner = 'stackql-labs' AND repo = 'agentic-platform-engineering'
        AND path = '10-26 AI Engineering Night/demo/stack/stackql_manifest.yml') c;
```

`out_of_band = 1`: that is the diagnosis, in one query, across two providers. (`null` in both right-hand columns until the folder is pushed.)

```sql
-- Who is being blocked: requests by edge status in the last hour
SELECT edge_response_status AS status, sum(requests) AS requests
FROM cloudflare.zones.http_requests_adaptive_groups
WHERE zone_tag = '<zone id>' AND since = '<1h ago>' AND until = '<now>'
GROUP BY edge_response_status ORDER BY requests DESC;
```

429s, if there has been traffic. Zero rows is a valid answer; say so. In rehearsal the hour held a few dozen 200s and 403s and no 429s: nothing had tripped the rule, and the agent said so rather than inventing a count.

## Overview

This is a scheduled platform agent that...

- reads the live state of a Cloudflare zone through StackQL
- compares it with what the stack manifest declares, and when that declaration last changed
- decides whether to converge, and proposes exactly one write

Whether that write runs is decided by three gates the platform owns, none of which the model can change: a policy in code, the server's mode, and a human at the terminal.

| File | Point at |
| --- | --- |
| [stack/stackql_manifest.yml](stack/stackql_manifest.yml#L31-L46) | The desired state (no state file). |
| [stack/resources/rate_limit.iql](stack/resources/rate_limit.iql#L7-L24) | The assertion: one REPLACE, the same whether it creates or converges. |
| [agent/prompts/intent.md](agent/prompts/intent.md#L11-L37) | The briefing, in prose: live state first, then decide, one write at most. |
| [agent/prompts/system.md](agent/prompts/system.md#L38-L53) | The mutation surface: one statement, given to the model verbatim. |
| [agent/src/policy.ts](agent/src/policy.ts#L1-L14) | The policy gate: four rules, pure function, tested. |
| [agent/src/agent.ts](agent/src/agent.ts#L70-L75) | The platform sets the server mode in code (`read_only` or `safe`, never `full_access`). |
| [agent/src/agent.ts](agent/src/agent.ts#L268-L285) | The gate wraps the write tool: policy first, then the server, then the human. |
| `.env` | The token: scoped to one zone, held by the server process, never seen by the model. |

## Run

**Terminal 2 (PowerShell, in `demo/agent`):**

The agent runs in `read_only` mode: it reads the rule, the commits and the traffic, diagnoses out-of-band drift, proposes the one permitted write, and the server refuses it. The agent reports and stops; it does not retry.

```powershell
npm run agent
```

25 to 30 seconds, 5 steps. On screen, in order: the `edge-agent` box (model, mode, tools, zone), the declared table, then one block per statement:

- `[01]` `run_select_query`, the rule: `TEMP bot scare 03:12 - put back later`, threshold 5, the `last_updated`
- `[02]` `run_select_query`, the commits: rows once the folder is pushed, `{"rows":[]}` until then
- `[03]` `run_select_query`, the traffic: a row per edge status for the hour
- `[04]` `run_mutation_query`, the REPLACE, then `-> BLOCKED: tool "run_mutation_query" refused: server is in 'read_only' mode`

Then the report: a four-cell status table ending in `remediate`, the evidence with the rule id and timestamps, the statement "submitted, refused", the statements it ran. Then the `run` box: `steps 5`, `tool calls run_select_query=3 run_mutation_query=1`, `writes attempted 1`, about 46k tokens in, the audit sink and the transcript paths.

The same proposal, replayed through the gates with the server in `safe` mode: the policy passes it, the approval box appears, type `y`, and the rule is restored. This is the recovery path for a blocked change: a human, the exact statement, nothing else.

```powershell
$env:STACKQL_MCP_MODE='safe'; npm run probe
```

Under ten seconds plus the pause at the prompt. `mode safe`, `source agent\audit\last-proposal.sql`, the write on one line, then the `APPROVAL REQUIRED` box with the server's question, `Approve run_mutation_query (mutation_create)?`, and the full statement. `approve? [y/N]`, type `y`. The result: `Mutation Result`, `The operation was despatched successfully`, and a timestamp. Terminal 1, first query again: threshold 100, the declared description, a new `last_updated`.

A plausible write that is not the declaration (threshold 1000). The policy declines it before it reaches the server or a human; nobody is asked. The mode is still `safe` in this window; the policy runs first either way.

```powershell
npm run probe -- ../scripts/denied.sql
```

About two seconds, and the one line that matters, in red:

```text
tool "run_mutation_query" declined by policy (declaration): not the declared rule: $[0].ratelimit.requests_per_period: 1000 vs declared 100
```

No box, no server record: the decline is the gate's own audit record.

The audit sink: every run of the evening in one table, oldest first, local time: the tool, the mode, the decision, the duration and the statement. Never the rows returned. The policy decline is in there too.

```powershell
npm run audit
```

Expect: three `allow` rows and one `refuse_immediate` from the `read_only` run, one `needs_approval_accepted` from the `safe` run (with its duration), one `declined_by_policy` from the gate.

[OPTIONAL] The other recovery path: no agent, no approval, re-assert the declaration. The createorupdate anchor runs the same REPLACE whether the rule is missing, drifted or already right, and the statecheck confirms it: `[rate_limit] is in the desired state`. The same command that created it. Git Bash:

```bash
scripts/restore.sh
```

About 17 seconds, most of it stackql-deploy starting its own server. With `--show-queries` every statement is printed in full: the REPLACE, the exists check, the statecheck, the exports; readable SQL, not JSON. The script then reads the rule back: threshold 100, the declared description, a new `last_updated`.

## Summary

- the agent queried reality before it acted;
  - the live rule, the declaration's history, the traffic, and every decision was grounded in what the API returned
- it worked two providers, Cloudflare and GitHub, through one query shape;
  - with no SDK and no tool per API
- it could propose exactly one write, an assertion of the declaration;
  - idempotent, so a retry or a re-run is safe
- whether that write ran was decided by the platform, three times;
  - policy in code, server mode, a human bound to the exact statement
- blocked meant report and stop, not rephrase and retry;
  - and recovery was a human through the gate, or the declaration re-asserted
- every statement it ran is already an audit event

## Full reset

```bash
cd "/c/LocalGitRepos/stackql/demo-repos/agentic-platform-engineering/10-26 AI Engineering Night/demo"
scripts/restore.sh && scripts/drift.sh
```

## Troubleshooting

- No network or no key: `npm run replay` (banner says replay; say so). It plays the newest transcript in `agent/audit/`, else `recordings/agent_dry-run_2026-10-29.txt`; a file can be given: `npm run replay -- ../recordings/agent_dry-run_2026-10-29.txt`.
- `npm run probe` approves without asking: the server is still `read_only` in this shell, or stdin is not a TTY. Check `$env:STACKQL_MCP_MODE`, use a plain PowerShell window.
- `npm run probe` with no file replays the agent's last proposal, never the denied statement: only the agent writes `agent/audit/last-proposal.sql`.
- Cloudflare rejects the REPLACE (400): the token is missing Zone WAF Edit, or the free-plan constraints were changed (period 10, both characteristics, `starts_with`).
- GitHub query returns zero rows: the demo folder has not been pushed yet, or `DECLARATION_PATH` differs from the path in the repo.
- `stackql shell` cannot find a provider: stackql's approot is `.stackql` under the directory it runs from. Run it from the demo root, where `scripts/build.sh` pulled cloudflare, and pull github there once: `stackql exec "REGISTRY PULL github"`.
- `stackql exec` says `unknown flag: --`: the statement starts with a `--` comment line, which the CLI reads as a flag. The scripts strip comment lines; paste statements without their leading comments.
- The agent takes extra steps: the briefing gives the traffic window and tells it not to use `CURRENT_TIMESTAMP`, `strftime` or `CAST(... AS INTEGER)`, which do not parse. `AGENT_MAX_STEPS` (12) still caps a bad day.
