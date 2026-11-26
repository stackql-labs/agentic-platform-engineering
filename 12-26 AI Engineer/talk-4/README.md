# Query before mutation

The [PowerPoint deck](slides/Query%20Before%20Mutation%20-%20Version%20D.pptx) has nine slides and timed speaker notes. The [slide arc](arc.md) sets aside six minutes for the demo across slides 6 and 7. The question for the room is whether the agent should undo the 3am rate-limit change.

## Run the demo

Use Node 24.22.1 or a later patched Node release supported by the StackQL launcher. From this directory, install the locked dependencies once.

```sh
cd demo
npm ci
npm run demo
```

The terminal pauses at each presenter cue. Choose the mode before taking the stage.

| Command | Investigator | Infrastructure | Approval |
| --- | --- | --- | --- |
| `npm run demo` | Scripted offline fixture | In memory, resets each run | Type `y` at the fixture prompt. A non-interactive rehearsal prints a simulated approval. |
| `npm run agent` | OpenAI TypeScript SDK, Responses API | Same in-memory fixture | Same fixture prompt. Useful for showing the model choose its own queries. |
| `npm run cloud` | Same SDK and GPT-6 model | Explicit Cloudflare demo zone, GitHub declaration, real HTTP probes | A presenter must type the displayed plan ID at a terminal. |

For either OpenAI mode, copy [the example](demo/.env.example) to `demo/.env` and set `OPENAI_API_KEY` and `OPENAI_MODEL`. The default is `gpt-6-luna`. Choose a GPT-6 family ID your OpenAI project can access and set its spend limit. Each investigation is capped at eight Responses requests. A completed repair starts a second investigation. The command stops on model errors or incomplete evidence.

## Presenter cues

On slide 5, explain the normal limit of 100 and the overnight limit of 5. Ask, "Would you put it back?" Then switch to a large terminal with the command ready.

1. **Show the symptom.** Press Enter for the 30-request probe. Let the audience read the response codes. In the fixture, five requests succeed and 25 get HTTP 429.
2. **Investigate.** Press Enter. In OpenAI mode the model chooses among the live-rule, traffic and declaration tools. Its finding and proposal appear in the terminal. Hold at `BLOCKED`. The agent can bring the operator a specific repair with read-only access.
3. **Review.** Ask whether the bot spike is over. In the scenario the on-call engineer confirms it is. Read out the site, rule and change. Approve the displayed plan. The platform reads the rule and GitHub revision again, applies the permitted change once and verifies the result.
4. **Show the outcome.** Compare the second 30-request probe with the first. Run the investigation again. If the rule already matches the declaration, it finishes without another write. Cloud traffic counts and model wording will vary.
5. **Return to slide 8.** Ask what to do if the write timed out. The platform reads the rule after an uncertain result and stops if it cannot verify the requested state.

The demo panels in the deck show the labelled offline fixture. They also work as the fallback if a network call takes too long.

## Rehearse against an isolated zone

The cloud mode uses the StackQL MCP server for Cloudflare reads and the single-rule write. It reads the approved declaration and its commit history from the public GitHub API. The release blocker for live delivery is an end-to-end rehearsal with the operator's OpenAI project and a dedicated test zone. The SDK tool loop and the MCP read, refusal and write paths have been exercised with local test responses.

1. Put [declaration.json](demo/declaration.json) at `12-26 AI Engineer/talk-4/demo/declaration.json` on a public GitHub branch you control. Set `TALK4_GITHUB_REPO` and `TALK4_GITHUB_BRANCH`. The demo reads the file at the latest commit that touched that path and checks its contents against the local declaration.
2. Use a proxied demo hostname with a harmless `GET /talk4-check` that returns HTTP 200. Set `TALK4_HOST`, `TALK4_ZONE_ID` and `TALK4_RULE_ID` explicitly. Set two distinct zone-scoped tokens. The reader needs zone, WAF and analytics read access. The writer needs Zone WAF Write on that zone.
3. Prepare one rule in the zone's `http_ratelimit` phase using the definition below. Stage the 3am edit by changing just its threshold from 100 to 5 after the approved declaration is committed. Keep the rule ID. Other rules in the phase stay outside the proposed operation.
4. Run `npm run providers` to install the Cloudflare provider in the demo's own cache. The launcher downloads its pinned StackQL binary on first use. Start `npm run cloud` a few minutes early and run the first probe. Wait for Cloudflare's sampled analytics before starting the investigation. Missing 429 evidence stops the proposal.
5. At the approval prompt, confirm the target and type `APPROVE` followed by a space and the displayed ID. The plan expires five minutes after the first evidence read. The test makes 30 GETs before the repair and 30 more after a fresh rate-limit window. On success the rule is back at 100. For another cloud rehearsal, repeat the staged edit in step 3.

Use this definition for the dedicated rule. The model never receives an arbitrary SQL or shell tool.

```json
{
  "ref": "talk4_demo_rate_limit",
  "description": "Talk 4 rate limit",
  "expression": "(http.request.uri.path eq \"/talk4-check\")",
  "action": "block",
  "enabled": true,
  "ratelimit": {
    "characteristics": ["cf.colo.id", "ip.src"],
    "period": 10,
    "requests_per_period": 100,
    "mitigation_timeout": 10
  }
}
```

The writer addresses a specific zone, ruleset and rule ID and sends the complete supported rule definition. The platform rejects unexpected rule settings. Readback establishes what Cloudflare reports after the write. There is still a race between the final read and the write if another operator edits the rule at that instant. The terminal approval represents the presenter in this demo. [Cloudflare single-rule update](https://developers.cloudflare.com/ruleset-engine/rulesets-api/update-rule/).

## Checks and provenance

From `demo`, run `npm test` and `npm run typecheck`. Tests cover the OpenAI SDK tool loop with scripted HTTP responses, refusal, stale evidence, scoped target and value, uncertain write outcomes, readback and the second run. They run offline after dependency installation.

The October [AI Engineering Night demo](../../10-26%20AI%20Engineering%20Night/demo/README.md) is the source of the 3am incident. This version uses its own rule, declaration and implementation. The deck uses the repository's Sydney PowerPoint template. The demo uses the official [OpenAI TypeScript SDK](https://github.com/openai/openai-node), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [StackQL MCP launcher](https://github.com/stackql/stackql). The dependency lock records the package versions and licences.
