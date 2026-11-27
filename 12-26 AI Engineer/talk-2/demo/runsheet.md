# runsheet: recording Demo 1 and Demo 2

The capture walkthrough for the two clips in version B of the talk, and the live fallback if a clip will not play. Commands are exact. The lines under "caption" are the on-screen captions from the slide and clip detail; the lines under "say" are prompts, not a script.

Each clip is silent, narrated live, trimmed of waits, and zoomed on the frame in play. Amber means held and green means applied. Each ends on a held frame.

## before recording

```bash
npm install
npm run stage          # the table exists, deletion protection is off, nothing is held
npm run tools          # the surface: one MCP server, two tools given, mode read_only
```

Use a terminal at least 102 columns wide; the frames are 100. A dark theme matches the stills on the slides. Clear the scrollback between takes.

If `npm run stage` had to switch protection off it has already waited 16 seconds, so the approved write in Demo 2 will not be throttled.

## clip 1: Demo 1 - Blocked (2:00)

```bash
npm run agent
```

| Frame | On screen | Caption | Say |
| --- | --- | --- | --- |
| 1 | `the job` and `what the agent has` | The job: turn deletion protection back on. One tool, no keys | Deletion protection stops the table being deleted by accident. Name the MCP server as the agent's only tool. It holds the AWS credential |
| 2 | `01 look`, zoom on `deletion_protection_enabled = false` | It looks first: protection is off | Name StackQL: open source, cloud and SaaS providers as data sources queried with SQL, every query a live call |
| 3 | `02 propose` | It proposes one change | One statement that says the end state |
| 4 | `HELD - write path off`, rule `needs-a-person` | Held: not without a person | The write path is off. It was not run |
| 5 | `the agent reports, and stops` | It reports and stops | The exact statement, not run. No retry, no other route |
| 6 | hold on the amber band | | |

The run takes about five seconds. Slow it in the edit, not in the terminal.

## clip 2: Demo 2 - Recovered (2:00)

```bash
npm run approve        # type a name, then y
npm run agent          # run it twice
npm run audit          # the record
```

| Frame | On screen | Caption | Say |
| --- | --- | --- | --- |
| 1 | `APPROVAL REQUIRED`, then the name and the `y` | Approved by [name], this statement only | The prompt shows the exact statement, who proposed it and what it saw |
| 2 | `look`, `false` | It looks again: still off | The system does not take the agent's word for it |
| 3 | `APPLIED`, green | Applied | The server asked before it wrote. The answer was the approval |
| 4 | `look again`, `true` | It looks again: on | |
| 5 | the second `npm run agent`: `NOTHING TO DO` | Run it twice: nothing to do | |
| 6 | `npm run audit`, zoom on the actor column; hold | The record: who proposed, who approved, what ran | "What changed between held and applied is a named approval, not a looser mode." |

## optional beats

A delete, refused before anyone is asked (a 20 second tail for clip 1, or for Q and A):

```bash
npm run refused
```

A failed write, recovered (the second half of pattern 05). The provider allows one change to this setting in 15 seconds, so an approved write straight after staging fails, and the system looks again and re-asserts once:

```bash
npm run stage:hot      # stage without waiting
npm run agent
npm run approve        # inside 15 s of staging: FAILED - look again, a 16 s wait, APPLIED
```

## between takes

```bash
npm run stage          # back to the start. About 20 s when protection has to come off
```

## if a clip will not play on the day

| Symptom | Do |
| --- | --- |
| The clip will not play | The slide under it is a still of the same run. Talk to the still |
| You want it moving | `npm run replay -- blocked`, then `npm run replay -- recovered`. Say it is a replay |
| There is network and time | Run it live: the three commands above. About 15 seconds of run time in all |
| A live run stalls for more than 20 s | Ctrl+C, `npm run replay` |
| You typed `n` at the approval | Nothing was run and the statement stays held. `npm run approve` again |
| The table is in the wrong state | `npm run stage` |

## after the talk

```bash
npm run teardown       # removes the table
```
