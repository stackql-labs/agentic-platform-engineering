# AI Engineer Sydney, 8 December 2026

Three versions of one talk, for an A/B/C test, and the workshop that follows it.

**Query before mutation: guardrail patterns for agents that touch production infrastructure.** Tuesday 8 December, 12:40 pm, AI Engineering track. 18 minutes plus 2 minutes of transition.

All three deliver the same synopsis: the human pause that made plan-and-apply safe, query before mutation, idempotent assertions, policy gates, scoped credentials and mutation surfaces, recovery paths, where each helps and where it does not, a mutation blocked and safely recovered, and an ordered checklist. They differ in how they get there. Version C is the challenger: it was built after A and B, from the parts of each that suit a room with a low to average level of proficiency.

| | Version A, `talk-1/` | Version B, `talk-2/` | Version C, `talk-3/` |
| --- | --- | --- | --- |
| Shape | Tell, then show, then the limits | Show, then tell | Ask, show, name: a question, a short beat of demo, then the pattern |
| Message | Provenance informs. Policy constrains. Runtime evidence verifies | Always reading, never writing alone | Put the pause back. The model proposes, the system decides |
| The idea it hangs on | Four independent boundaries | One loop of five stops | Five questions a person reading a plan was answering |
| Words on screen | The synopsis terms, in the register of the earlier decks | Plain words; each synopsis term once, as a byline | Plain words; each pattern slide is headed by its question, with the synopsis term as a byline |
| Case | A release promotion: a candidate with a valid-looking signature, a 10% traffic bound | One production table, one safety setting that should be on and is off | The same kind of table and setting, and an ops note beside it that anybody can rewrite |
| Demo | One continuous live demo, 4:00, in the middle | Two clips of 2:00, one before the patterns and one after | Three live beats of about 1:30, each shown one frame per key press |
| Blocked | A request for 100% is denied by release policy. Terminal for the run | The write path is off. The statement is held for a named person | Held for a named person, and later a delete the agent was talked into is refused outright |
| Recovered | A separate run proposes 10%: plan, named approval, write, verification | A named person approves the held statement; the system looks, applies, looks again | The same, and then the same statement a second time sends nothing |
| How the agent writes | One typed capability, `propose_promotion`. No SQL writes | It proposes a SQL statement; the gate decides what happens to it | It proposes a SQL statement; four named checks decide, and all four are on screen |
| Untrusted text | An optional beat: the release note says "ignore the policy" | Not shown | The third beat: the ops note says "delete this table" |
| Slides | 11, a hidden slide of fallback stills, and the template's closing slide | 11, and a slide for each demo clip | 12, and a slide for each demo beat |
| Content time | 17:15, 0:45 of slack | 16:15, 1:45 of slack | 16:00, 2:00 of slack |
| The limit it leaves the room with | A permitted change can still be wrong | The same sentence, spoken once at the checklist | The same sentence, on a slide of its own |

## Contents

| Material | Location |
| --- | --- |
| Version A deck | [talk-1/slides/Query Before Mutation - Version A.pptx](talk-1/slides/Query%20Before%20Mutation%20-%20Version%20A.pptx) |
| Version A outline and rehearsal plan | [talk-1/slides.md](talk-1/slides.md), [talk-1/rehearsal.md](talk-1/rehearsal.md) |
| Version A demo: a release agent at the gate | [talk-1/demo/README.md](talk-1/demo/README.md), [runsheet](talk-1/demo/runsheet.md) |
| Version B deck | [talk-2/slides/Query Before Mutation - Version B.pptx](talk-2/slides/Query%20Before%20Mutation%20-%20Version%20B.pptx) |
| Version B specification and build notes | [talk-2/talk-slide-and-clip-detail.md](talk-2/talk-slide-and-clip-detail.md), [talk-2/README.md](talk-2/README.md) |
| Version B demo: one safety setting on a production table | [talk-2/demo/README.md](talk-2/demo/README.md), [runsheet](talk-2/demo/runsheet.md) |
| Version C deck | [talk-3/slides/Query Before Mutation - Version C.pptx](talk-3/slides/Query%20Before%20Mutation%20-%20Version%20C.pptx) |
| Version C argument, slide detail and talk track | [talk-3/slides.md](talk-3/slides.md), [talk-3/README.md](talk-3/README.md) |
| Version C demo: one safety setting, and a note that lies | [talk-3/demo/README.md](talk-3/demo/README.md), [runsheet](talk-3/demo/runsheet.md) |
| Workshop, Wednesday 9 December | [workshop/](workshop/participant-workbook.md) |

## The demos

All three are small TypeScript programs with the same three parts and nothing shared between them, so a version that loses the test can be deleted whole.

- **The model:** the OpenAI SDK for TypeScript, Responses API, with `gpt-6-luna`, the lowest-cost GPT-6 family model ($0.10 in and $0.50 out per million tokens on 25 November 2026). A run costs about $0.0005. Every demo refuses a model outside the GPT-6 family.
- **The tool surface:** the StackQL MCP server, started over stdio from npm (`@stackql/mcp-server`), through the MCP TypeScript SDK. The model is given one or two of its tools and none of its credentials.
- **The gate:** pure functions in `src/policy.ts`, with offline tests. The model proposes; the gate, the server's mode and a named person decide.

To run any of them, with one key file for all three:

```bash
cp .env.example .env        # OPENAI_API_KEY, and AWS keys if they are not already in your environment
cd talk-1/demo              # or talk-2/demo, or talk-3/demo
npm install
npm test                    # offline: no model, no server, no cloud
npm run stage               # writes the demo's starting state to AWS
```

Then follow the demo's runsheet. `npm run replay` plays a recorded run with no key and no network, and says that it is a replay.

Each demo writes to a real AWS account in `ap-southeast-2`: version A writes eleven Parameter Store parameters under `/checkout-preview` and `/checkout-candidate`, version B creates one empty on-demand DynamoDB table called `orders`, and version C creates one called `customers` and one Parameter Store parameter, `/ops-notes/customers`. None has a standing charge, and none touches another's resources, so all three can be staged at once. `npm run teardown` in each demo removes them.

## Running the test

The decks share a template, a title slide, a checklist layout and a length, so what a test audience is comparing is the argument and the demo, not the styling.

- Give each version the same slot length and the same audience type, and run the version's own demo.
- Ask the same three questions after each: what was the one rule, what would you build first, and what does none of this catch.
- For version C, add a fourth, because it is the claim the version makes: why are there five guardrails, and not four or six.
- The notes pane of every slide carries the talk track and the cumulative time, so any version can be picked up cold.

## Status

Built and run end to end on 25 November 2026. All three demos run live against AWS with `gpt-6-luna`; `npm test` and `npm run typecheck` pass in each (24, 17 and 33 tests). The decks open in PowerPoint and were checked slide by slide as rendered there.

Not done: the two clips for version B are not recorded (its demo slides hold stills of the real run), no version has been timed aloud, the figures on version B's slides were taken from its specification without being checked again, and version C's key-press pacing has been driven in a pseudo-terminal but not from a presentation clicker. Open items are listed in [talk-1/slides.md](talk-1/slides.md), [talk-2/README.md](talk-2/README.md) and [talk-3/slides.md](talk-3/slides.md).
