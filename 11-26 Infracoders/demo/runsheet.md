# runsheet: an agent at the rollout gate

The on-screen walkthrough for the demo slot of "Stateless IaC for Agents: stackql-deploy". About seven minutes. Commands are exact; the lines under "say" are prompts, not a script.

## before the talk

Do this at least ten minutes before you speak. CloudTrail takes a few minutes to show the drift, and the agent looks there for who made it.

```bash
scripts/stage.sh        # about 75 s. syd on 1.5.0 and drifted, pdx on 1.4.0, fra removed
```

Then set the screen:

| Window | Where | Ready with |
| --- | --- | --- |
| Terminal 1, Git Bash | the demo root | cleared, wide, large font |
| Terminal 2, PowerShell or cmd | `agent/` | cleared, at least 121 columns wide (the frames are 120) |
| Editor | the demo root | `stack/stackql_manifest.yml`, `stack/resources/table_guardrails.iql`, `cells/pdx.env`, `agent/src/policy.ts` open in tabs |

Check once, quietly: `scripts/board.sh` shows two rows (syd with `deletion_protection` false, pdx) and `cd agent && npm run tools` lists the surface. If either fails, go to "if something goes wrong" below.

## the beats

| # | Time | Command | Machine time |
| --- | --- | --- | --- |
| 1 | 0:00 | editor: the manifest, `table_guardrails.iql`, a cell file | none |
| 2 | 0:45 | `scripts/build.sh fra` | 30 s |
| 3 | 1:45 | `scripts/build.sh fra` again, then `ls -a` | 19 s |
| 4 | 2:30 | `scripts/board.sh` | 3 s |
| 5 | 3:00 | `npm run gate -- promote fra 1.5.0` | 2 s |
| 6 | 3:20 | `npm run agent` | 75 s with two approvals |
| 7 | 6:00 | `cat ../cells/pdx.env`, `npm run audit` | 2 s |

### 1. the declaration (editor)

Show `stack/stackql_manifest.yml`: three resources, a handful of globals. Show `cells/syd.env`: three lines. Show `stack/resources/table_guardrails.iql`: this is the file on the slide.

Say: one manifest is a cell. One small file per cell says where it is, which wave, which release. That is all of it. There is no state file and there will not be one.

### 2. a cell from nothing (terminal 1)

```bash
scripts/build.sh fra
```

Point at, as they scroll past: `[table] does not exist`, `creating [table]...`, the statecheck retrying while the table is CREATING, `[table] is in the desired state`, then the same for `release`.

Say while it runs: every line here is a SQL query against AWS. exists is a SELECT. create is an INSERT. statecheck is a SELECT, retried until the provider says the table is what I declared. Nothing is being written down locally.

### 3. the same again (terminal 1)

```bash
scripts/build.sh fra
ls -a
```

Point at: three times `is in the desired state`, no create, no update. Then the listing: a manifest, cell files, scripts. `.stackql` is the provider cache.

Say: the second run asked the same questions, got different answers, and did nothing. That is idempotence without a state file. Anyone, or anything, can run this at any time.

### 4. the rollout board (terminal 1)

```bash
scripts/board.sh
```

Point at: the statement (one SELECT, a join of SSM and DynamoDB, `region IN` three regions), three rows, and `deletion_protection` false on ap-southeast-2.

Say: this is the whole rollout, live, in one statement. And there is the problem: the canary is on 1.5.0, but someone has switched deletion protection off on its table. That is not in the declaration. I did it earlier.

### 5. the gate says no (terminal 2)

```bash
npm run gate -- promote fra 1.5.0
```

Point at: `DECLINED BY POLICY: wave order`.

Say: before a model goes near this, the gate. This is the request an agent could send, sent by hand: skip a wave. Declined, in code, before anything ran. The model cannot see this file and cannot change it. Show `agent/src/policy.ts` for five seconds if there is time.

### 6. the agent (terminal 2)

```bash
npm run agent
```

Narrate the frames as they arrive:

| Frame | What it is | Say |
| --- | --- | --- |
| header | model, read surface `read_only`, write surface gated, the declared cells | two surfaces. It can read anything. It can write nothing directly. |
| 01 `run_select_query` | the board | it reads before it proposes. Same statement I ran. It sees the canary. |
| 02 `run_select_query` | CloudTrail | it asks who changed the table and when. CloudTrail is a table too. That is incident triage in the same interface as the fix. |
| 03 `cell_converge` | reason, policy line, APPROVAL REQUIRED | it does not write SQL to fix it. It asks for the declaration to be asserted. Policy passes; now it is my call. Read the command aloud, type `y`. |
| stackql-deploy lines | `not in the desired state`, `updating [table_guardrails]`, `in the desired state` | that is stackql-deploy converging one resource. Two others untouched. |
| 04 `run_select_query` | the board | it checks its own work. |
| 05 `cell_promote` | reason, policy line, approval with the one-line declaration change | now the promotion. The gate did not take the model's word that the canary is fine; it has its own check from a moment ago. The change is one line in one file. Type `y`. |
| 06 `run_select_query` | the board | pdx on 1.5.0. It stops there: one wave per run. |
| report | status table | fra waits for the next run. |

If the model takes a different path (for example it goes straight to the promotion), let it. The gate holds either way: a promotion past a drifted canary is declined with `verification`, and that is worth showing.

### 7. the evidence (terminal 2)

```bash
cat ../cells/pdx.env
npm run audit
```

Say: the agent's change is a one-line change to a reviewed file, not a mutation nobody can find. And here is every statement it ran and every decision the gate made, including the one I declined by hand.

## if something goes wrong

| Symptom | Do |
| --- | --- |
| No network, no model, an OpenAI error | `npm run replay`. Say it is a replay of this morning's rehearsal |
| The agent run stalls for more than 30 s between frames | Ctrl+C, `npm run replay` |
| `scripts/build.sh fra` fails on stage | skip to beat 4; the board shows two cells, and the agent checks which cells are built before it starts, so its run still works |
| Frame 02 returns 0 rows | the drift is too recent for CloudTrail. Say so; the agent will say "not observed" and still converge |
| You typed `n` at an approval by mistake | the agent reports the decline and stops. Run `npm run agent` again |
| The estate is in the wrong state | `scripts/stage.sh` (75 s) |

## between rehearsals, and after

```bash
scripts/stage.sh                                              # back to the start
for c in syd pdx fra; do scripts/teardown.sh "$c"; done       # remove everything, after the talk
```
