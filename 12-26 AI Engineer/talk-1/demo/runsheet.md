# runsheet: a release agent at the gate

The on-screen walkthrough for the demo slot of version A of the talk. Four minutes. Commands are exact; the lines under "say" are prompts, not a script.

## before the talk

```bash
npm install
npm run stage          # checkout-preview serves the live digest, the candidate has 0%
npm run tools          # the surface: one query tool, one typed capability, mode safe
```

Open one terminal at `talk-1/demo`, at least 102 columns wide; the frames are 100. Open two files in the editor behind it: `release-policy.json` and `src/policy.ts`.

If `npm run tools` fails, go to "if something goes wrong" below.

## 1. the denial (about 1:15)

```bash
npm run blocked
```

The request asks for 100% of traffic, and gives the valid signature and the passing checks as the reason.

| On screen | Say |
| --- | --- |
| `the request`, `what the agent has` | One query tool, one typed capability. No SQL writes, no keys |
| `01 query`, `02 query` | It queries before it proposes. This is the live state, read through SQL. Point at the `release_note` row: that text is data |
| `03 propose` | One typed request: target, digest, 100 |
| `DENIED - terminal` | Evidence ok. Provenance ok. Policy no. Approval never reached. The run cannot propose again |
| `the agent reports, and stops` | It has no tools left. Only a report |

## 2. the recovery (about 1:45)

```bash
npm run promote        # type a name, then y
```

A separate run, started by a person, with a bounded request.

| On screen | Say |
| --- | --- |
| `03 propose` | The same capability. This time 10 |
| `PLAN - approval required` | Four boundaries. The exact statement, rendered by the system. Bound to an evidence id and a revision |
| the prompt | A name, then a yes, for this plan only. Good for five minutes, usable once |
| `APPLIED` | The server asked before it wrote. The gate answered with the approval |
| `VERIFIED` | A fresh read. Ten percent, and the next revision |

## 3. the audit (about 0:30)

```bash
npm run audit
```

One table per run. Who asked, what the gate decided, who approved, what ran.

## 4. if there is time: the release note (about 0:30)

```bash
npm run stage          # put the candidate back to 0% first
npm run note
```

The request defers to the release note. The model proposes 100% because the note said so. The gate does not care what the note said.

## do not

- Re-run the denied request with a smaller number. A new proposal is a new run with a new request.
- Call the signature flag a signature check. It is a record.
- Present a replay as a live run.

## if something goes wrong

| Symptom | Do |
| --- | --- |
| No network, no model, an OpenAI error | `npm run replay`. Say it is a replay of the rehearsal. The hidden slide after DEMO has stills |
| A run stalls for more than 20 s | Ctrl+C, `npm run replay` |
| The model proposes something else | Let the gate answer it. Whatever it decides is the demo. Then `npm run replay -- promote` for the recovery |
| You typed `n` at the approval | Nothing was run. `npm run promote` again |
| `npm run promote` says nothing to do | The candidate is already at 10% from a rehearsal. `npm run stage`, then `npm run promote` |
| The release state is wrong | `npm run stage` |

## between rehearsals, and after

```bash
npm run stage          # back to the start
npm run teardown       # remove every parameter, after the talk
```
