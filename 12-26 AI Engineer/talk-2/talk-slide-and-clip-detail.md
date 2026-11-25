# Talk slide and clip detail

Version 2, dated 25 November 2026, for "Query before mutation: guardrail patterns for agents that touch production infrastructure", Tuesday 8 December 2026. It replaces version 1 of this doc, which was too complicated for the room, and it supersedes the run of show and demo clips in the strawman (`claude/talk-strawman-and-use-cases.md`). The strawman's use cases, checklist, positioning notes and sources still stand. Not yet signed off.

## The simplified message

The talk now says one thing, and everything on screen either states it or shows it.

- **Message:** always reading, never writing alone.
- **Mechanism:** the model proposes. The system decides.
- **Shape:** the problem, one rule, a write being blocked, the four other guardrails that made the refusal work, the same write recovered, then the checklist, the standing jobs and the close.
- **Scenario:** one production table with one safety setting that should be on and is off. An agent is asked to put it back. There is no backstory about who changed it or when.

## What changed from version 1

The cuts remove concepts, not only slides.

- **3am story:** removed, along with the scenario slide, the drift and attribution framing, the CloudTrail lookup and the 35% figure. Recording no longer depends on CloudTrail catching up.
- **Clips:** two instead of five. The cold open is dropped, the read from clip A becomes the first beat of Demo 1, and the policy decline of a `DELETE` becomes one spoken line on pattern 03.
- **Order:** show, then tell. One rule, then the blocked demo, then four guardrails explained from stills of that demo, then the recovery.
- **Pattern slides:** a plain-language heading, the synopsis term as the byline, and two lines of text (helps, does not help) in place of three bullets and a separate spoken limit.
- **Slides removed:** the scenario, the five-guardrail list and "What none of this catches", which becomes one spoken sentence at the checklist.
- **Kept as they were:** the checklist and the standing-jobs slide, now slides 9 and 10, directly before the close.
- **Synopsis:** still covered in full. All five named patterns, where each helps and where it does not, a mutation blocked and recovered, and the ordered checklist.
- **Count:** 11 slides and 2 clips, down from 14 and 5, at a slower pace.

## Words on screen

Slides 1 to 8 and both clips use plain words. The synopsis term appears once, as the byline of its pattern slide.

| Synopsis term | On the slide |
|---|---|
| Query before mutation | Look before you write |
| Idempotent assertions | Say the end state, not the steps |
| Policy gates | Rules in code, not in the prompt |
| Scoped credentials and mutation surfaces | The model never holds the key |
| Recovery paths | Blocked means stop. Failed means look again. |

Kept off those slides and the captions: drift, declaration, attribution, estate, telemetry, re-assert. Slides 9 and 10 are unchanged and still use some of that vocabulary; see the open items.

## Run of show

Eleven slides and two clips, 16:15 with 1:45 of slack. The first pattern lands at 2:15 and the first demo at 3:30.

| # | Slide or clip | Time | Cum. | What lands |
|---|---|---|---|---|
| 1 | Title | 0:15 | 0:15 | The name of the talk |
| 2 | Allow? | 1:00 | 1:15 | The pause that keeps a coding agent safe has a person in it. An always-on agent has nobody to ask |
| 3 | Trusted to look, not to touch | 1:00 | 2:15 | The trust gap in two numbers. "Always reading, never writing alone." |
| 4 | 01 Look before you write | 1:15 | 3:30 | Query before mutation, and the loop the rest of the talk hangs on |
| D1 | Demo 1: Blocked | 2:00 | 5:30 | The agent looks, proposes one change, is held, reports and stops |
| 5 | 02 Say the end state, not the steps | 1:00 | 6:30 | Why the proposal was one statement that is safe to run twice |
| 6 | 03 Rules in code, not in the prompt | 1:00 | 7:30 | Why it was held |
| 7 | 04 The model never holds the key | 1:15 | 8:45 | Why it could not go around the refusal. The nine-second story |
| 8 | 05 Blocked means stop. Failed means look again. | 1:00 | 9:45 | Why it stopped, and what happens next |
| D2 | Demo 2: Recovered | 2:00 | 11:45 | A named person approves. Look, apply, look. A second run does nothing |
| 9 | The ordered checklist | 1:45 | 13:30 | What to build first |
| 10 | Same loop, standing jobs | 1:45 | 15:15 | Where else it applies |
| 11 | Close | 1:00 | 16:15 | The message, the QR and star ask, the workshop pointer |
| - | Slack | 1:45 | 18:00 | |

## Slides and clips

A few conventions hold throughout, so they are stated once here.

