# Query before mutation

Slide arc for Jeffrey Aven's 18-minute AI Engineer Sydney talk. Allow 17 minutes for the talk, including a continuous six-minute StackQL demo, and one minute for live timing.

**Premise.** For a decade, many of us have pictured infrastructure change as something that starts with a commit and ends with an apply. A state file records what our tool last saw. AI changes who can operate the platform between those runs. Give a program a standing job, tools to inspect the cloud and permission to act, and the next change can start in production while the repository sits untouched. What should the platform require before that program can write?

## 1. Query before mutation

*Guardrail patterns for agents that touch production infrastructure*

**0:00 to 0:30. Opening slide.** Keep the conference title and speaker name on screen. Open with the question in the room.

- "Hands up if you've given a pipeline permission to apply a change you wrote."
- "Keep your hand up if you've given a program permission to work out what change to make."

**Infographic idea.** A small familiar pull request under the title. Its author wrote the change. On the next slide, replace the pull request with the assignment that comes *before* anyone knows what to change.

## 2. Agentic platform engineering

*Give a program an operational goal and let it choose what to investigate.*

**0:30 to 2:15.** A platform team gives people tools to operate a service. An agent can use those tools too. Give it the job "Find out why the site is turning people away." The model contributes the reasoning. A timeout might lead it to check the server. A rate-limit response might lead it to ask whether traffic surged or someone lowered the limit. That question guides what it queries next. The platform team decides how far it can go.

- **Query.** Inspect the running service and follow up on the evidence.
- **Reason.** Weigh possible causes and choose the next check that could tell them apart.
- **Propose** Bring the on-call engineer a finding and a specific change.
- **Act.** If authorised, change the live setting and check the result.

**Infographic idea.** Put the assignment at the top. Branch on two possible observations, "Server timed out" and "Too many requests". Reveal a different next query beneath each. The audience can see a decision before hearing about a framework.

## 3. What jobs would you give it?

*A standing assignment can start with a finding, an alert or a change in the cloud.*

**2:15 to 4:00.** Give the room a sense of what becomes possible. Read each assignment as something a team lead could hand to an engineer today. Then pick the SRE assignment and stay with it for the rest of the talk.

- **Compliance.** Find publicly readable storage buckets. Which ones have an approved exception?
- **Security.** An internal service is reachable from the internet. Which rule opened it, and what is the smallest change that closes it?
- **SRE.** Requests are being refused. Find out why and bring the on-call engineer a fix.
- **Infrastructure as code (IaC).** Someone changed a setting in the console. If the team wants to keep it, draft the Terraform pull request.

**Infographic idea.** Show a team's work queue. Give each assignment its expected result in the right margin. Select the SRE row, "Bring me a fix", as the others fade.

## 4. What happens between applies?

*A person, a controller and an agent can all change the same live service.*

