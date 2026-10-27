# demo: the 3am drift review

Demo assets for "AI Native Platform Engineering: Agents as the Primary Consumer" (Cloud Native AI Summit Melbourne, 28 October 2026). The talk builds the argument (the four assumptions IaC was built on, where the model strains, the new contract, six patterns that hold up); this demo is where StackQL appears, as the implementation of those patterns.

## the scenario

A small Kubernetes estate, declared in a `stackql-deploy` manifest and asserted against the live API with no state file. At 3am an on-call engineer did two things with `kubectl` that never went through the pipeline:

- pointed `checkout` at a hotfix image tag that does not exist, so the rollout is stuck in `ImagePullBackOff` while the old pod keeps serving;
- scaled `web` from the declared 2 replicas to 4 during a traffic spike.

Both are drift. One is an outage. A scheduled platform agent reviews the namespace with the StackQL MCP server as its only tool surface, compares what is running with what is declared, and decides per deployment: remediate, escalate or accept. The platform, not the prompt, decides whether its one proposed write runs.

This is the shape of most production incidents: Komodor's 2025 enterprise Kubernetes report attributes 79% of production incidents to a recent change, and manual `kubectl` edits made during an incident and never committed are the textbook source of drift ([Komodor report summary](https://www.businesswire.com/news/home/20250917424603/en), [Cast AI on configuration drift](https://cast.ai/blog/kubernetes-configuration-drift/), [KodeKloud on GitOps drift](https://notes.kodekloud.com/docs/Prep-Course-Certified-Cloud-Native-Platform-Engineering-CNPE/GitOps-and-Continuous-Delivery/GitOps-Explained-Desired-State-Drift-and-Reconciliation/page.md)). A GitOps controller would revert both changes blindly. The point of the demo is an agent that reads reality, reads intent, and reasons about the difference.

## how it maps to the talk

| Pattern (slide) | Where it shows in the demo |
| --- | --- |
| 01 Query before mutation | The agent's first statements are `SELECT`s against `k8s.apps.deployments`, `k8s.core.pods`, `k8s.core.events`. It proposes nothing until it has read live state. |
| 02 Idempotent assertions | `scripts/build.sh` is one `stackql-deploy build`: exists -> create, statecheck -> update. The same command builds the estate and converges it after the drift. |
| 03 Bi-temporal view | What is: the live queries. What was: the Warning events and the audit log of earlier runs. What should be: the manifest, which the agent reads as its declared-intent table. Drift becomes diagnosable, not an alarm. |
| 04 Agents as event sources | Every tool call is one record in the server's audit sink, a JSONL file per run in `runs/` (statement, mode, decision, duration, never the rows). `npm run audit` shows the run as an event log. The same sink can be written as OTLP/JSON for an OpenTelemetry collector (`--mcp.log.format=otel`). |
| 05 Universal interfaces | One query shape: the same `SELECT ... WHERE` against the cluster and against GitHub (`github.repos.releases`) to check whether the hotfix tag exists upstream. |
| 06 Policy gates | The server mode is set by the platform in code. `read_only` refuses the write however the model asks; `safe` raises an MCP elicitation and a human approves or declines, bound to the exact statement. `AGENT_MAX_STEPS` bounds the run. |

## layout

| Path | What it is |
| --- | --- |
| `stack/stackql_manifest.yml`, `stack/resources/*.iql` | the estate and the declaration: namespace, two deployments (one resource file, two uses), service, a post-build summary query. The `upstream` prop names the GitHub project behind each image. |
| `agent/src/agent.ts` | the agent, one file. Starts the MCP server in the mode the platform chose, renders the prompts with the declared-intent table, runs the loop, prints every statement, writes a transcript |
| `agent/src/audit.ts` | `npm run audit`: the newest audit sink (`runs/stackql_mcp_server_<timestamp>.jsonl`) as a table |
| `agent/prompts/system.md` | the briefing: how to work the surface through StackQL, dialect facts, the write rules |
| `agent/prompts/intent.md` | the intent: the scheduled drift review, with `{{ placeholders }}` filled from `.env` and the manifest |
| `scripts/_env.sh` | sourced by the scripts: `.env`, defaults, every `kubectl` pinned to the kind context |
| `scripts/setup.sh` | tools, kind cluster, agent dependencies |
| `scripts/proxy.sh` | `kubectl proxy` for the k8s provider (leave it running) |
| `scripts/build.sh` | `stackql-deploy build`: the estate, and the convergence |
| `scripts/drift.sh` | the 3am changes, made with `kubectl` on purpose |
| `scripts/restore.sh` | `build.sh` under the name the running order uses |
| `scripts/shell.iql` | the human view of the same estate, for `stackql shell` |
| `scripts/teardown.sh` | delete the kind cluster |
| `agent/src/fixture-agent.ts`, `offline.ts`, `safety.ts`, `tracks.ts` | the offline fixture runner used by the AI Engineer workshop and CI (`npm run smoke`, `npm test`); not part of this demo |
| `k8s/agent-cronjob.yaml`, `agent/Dockerfile` | the agent as a scheduled workload; written, not exercised for this talk |