- **Pattern layout:** every pattern slide has a plain-language heading, the synopsis term as its byline, two lines of text and one picture.
- **Pattern pictures:** a still from Demo 1 with one region highlighted, so each guardrail is explained from something the room has just watched. Pattern 04 is the exception.
- **The loop:** five stops on a ring, one per pattern: Look, Propose, Check, Apply, Look again. It is full size on slide 4, a small corner marker with the current stop lit on slides 5 to 8, and the centre of slide 10.
- **Clips:** silent, narrated live, trimmed of waits, zoomed on the frame in play, one plain-word caption at a time, each ending on a held frame. Amber means held and green means applied.
- **Figures:** a figure on a slide carries its source and sample size in small type along the bottom edge.
- **On-screen statements:** sketches. Names were checked against the `aws` provider on the local StackQL MCP server (`aws.dynamodb.tables`). The recorded harness output is authoritative and the region is a placeholder.

### Slide 1 - Title

Runs 0:15, ends 0:15.

- **Heading:** Query before mutation
- **Byline:** Guardrail patterns for agents that touch production infrastructure
- **Text:** Jeffrey Aven, Maintainer, StackQL Studios. AI Engineer Sydney, 8 December 2026.
- **Image:** template title layout with the template mark. No clip behind it.

### Slide 2 - The pause

Runs 1:00, ends 1:15.

- **Heading:** Allow?
- **Byline:** The pause that keeps a coding agent safe has a person in it
- **Text:**
  - A coding agent proposes, then waits for a person
  - An always-on agent has nobody to ask
- **Image:** infographic, two panels. Left is a generic permission dialog with Allow and Deny buttons and a person marker beside it. Right is the same dialog with an empty outline where the person was. Drawn in the template style, not a product screenshot.
- **Spoken:** infrastructure tooling has worked the same way for years: show the plan, wait for a yes. Giving an agent permission to change production removes that pause.

### Slide 3 - The trust gap

Runs 1:00, ends 2:15.

- **Heading:** Trusted to look, not to touch
- **Byline:** Comfort with AI investigating incidents runs well ahead of comfort with AI fixing them
- **Text:**
  - 85% comfortable with AI running read-only investigations
  - 52% comfortable with AI fully remediating on its own
  - Always reading, never writing alone.
- **Image:** infographic. Two horizontal bars on a shared scale, 85 and 52, with the space between them shaded and bracketed. The message sits beneath as the only full sentence on the slide. Source line: Grafana Labs, 2026 State of Observability, 300 IT and engineering leaders.
- **Spoken:** the answer is not more trust in the model. It is putting the pause back into the system.

### Slide 4 - Pattern 01

Runs 1:15, ends 3:30.

- **Heading:** Look before you write
- **Byline:** Pattern 01 - Query before mutation
- **Text:**
  - Helps: the agent acts on what is true now, not on what it remembers or assumes
  - Does not help: things can change between the look and the write
- **Image:** the loop at full size, introduced here. Five stops on a ring (Look, Propose, Check, Apply, Look again) with "Look" lit. One caption beneath the ring: "The model proposes. The system decides."
- **Spoken:** this is the first of five. The demo shows it, and the other four are explained from what was just watched.

### Demo 1 - Blocked

Runs 2:00, ends 5:30.

- **Heading:** Demo 1 - Blocked
- **Byline:** An agent is asked to fix one safety setting on a production table
- **Text (captions):**
  - The job: turn deletion protection back on
  - One tool, no keys
  - It looks first: protection is off
  - It proposes one change
  - Held: not without a person
  - It reports and stops
- **Image (frames):**
  1. The task appears as one plain sentence. The agent's tool list shows a single MCP server.
  2. The agent runs a `SELECT` against `aws.dynamodb.tables` for `orders`. One row comes back. Zoom on `deletion_protection_enabled = false`.
  3. The proposal: one statement that sets deletion protection to on.
  4. An amber band reading `HELD - write path off`, with the rule name.
  5. The agent's final message gives the statement, says it was not run, and ends. No retry, no other route.
  6. Held frame: the amber band over the statement.
- **Spoken:** deletion protection is the setting that stops the table being deleted by accident. The MCP server is named at frame 1 as the agent's only tool. StackQL is named at frame 2: open source, cloud and SaaS providers as data sources queried with SQL, every query a live call.

### Slide 5 - Pattern 02

Runs 1:00, ends 6:30.

- **Heading:** Say the end state, not the steps
- **Byline:** Pattern 02 - Idempotent assertions
- **Text:**
  - Helps: running it twice is safe, so a retry cannot make things worse
  - Does not help: a wrong end state gets applied just as reliably
- **Image:** still from Demo 1, frame 3, with the statement enlarged in a code panel. Loop marker with "Propose" lit.

  ```sql
  UPDATE aws.dynamodb.tables
  SET data__DeletionProtectionEnabled = true
  WHERE region = 'ap-southeast-2'
  AND data__TableName = 'orders';
  ```

### Slide 6 - Pattern 03

Runs 1:00, ends 7:30.

