# Version A rehearsal and recording plan

For the 18 minute Sydney talk, version A. The deck is [slides/Query Before Mutation - Version A.pptx](slides/Query%20Before%20Mutation%20-%20Version%20A.pptx), the outline is [slides.md](slides.md) and the demo walkthrough is [demo/runsheet.md](demo/runsheet.md).

## Rehearsal checkpoints

- [ ] Run the deck against a clock: 17:15 of content, 0:45 of slack, 2:00 of transition after it.
- [ ] Rehearse the four minute demo to time, with the approval typed by hand. Reserve the full checklist and the close.
- [ ] `npm run stage` before every run-through, and check `npm run tools` answers.
- [ ] Rehearse the fallback once: `npm run replay`. It labels itself a replay; say so as well.
- [ ] Keep the release-promotion case specific to this version. Version B uses a different case on purpose.
- [ ] Test on the venue network if there is one, and on a phone hotspot. The demo needs OpenAI and AWS; the replay needs neither.
- [ ] Confirm the deck plays from the speaker's own laptop in 16:9, with Montserrat installed or embedded.
- [ ] Do not show API keys, account identifiers, private attendee data, sponsor logos or unapproved acknowledgements. The demo prints credential variable names, never values.

## Demo shot list

1. `npm run blocked`: the request for 100%, the two queries, the release note row, the proposal.
2. The red `DENIED - terminal` frame: evidence ok, provenance ok, policy no, approval not reached.
3. The agent's report. It has no tools left.
4. `npm run promote`: a separate run. The `PLAN - approval required` frame with the exact statement, the evidence id and the revision.
5. The name and the yes. `APPLIED`, then `VERIFIED` from a fresh read.
6. `npm run audit`: one table per run.
7. Back to the deck for the limit: a valid provenance chain and a passing gate do not prove the release is correct.

## If the demo is recorded instead

Record the same shot list in one take per run, with live narration on the day. Label the clip a recording on screen. The transcripts in `demo/recordings/` are from the rehearsal on 25 November 2026 and replay with `npm run replay`; they are labelled as replays and must not be presented as a live run.
