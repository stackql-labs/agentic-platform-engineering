# runsheet: an agent at the rollout gate

The on-screen walkthrough for the demo slot of "Stateless IaC for Agents: stackql-deploy". About seven minutes. Commands are exact; the lines under "say" are prompts, not a script.

## before the talk

Do this at least ten minutes before you speak. CloudTrail takes a few minutes to show the drift, and the agent looks there for who made it.

```bash
scripts/stage.sh        # about 75 s. syd on 1.5.0 and drifted, pdx on 1.4.0, fra removed
```

Open **Terminal 1** using Git Bash at the project demo root.  

Open **Terminal 2** using PowerShell, at `agent/`

Open Editors for 
- `stack/stackql_manifest.yml`
- `stack/resources/table_guardrails.iql`
- `cells/pdx.env`
- `agent/src/policy.ts`

In Terminal 1 `scripts/board.sh` shows two rows (syd with `deletion_protection` false, pdx); and `cd agent && npm run tools` lists the surface. If either fails, go to "if something goes wrong" below.

### 1. the declaration (editor)

One manifest is a cell. One small file per cell says where it is, which wave, which release. There is no state file.

### 2. a cell from nothing (terminal 1)

Builds the Frankfurt cell from nothing: each resource is checked with a query, found missing and created.

```bash
scripts/build.sh fra
```

### 3. the same again (terminal 1)

Runs the same build again: every check passes and nothing changes.

```bash
scripts/build.sh fra
```
### 4. the rollout board (terminal 1)

Reads the whole rollout live in one SQL statement: three regions, two services.

```bash
scripts/board.sh
```

The canary (ap-southeast-2) is on 1.5.0, but deletion protection on its table has been switched off outside the stack.

### 5. the gate says no (terminal 2)

Sends a request straight to the gate, with no model: promote wave 2 (fra) while wave 1 is still on 1.4.0.

```bash
npm run gate -- promote fra 1.5.0
```

Declined by policy, in code, before anything ran: waves go in order.

See `agent/src/policy.ts`.

### 6. the agent (terminal 2)

Runs the agent with one instruction: move release 1.5.0 forward by one wave, if it is safe.

```bash
npm run agent
```

The agent reads the rollout, finds who switched protection off, then repairs the canary and promotes Oregon, each through a `stackql-deploy build` approved at the prompt.

### 7. the evidence (terminal 2)

Prints the cell file the promotion changed, then the audit log.

```bash
cat ../cells/pdx.env
npm run audit
```

One reviewed line changed, and every statement the agent ran and every gate decision is on record.

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