- **Heading:** Rules in code, not in the prompt
- **Byline:** Pattern 03 - Policy gates
- **Text:**
  - Helps: a rule checked by code holds whatever the model says or is told
  - Does not help: a rule that allows a bad change allows it every time
- **Image:** still from Demo 1, frame 4, with the amber band and the rule name highlighted. Loop marker with "Check" lit.
- **Spoken:** some changes need a person, like this one. Some are never allowed: a delete on this table is refused before anyone is asked.

### Slide 7 - Pattern 04

Runs 1:15, ends 8:45.

- **Heading:** The model never holds the key
- **Byline:** Pattern 04 - Scoped credentials and mutation surfaces
- **Text:**
  - Helps: the agent can only ask, through one door, for what that door allows
  - Does not help: one over-powered key left lying around makes every other guardrail optional
- **Image:** the numeral "9 s" in display size. Caption beneath: "A coding agent found a token in an unrelated file. Deleting a production database and its backups took nine seconds." Dated April 2026, with no vendor, tool or model named. Loop marker with "Apply" lit. A small inset of Demo 1, frame 1, shows the single tool.

### Slide 8 - Pattern 05

Runs 1:00, ends 9:45.

- **Heading:** Blocked means stop. Failed means look again.
- **Byline:** Pattern 05 - Recovery paths
- **Text:**
  - Helps: a refusal ends in a report a person can act on, and every retry starts from a fresh look
  - Does not help: putting a setting back does not undo what happened while it was wrong
- **Image:** still from Demo 1, frame 5, with the agent's final message highlighted. Loop marker with "Look again" lit.
- **Spoken:** the hand-over to Demo 2. A person now has the exact statement in front of them.

### Demo 2 - Recovered

Runs 2:00, ends 11:45.

- **Heading:** Demo 2 - Recovered
- **Byline:** A named person approves that one statement
- **Text (captions):**
  - Approved by [name], this statement only
  - It looks again: still off
  - Applied
  - It looks again: on
  - Run it twice: nothing to do
  - The record: who proposed, who approved, what ran
- **Image (frames):**
  1. Approval. In the Jira version, a change ticket carrying the exact statement is moved to Approved by a named person in the browser. In the terminal version, the approval prompt shows the statement and the approver's name.
  2. Back in the terminal, the system reads the table again: still `false`.
  3. Apply, with a green band reading `APPLIED`.
  4. It reads again: `true`.
  5. The run is repeated and reports nothing to do.
  6. Held frame: the audit rows with the actor column zoomed. Agent proposed, policy held, [name] approved, system applied.
- **Spoken:** "What changed between held and applied is a named approval, not a looser mode."

### Slide 9 - The checklist

Runs 1:45, ends 13:30. Content unchanged from version 1.

- **Heading:** The ordered checklist
- **Byline:** Most protection for the least implementation effort, from the top
- **Text:** six rows.

  | # | Control | Pattern | Effort |
  |---|---|---|---|
  | 1 | Write path off by default | 03 | A config flag |
  | 2 | Credential scoped, held outside the model's context | 04 | An hour |
  | 3 | Live read before any proposal | 01 | Prompt plus harness order |
  | 4 | One mutation surface, idempotent assertions, every statement audited | 02, 04 | Days |
  | 5 | Policy gate in code, with tests | 03 | Days |
  | 6 | Blocked: report and stop. Failed: re-read and re-assert | 05 | Ongoing |

- **Image:** the table is the visual. The pattern column uses the loop's numbered chips. The effort column is drawn as a bar that lengthens down the table. No builds, high contrast. Footer: `github.com/stackql-labs/agentic-platform-engineering` in type large enough to read from the back row.
- **Spoken:** all five can pass and the change can still be wrong, if what was asked for was wrong. This sentence replaces the old "What none of this catches" slide.

### Slide 10 - Standing jobs

Runs 1:45, ends 15:15. Content unchanged from version 1.

- **Heading:** Same loop, standing jobs
- **Byline:** A system to act in, state that can be queried, outcomes that can be re-read
- **Text:** four cards, each with a standing question, one figure and a first governed write.

  | Card | Standing question | Figure | First governed write |
  |---|---|---|---|
  | Controls evidence | Can this control be shown operating right now? | 58% spend more than 2,000 person-hours a year collecting evidence by hand (RegScale) | Evidence filed to the ticket |
  | Drift and unmanaged estate | What changed, who changed it, was it declared? | #1 IaC blocker: console-built infrastructure that was never codified (Firefly) | Re-assert the declared setting |
  | Cost long tail | What is being paid for that nobody is using? | 29% of cloud spend wasted, the first increase in five years (Flexera) | Tag and stop, never delete |
  | Agent and identity inventory | What can act on the estate, and whose is it? | 68% cannot reliably tell agent activity from human activity (Cloud Security Alliance) | Disable an unused key, never delete |

