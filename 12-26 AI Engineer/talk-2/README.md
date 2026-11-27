# Version B: show, then tell

Version B of "Query before mutation: guardrail patterns for agents that touch production infrastructure" (AI Engineer Sydney, Tuesday 8 December 2026, 12:40 pm). It is built from [talk-slide-and-clip-detail.md](talk-slide-and-clip-detail.md), version 2, which remains the specification. This file records what was built from it and what is still open.

| Piece | Where |
| --- | --- |
| Outline, run of show, slide and clip detail | [talk-slide-and-clip-detail.md](talk-slide-and-clip-detail.md) |
| Deck, 11 slides and 2 demo slides, with the talk track in the notes | [slides/Query Before Mutation - Version B.pptx](slides/Query%20Before%20Mutation%20-%20Version%20B.pptx) |
| Demo: the agent, the gate, the approval, the record | [demo/README.md](demo/README.md) |
| Runsheet for recording the two clips, and the live fallback | [demo/runsheet.md](demo/runsheet.md) |

## How the deck follows the specification

The deck has the eleven slides in the order of the run of show, with a slide for each demo between them: 16:15 of content and 1:45 of slack. It is built on the template of the earlier decks, so the "template fit" open item is closed.

- **Headings** are the plain-language ones, in sentence case. The synopsis term appears once per pattern slide, as the byline.
- **Pattern slides** carry the two lines (helps, does not help), one picture, and the loop as a corner marker with the current stop lit.
- **Pattern pictures** are stills of Demo 1, redrawn from the recorded output so they stay sharp at any size. Pattern 04 has the nine-second numeral, with the single-tool frame as an inset.
- **Demo slides** hold a still of the real run with the clip's captions beside it. Each is a placeholder for its clip: drop the recorded clip over the still, full bleed. If a clip will not play, the still is the first fallback.
- **Figures** carry their source in small type on the slide where the specification asked for it, and in the notes.

## How the demo follows the specification

- **Demo 1 - Blocked:** `npm run agent`. The job as one sentence, a single MCP server as the tool list, a `SELECT` on `aws.dynamodb.tables`, one proposed statement, an amber `HELD - write path off` with the rule name, the agent's report, and a stop.
- **Demo 2 - Recovered:** `npm run approve`, the terminal version. A named person approves the exact statement; the system looks, applies and looks again. `npm run agent` a second time reports nothing to do. `npm run audit` is the record with the actor column.
- **The refused delete** is `npm run refused`, for the optional tail on Demo 1.
- **Statements:** the sketch in the specification used `data__` prefixed names. The provider accepts the unprefixed ones, and those were run: `UPDATE aws.dynamodb.tables SET DeletionProtectionEnabled = true WHERE region = 'ap-southeast-2' AND TableName = 'orders'`. That is what is on slide 5 and in the stills.

One thing the specification did not have: a failed write, recovered. DynamoDB allows one change to deletion protection in 15 seconds, so an approved write straight after staging is throttled. The system looks again, waits, and re-asserts once. It is the second half of pattern 05 with a real failure, and it is staged with `npm run stage:hot`.

## Open items

Still open from the specification:

- **Pattern headings:** the five plain-language headings are on the slides as proposed. They need Jeff's ear.
- **Slide 3:** 52 or 50. The slide and the notes say 52; the Grafana report settles it.
- **Slide 8:** the "does not help" line is still a proposal.
- **Slides 9 and 10:** kept as specified. They still say estate, re-assert and mutation surface, which slides 1 to 8 avoid.
- **Slide 10:** the drift figure is a rank, not a percentage, and the Cloud Security Alliance primary has not been traced.
- **Slide 11:** the QR code points at this repository. If stars on `stackql/stackql` are the aim, change the QR and keep this repository in the checklist footer.
- **Demo 2:** the terminal approval is built. The Jira version is not.

New:

- **Clips:** not recorded. The demo slides hold stills until they are.
- **Figures:** the numbers on slides 3, 7 and 10 were taken from the specification's "Figures checked" table as written. They were not checked again when the deck was built.
- **Approver name:** the stills show the name used in the rehearsal run. Re-record or edit if a different name should be on screen.
