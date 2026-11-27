# One contract, many agents

Infrastructure as code, redefined as an agentic process. There is no template
and no state file. There is a contract (`AGENTS.md`), an intent (`STACK.md`)
and a policy set (`POLICIES.md`). Five agents read the same three files, query
the live cloud through StackQL, and differ only in their lens and in what the
StackQL MCP server lets them do.

> Status: written without a shell. Nothing here has been run. Rehearse with
> live credentials before the talk and see "Not yet verified" below.

## What is in the box

| File                              | Purpose                                                    |
| --------------------------------- | ---------------------------------------------------------- |
| `AGENTS.md`                       | The contract every agent obeys. Query before mutation.     |
| `STACK.md`                        | The intent: three resources across three providers.        |
| `POLICIES.md`                     | Nine policies, each proven by a live query.                |
| `role-*.md`                       | One thin lens per role.                                    |
| `agent.ts`                        | One runner for all roles (OpenAI Agents SDK, TypeScript).  |
| `evidence/`                       | Created at run time: one report and one audit log per role. |

## The stack

| Order | Provider     | Resource                                                    |
| ----- | ------------ | ----------------------------------------------------------- |
| 1     | `entra_id`   | Security group `sg-agentic-demo-owners`                     |
| 2     | `awscc`      | S3 bucket `stackql-agentic-demo-origin` in `us-east-1`      |
| 3     | `cloudflare` | Proxied CNAME `agentic-demo.stackql.xyz` to the bucket      |

The bucket's `Owner` tag names the Entra group, and the DNS record points at
the bucket, so the interesting checks need two providers in one query path.

## Roles and authority

Each agent starts its own StackQL MCP server over stdio. The server mode is the
enforcement point; the prompt only explains it.

| Role          | Server mode   | Can create and update | Can delete |
| ------------- | ------------- | --------------------- | ---------- |
| `provisioner` | `delete_safe` | Yes                   | No         |
| `sre`         | `delete_safe` | Yes                   | No         |
| `security`    | `safe`        | No                    | No         |
| `finops`      | `safe`        | No                    | No         |
| `compliance`  | `safe`        | No                    | No         |

The "No" entries are operations that need approval in that mode. The runner
has no approval handler, so the expected result is a refusal that the audit log
records. Confirm this in rehearsal.

## Setup

1. Install Node 20.12 or later and a current `stackql` binary on `PATH`.
2. `npm install`
3. Create `.env` with two lines: `OPENAI_API_KEY=...` and
   `OPENAI_DEFAULT_MODEL=...`. Add `STACKQL_BIN=...` if `stackql` is not on
   `PATH`. Only `agent.ts` reads this file; it is never passed to StackQL.
4. Copy `stackql-credentials.env.example` to `stackql-credentials.env` and
   fill in the provider credentials. Both files are git-ignored.
5. Check the three credentials can do what the stack needs:
   - AWS: Cloud Control and S3 on one bucket.
   - Cloudflare: read zones and edit DNS on `stackql.xyz` only.
   - Entra ID: application permissions to read users and groups and to create
     a group, with admin consent.

## Run the demo (3 to 5 minutes)

Terminal 1, build the stack:

```
npm run agent -- provisioner
```

Terminals 2 to 5, start these while the audience reads the first report:

```
npm run agent -- sre
npm run agent -- security
npm run agent -- finops
npm run agent -- compliance
```

What to point at:

- Every terminal prints the same `contract sha256`. Same rules, five lenses.
- Every terminal prints a different `mode`. Same rules, different authority.
- Compliance fails POL-02: the owner group has no members. The provisioner did
  its job and the stack is still not accountable. Only a human can close that.
- `evidence/audit/<role>.jsonl` shows each tool call with its `mode`,
  `decision` and SQL. Tail one in a spare pane for a live view:
  `Get-Content evidence\audit\provisioner.jsonl -Wait`

### If time allows: drift

1. In the Cloudflare dashboard, turn the proxy off on
   `agentic-demo.stackql.xyz`.
2. `npm run agent -- security` reports POL-06 as a FAIL and proposes the fix.
3. `npm run agent -- sre --findings` reads that report, checks it with its own
   query and repairs the record.

### If time allows: the guardrail

```
npm run agent -- security "Fix every FAIL yourself instead of proposing."
```

The contract tells the agent not to. If it tries anyway, the server refuses,
and the last lines of `evidence/audit/security.jsonl` show the decision.

## Timing

Live discovery is the slow part. Rehearse and time each role. If the
provisioner takes too long on stage, run it before the talk and open with the
four review agents; run the provisioner again live to show it queries, finds
the stack converged and changes nothing.

## Teardown (human only)

No agent can delete. Ask for the statements, then run them yourself:

```
npm run agent -- provisioner "Propose teardown SQL only."
```

Run the proposed statements in `stackql shell` with the same credentials, DNS
record first, then bucket, then group. The bucket statement from the provider
docs is:

```sql
DELETE FROM awscc.s3.buckets
WHERE region = 'us-east-1'
AND Identifier = 'stackql-agentic-demo-origin';
```

## Not yet verified

- The whole flow, end to end. No command in this file has been run.
- Whether the OpenAI Agents SDK answers MCP approval requests. The design
  assumes it does not.
- The `INSERT` shapes for the Cloudflare DNS record and the Entra group. Agents
  discover them with `list_methods` and `describe_method`.
- The exact Entra application permissions and AWS IAM actions needed.
- Dependency versions. `package.json` uses `latest`; pin them after the first
  successful run by committing `package-lock.json`.
- Wording against the slide deck, which was not readable when this was written.

## Sources

- StackQL MCP server, modes, tools, audit log, `--env.file`:
  https://stackql.io/command-line-usage/mcp
- OpenAI Agents SDK for TypeScript, MCP guide:
  https://openai.github.io/openai-agents-js/guides/mcp/
- OpenAI Agents SDK, default model: https://openai.github.io/openai-agents-js/guides/models/
- StackQL `entra_id` provider: https://stackql.io/providers/entra-id
- StackQL `cloudflare` provider: https://stackql.io/registry/cloudflare
- StackQL `awscc` provider: https://awscc-provider.stackql.io/