**4:00 to 5:15.** This is where the static picture of infrastructure breaks down. Configuration says what the team wants. State tracks the objects Terraform manages. A normal plan reads those objects again before proposing changes. An engineer reviews the plan. Now put that engineer in the console at 3am and an agent on shift five minutes later. The next commit could still be hours away. Who reviews what the agent does in the meantime? [Terraform plan](https://developer.hashicorp.com/terraform/cli/commands/plan) and [purpose of Terraform state](https://developer.hashicorp.com/terraform/language/state/purpose).

- The last apply finished at the approved setting.
- The on-call engineer changed the running service overnight.
- The agent has to decide what to do before the next plan.

**Infographic idea.** One timeline with an evening apply on the left and the next plan on the right. Reveal the console edit and the agent's investigation in the space between them. Carry those two events onto the incident slide.

## 5. Would you undo the 3am change?

*A rate limit protects the site. This morning, the site is turning requests away.*

**5:15 to 6:30.** Show a test request getting `429 Too Many Requests`. The rule limits how often one client can hit the site. Overnight, the on-call engineer suspected bot traffic and tightened the limit. Ask the room, "Would you put it back?" Give them a few seconds. Someone who asks whether the bot spike is over has just identified a fact the configuration cannot supply.

- Usually one client can make 100 requests in 10 seconds.
- At 3am the engineer lowered the limit to 5.
- The approved configuration still says 100.

**Infographic idea.** Show 30 test requests from one client across a 10-second window. Put the observed `429` beside the overnight limit of 5. Keep the approved value of 100 in view. Return to the same test after the repair.

## 6. What did the agent find?

*The agent can investigate the incident with read-only access.*

**6:30 to 9:30. Demo, first half.** Give the agent the SRE assignment from slide 3. Introduce StackQL here as the tool it uses to query cloud and SaaS APIs with SQL. Show the results of the investigation, then the exact proposal. The read-only server refuses the attempted write. Hold on that frame long enough for the room to see both the useful work and the refusal.

- **Cloudflare.** Read the live rule and recent traffic. The limit is 5. The traffic sample contains rejected requests.
- **Approved configuration.** The manifest says 100. Its GitHub history places the last edit before the change to the live rule.
- **Proposal.** Restore 100 on the demo site with rate limiting still enabled. **Write blocked.** The agent reports the refusal and stops.

**Infographic idea.** Use the terminal as the slide. Keep three short evidence lines legible from the back row. Hold the proposal beside the server's actual refusal. The number of blocked requests alone cannot tell the operator whether the traffic was legitimate.

## 7. Who can put the limit back?

*The operator approves an exact change. The platform controls the write.*

**9:30 to 12:30. Demo, second half.** Continue from the blocked proposal. In this scenario the on-call engineer confirms the temporary restriction can end. That supplies the missing operational judgement. Take the same proposal through the platform's approval path. The agent keeps its read-only access throughout.

- **Before writing.** Show the target site and the approved rule. Code checks the proposed change against the declaration. The operator approves that exact change. Re-read the live rule before applying it. A change since approval calls for a fresh decision.
- **Apply and verify.** The tool exposes one operation, restoring the declared rate-limit rule. Its credential is scoped to the demo zone. After the write, query Cloudflare again and show the threshold and enabled flag. Repeat the same test traffic in a fresh window and show the actual responses.
- **Run it again.** The live rule already matches. The agent reports that and sends no write. "Set the limit to 100" is an *idempotent assertion*. Running it twice still leaves the limit at 100. "Add 95" would give you 195 on the second run.

**Infographic idea.** Stay in the same terminal. Hold on the before-and-after traffic test so the room sees what changed for a user. Underneath, show the repeat run's write count of zero.

## 8. What if the write times out?

*The cloud may have applied the change even if the caller missed the answer.*

**12:30 to 14:45.** Freeze the demo at the instant after the operator approves. Replace the success response on the slide with a hypothetical timeout. Ask, "Would you send it again?" On slide 6 the platform knew it had refused the write. Here the outcome is unknown. That difference determines the recovery.

- **Blocked.** Keep the refusal and stop. The operator can review the proposal through the approved path.
- **Timed out.** Read again. If the rule is already at 100, the job is done. If it is still at 5, recheck the evidence, policy and approval before another attempt. If the state is unclear, hand it back to the operator.
- **Applied.** What if the bot spike is still underway? A fresh read can go stale, a narrow credential can still change this site, and an allowed value can still be the wrong choice today.

**Infographic idea.** Put "Request timed out" above one fresh query. Reveal `100`, `5` and `unknown` one at a time. Ask the audience for the next action in each case.

## 9. Before you give an agent write access

*Start with an investigation worth doing. Add the controls in this order.*

**14:45 to 17:00.** Read the checklist as an implementation order for a team's first agent. The read-only version can already take work off the on-call engineer. The later steps earn it one specific write.

1. Give it a useful read-only job. Keep credentials in the tool server.
2. Require a fresh query of the target and name the approved state in every proposal.
3. Expose one operation that sets an exact end state. Scope its credential to the smallest practical target.
4. Put the allowed target and value in code. Require human approval of the exact change.
5. Recheck before applying, verify afterwards and give refusals and unknown outcomes distinct recovery paths.

**Infographic idea.** Put the checklist beside the timeline from slide 4. Mark where each control took effect between the two Terraform runs. Leave the checklist on screen through the transition.

**Closing line.** "Your next infrastructure change might start at 3am with an agent noticing something in production. What evidence would you want it to bring you before you let it write?"

## Demo basis

The [AI Engineering Night rate-limit demo](../../10-26%20AI%20Engineering%20Night/demo/README.md) supplies the Cloudflare scenario and the recorded read-only refusal. Slides 6 and 7 describe the proposed Sydney demo. Rehearse the pre-write recheck, approved write, fresh readback, before-and-after traffic test and second run together on an isolated demo zone before billing them as a live sequence. The October recording covers the read-only run. Label it as a replay if shown.