## prerequisites

- `stackql` on PATH ([downloads](https://stackql.io/downloads)), with the `k8s` and `github` providers pulled (`stackql exec "REGISTRY PULL k8s"`, `stackql exec "REGISTRY PULL github"`)
- `stackql-deploy` (`pip install stackql-deploy`); on Windows set `STACKQL_DEPLOY` in `.env` to the exe if it is not on the Git Bash PATH
- `kind`, `kubectl`, Docker Desktop (running)
- Node 24 or later
- an Anthropic API key

Windows notes: run the scripts from Git Bash. `stackql-deploy` needs `PYTHONUTF8=1` (the scripts set it). On a Docker Desktop with cgroup v1, kind's newest node image does not bootstrap (kubeadm times out waiting for the control plane); set `KIND_NODE_IMAGE=kindest/node:v1.33.1` in `.env` before `scripts/setup.sh`.

## setup

```bash
cp .env.example .env            # ANTHROPIC_API_KEY; the defaults suit a local kind cluster
scripts/setup.sh                # kind cluster, npm install
scripts/proxy.sh                # second terminal, leave it running
scripts/build.sh                # the estate, about a minute from nothing
```

## running order

Before the talk: proxy up, estate built, `scripts/drift.sh` applied, 30 seconds for the rollout to stall, a terminal in `agent/` with a wide window.

| Beat | Command | What the room sees | Pattern |
| --- | --- | --- | --- |
| The estate at 3am | `stackql shell --approot "$STACKQL_APPROOT"`, paste from `scripts/shell.iql` | web 4 of 4 (declared 2), checkout 1 wanted, 1 ready, 1 unavailable, image `:1.0.1-hotfix`; the Warning events; the same query shape against GitHub | 01, 03, 05 |
| The agent, `read_only` | `npm run agent` | the declared table, then the statements stream past: library search, describe, select; the diagnosis; web escalated, checkout remediation proposed; the write refused by the server | 01, 03, 05, 06 |
| The gate, `safe` | `STACKQL_MCP_MODE=safe npm run probe` | the agent's last proposed statement, sent to a safe-mode server: the approval box; approve it, and the checkout image is restored | 06 |
| Converge | `scripts/restore.sh` | `stackql-deploy build`, about a minute: each deployment's statecheck fails (replicas for web, image for checkout), the update anchor runs, the estate ends where the manifest says | 02 |
| The event log | `npm run audit` | every statement the agent ran, the mode, the decision, one record each | 04 |

Say which mode the server is in before each run. The agent escalates the web drift rather than reverting it; the convergence step is the operator's decision, which is the point: the declaration wins, and if the scale-up was right, the declaration is what should change.

## fallback

`npm run agent -- --replay` replays the newest transcript from `runs/` (or from `recordings/` when `runs/` is empty) with the pacing of a run, under a banner that says it is a replay. Use it when there is no network, no key or no cluster. Do not present it as a live run.

## what it proves, and does not

- It demonstrates the six patterns on one local Kubernetes provider plus one public SaaS provider, with the policy gate enforced by the server and the convergence done by a declarative build.
- A query is an observation, not a lock. The agent re-reads after a change; nothing here is an atomic precondition.
- The approval at the terminal is the MCP elicitation flow answered by whoever is at the keyboard. It binds the answer to the exact statement; it is not an authenticated production approval service.
- The agent's blast radius is the identity `kubectl proxy` runs with. On kind that is the admin context; in a real cluster it is a Role on the agent's ServiceAccount, as in `k8s/agent-cronjob.yaml`.
- `safe` and `delete_safe` trust the MCP client to show the prompt to a person; against an untrusted client use `read_only` or a narrowed tool set.

## status

Dry run on 27 October 2026 (Windows 11, Docker Desktop with cgroup v1, kind 0.33 on `kindest/node:v1.33.1`, stackql 0.12.824, `@stackql/mcp-server` 0.12.824, `@ai-sdk/mcp` 2.0.85, `claude-sonnet-5-5`): the full running order ran end to end. The agent run takes about 45 seconds and 5 steps; `recordings/agent_dry-run_2026-10-27.txt` is its transcript. In `read_only` the write was refused; in `safe` the elicitation was raised and recorded (`needs_approval_declined` when nobody answers). The convergence put web back to 2 replicas and checkout back on the declared image. The CronJob manifest and the Dockerfile are written, not applied or built for this talk.