- **Image:** infographic, a 2 by 2 grid of cards around the loop from slide 4. Each card has an icon, the standing question as its title, the figure in display type, the source in small type and the first governed write as a footer line. A chip on each card names the workshop track: Cloud security posture, SRE, FinOps, Entitlements and access review.
- **Spoken:** one line per card. On the evidence card: APRA-regulated entities have been under CPS 230 since 1 July 2025.

### Slide 11 - Close

Runs 1:00, ends 16:15.

- **Heading:** Always reading, never writing alone.
- **Byline:** The model proposes. The system decides.
- **Text:**
  - QR code with the repo URL beneath it
  - Workshop: Building Agents That Safely Operate Real Cloud Infrastructure - Wednesday 9 December, 1:30 pm
  - Contact line as on the template
- **Image:** the message in display type across the left two thirds. The QR sits on the right, large, with the URL printed beneath for anyone who cannot scan. Template mark. The slide stays up through the transition.
- **Spoken:** the star ask, once. "Tomorrow at 1:30 you pick one and build it."

## Figures checked

Every figure that appears on a slide was checked against its source on 25 November 2026. Several need a wording or attribution change from the strawman.

| Slide | Figure | Finding | Source |
|---|---|---|---|
| 3 | 85% and 52% | The release body gives 52% for full remediation; its subtitle gives 50%. Both figures concern incidents. 300 IT and engineering leaders at director level or above, fielded June 2026 | https://grafana.com/press/2026/10/19/survey-ai-adoption-is-outpacing-trust-as-enterprises-push-toward-autonomous-operations/ |
| 7 | 9 seconds | The deletion call took nine seconds. The token was found in an unrelated file and had been created for domain operations. The hosting provider later recovered the data, so the slide says "deleted", where the strawman said "lost" | https://www.computing.co.uk/news/2026/ai/ai-coding-agent-goes-rogue and https://www.eweek.com/news/claude-ai-database-wipe/ |
| 10 | 58% and 2,000 person-hours | Confirmed in RegScale's own 2026 State of Continuous Controls Monitoring report (250+ security leaders, organisations over 1,000 employees). The Help Net Security article linked in the strawman does not carry the figure | https://regscale.com/resource-center/state-of-continuous-controls-monitoring-report/ |
| 10 | #1 IaC blocker | Firefly publishes it as a rank, "retrofitting existing ClickOps infrastructure into code", with no percentage | https://www.firefly.ai/blog/cloud-resilience-is-iacs-1-benefit-in-2026-but-most-teams-still-cant-deliver-on-it |
| 10 | 29% | Confirmed, including the first increase in five years. The release says wasted cloud spend with no IaaS and PaaS qualifier. 750+ respondents | https://www.flexera.com/about-us/press-center/flexera-finds-cloud-value-is-rising-while-ai-waste-grows |
| 10 | 68% | A Cloud Security Alliance survey, quoted in the Techstrong report. The 10% in the strawman is Okta research quoted in the same report. Attribute to the originating survey | https://devops.com/wp-content/uploads/2026/09/The-Great-Unification.pdf |
| 10 (spoken) | CPS 230 from 1 July 2025 | Confirmed | https://www.apra.gov.au/node/61115 |

## Open items

These are additional to the open items in the strawman.

- **Pattern headings:** the five plain-language headings are proposals and need Jeff's ear.
- **Cold open:** dropped for simplicity. It can return as a 15 second cut of Demo 1 if the opening needs more pace.
- **Policy decline:** the refused `DELETE` is now one spoken line on slide 6. It can return as a 20 second tail on Demo 1.
- **Slides 9 and 10:** kept as they were. They still say estate, re-assert and mutation surface, which the earlier slides now avoid. A light rewording would bring them into line without changing the substance.
- **Slide 3:** 52 or 50. The Grafana report itself settles it.
- **Slide 8:** the "does not help" line is a proposal, since the strawman has no limit for this pattern.
- **Slide 10 drift card:** the figure is a rank, not a percentage.
- **Slide 10 identity card:** trace the Cloud Security Alliance primary before the slide is final.
- **Slide 11:** the message is the heading and the mechanism line is the byline. The mechanism line is the strawman's thesis candidate, shortened. If stars on `stackql/stackql` are the aim, the QR lands there and the demo repo stays in the checklist footer.
- **Demo 2:** Jira or terminal approval, as in the strawman.
- **Statements:** replace the sketch with harness output. The provider's method list spells the table-name parameter `data__table_name` and the method contract spells it `data__TableName`; the sketch uses the latter.
- **Template fit:** the prep folder could not be opened from this session, so layouts are described without reference to the AI Engineering Night template.
- **Strawman:** its run of show and demo clips need bringing into line once this shape is agreed.
