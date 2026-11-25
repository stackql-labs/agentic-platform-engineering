# Version C: ask, show, name

Version C of "Query before mutation: guardrail patterns for agents that touch production infrastructure" (AI Engineer Sydney, Tuesday 8 December 2026, 12:40 pm). It is the challenger to versions A (`../talk-1`) and B (`../talk-2`): built from the parts of each that work best for a room with a low to average level of proficiency, around one idea that neither has.

| Piece | Where |
| --- | --- |
| The argument, run of show, slide and beat detail, talk track | [slides.md](slides.md) |
| Deck, 12 slides and 3 demo slides, with the talk track in the notes | [slides/Query Before Mutation - Version C.pptx](slides/Query%20Before%20Mutation%20-%20Version%20C.pptx) |
| Demo: the agent, the gate, the approval, the bait, the record | [demo/README.md](demo/README.md) |
| On-stage runsheet for the three live beats, and the fallbacks | [demo/runsheet.md](demo/runsheet.md) |

## The idea it adds

A person reading a plan before typing yes was answering five questions without noticing. Remove the person and all five go at once. Each question can be put back as code, and the five answers are the five guardrails in the synopsis, in the order a change moves through them.

| The question | Step | Guardrail |
| --- | --- | --- |
| What is true right now? | Look | Query before mutation |
| What will be true afterwards? | Propose | Idempotent assertions |
| Is that allowed? | Check | Policy gates |
| What else could it reach? | Apply | Scoped credentials and mutation surfaces |
| What if it is blocked, or fails? | Look again | Recovery paths |

That gives a newcomer a reason for each guardrail before its name, and makes the ordered checklist a recap of what was watched.

## What it takes from each version

| From | What | Where it is in version C |
| --- | --- | --- |
| A | "Plan, a person reads it, apply", and the same with the middle box empty | Slide 2 |
| A | "A permission is a yes or a no. Trust has to say what, where and how far" | Slide 3, as the closing line |
| A | Independent boundaries, each of which can say no by itself, shown on screen as ok, NO and not reached | The four check lines in every decision frame of the demo, and slide 7 |
| A | Text read from the estate is data, not an instruction: the release note that says "ignore the policy" | Demo 3: the ops note that says "delete this table" |
| A | A live demo, and a slide for what the controls do not catch | Three live beats, and slide 11 |
| B | Plain words on screen, with each synopsis term once as a byline | Every pattern slide |
| B | One table, one safety setting, and the model proposing a SQL statement | The scenario and the demo |
| B | Look, propose, check, apply, look again | The five steps, drawn as a line of five |
| B | Pattern slides explained from a still of the demo just watched | Slides 6 to 9 |
| B | The nine-second story | Slide 3, moved to the front as the reason for the talk |
| B | Held, refused and nothing-to-do as three different answers; the record with an actor column | Demos 1 to 3 |
| B | "The model proposes. The system decides." | Slide 4 and the close |

## What is different

- **Shape:** ask, show, name. Three short demo beats, each straight after the question it answers, where A has one block in the middle and B has two.
- **The blocked write is an attack, not a setting.** In the third beat somebody rewrites one line of an ops note, the same agent with the same job proposes deleting the production table, and the gate refuses it. For a room of AI engineers that is the risk they already know, shown against infrastructure.
- **Paced live demo.** The whole demo is three commands and the Enter key. A run takes about seven seconds; its output is held back and shown one frame per key press, so each frame is on screen while it is being explained. The run is not waiting on the presenter, so nothing in it goes stale.
- **Fewer things to follow.** No provenance, digests, revisions or traffic shares. No survey figures and no standing-jobs slide. One figure in the whole deck.
- **The limit gets a slide,** as in A, in B's plain words.

## How the deck follows the slide detail

The deck has the twelve slides in the order of the run of show, with a slide for each demo beat between them. It is built on the template of versions A and B, and every word on it is from [slides.md](slides.md).

- **Pattern slides** carry the question as the heading, the synopsis term as the byline, the rule on a line of its own with a small "THE RULE" label, the two boxes, one picture and the five-step marker with the current step lit.
- **Demo slides** hold a still of the real run beside the captions. The stills are redrawn from the transcripts in `demo/recordings/`, so they stay sharp at any size, and they are abbreviated to fit: no value, rule name or statement id is changed, but the agent's report and some second sentences are left off. The record that closes Demo 2 is drawn on the pattern 05 slide, not on the Demo 2 slide.
- **Slide 4** draws "A PERSON READS IT" as a band across the five cards, where slides.md describes the box from slide 2 opening up.
- **Text is broken by hand** where a line would otherwise strand a single word. Anyone editing a text box in PowerPoint will see those line breaks.

## Status

Built and run end to end on 25 November 2026. The deck opens in PowerPoint and was checked slide by slide as rendered there, and its text was checked against slides.md by script. The demo runs live against AWS with `gpt-6-luna`; `npm test` (33 tests) and `npm run typecheck` pass. The three beats were each driven through their `npm run beatN` command in a pseudo-terminal, one key at a time.

Not done: the talk has not been timed aloud, the pacing has not been tried with a presentation clicker, and nothing has been rehearsed on the venue network.

## Open items

Listed in full at the end of [slides.md](slides.md). The ones that need a decision:

- **The wording of the five questions,** question 04 most of all.
- **Three switches to the terminal.** If that is one too many, Demo 3 is the one to keep live and Demos 1 and 2 can be talked from their stills.
- **The agent's briefing in Demo 3** tells it to do what the ops note says. That is deliberate and stated in the demo README. Decide whether to say it on stage or only if asked.
- **Slide 3's wording about the token** differs from version B's notes. See the figures table in slides.md.
