# Agentic platform engineering

Talks, demos, and workshop material for building platforms that agents can use safely.

> **Status:** teaching assets and fixture paths are under development. Live API and isolated-cluster paths have not been validated for event delivery. No sponsorship, model credits, deployment, recording, or publication beyond this repository is implied.

## Contents

| Material | Location |
| --- | --- |
| Cloud Native AI Summit Melbourne (28 Oct 2026), 20 minutes + 5 minutes Q&A | [Talk A deck](10-26%20Cloud%20Native%20AI%20Summit%20APAC/AI%20Native%20Platform%20Engineering%20-%20Agents%20as%20the%20Primary%20Consumer.pptx), [the 3am drift review demo](10-26%20Cloud%20Native%20AI%20Summit%20APAC/demo/README.md) |
| AI Engineer Sydney (8 Dec 2026), 18 minutes + 2 minutes transition; full-length dry run at AI Engineering Night (29 Oct). Three versions of the talk for an A/B/C test | [overview and comparison](12-26%20AI%20Engineer/README.md); version A: [deck](12-26%20AI%20Engineer/talk-1/slides/Query%20Before%20Mutation%20-%20Version%20A.pptx), [outline](12-26%20AI%20Engineer/talk-1/slides.md), [the release gate demo](12-26%20AI%20Engineer/talk-1/demo/README.md); version B: [deck](12-26%20AI%20Engineer/talk-2/slides/Query%20Before%20Mutation%20-%20Version%20B.pptx), [specification](12-26%20AI%20Engineer/talk-2/talk-slide-and-clip-detail.md), [the safety setting demo](12-26%20AI%20Engineer/talk-2/demo/README.md); version C, the challenger: [deck](12-26%20AI%20Engineer/talk-3/slides/Query%20Before%20Mutation%20-%20Version%20C.pptx), [slide detail](12-26%20AI%20Engineer/talk-3/slides.md), [the ops note demo](12-26%20AI%20Engineer/talk-3/demo/README.md) |
| Infracoders Melbourne (10 Nov 2026), Stateless IaC for Agents: stackql-deploy, 20 minutes + 5 minutes Q&A | [deck](11-26%20Infracoders/slides/Stateless%20IaC%20for%20Agents.pptx), [running order](11-26%20Infracoders/slides.md), [abstract](11-26%20Infracoders/cfp.md), [the rollout gate demo](11-26%20Infracoders/demo/README.md) |
| Infracoders Melbourne, StackQL primer for the same talk (separate from the demo above) | [nine statements for `stackql shell` across AWS, Cloudflare and GitHub](11-26%20Infracoders/stackql_intro/README.md) |
| Half-day workshop, 180 teaching/lab minutes + 30-minute break | [Participant workbook](12-26%20AI%20Engineer/workshop/participant-workbook.md), [facilitator runbook](12-26%20AI%20Engineer/workshop/facilitator-runbook.md) |
| Shared workshop scenario, fixtures, Python and TypeScript safety paths | [Workshop scenarios](12-26%20AI%20Engineer/workshop/scenarios/README.md) |
| Public and live-delivery gates | [Release checklist](12-26%20AI%20Engineer/workshop/release-gates.md) |
| Current repository rules | [AGENTS.md](AGENTS.md) |

## Safe local path

The default smoke path is offline and uses no API key, network, cluster, or background process:

```powershell
Set-Location '10-26 Cloud Native AI Summit APAC\demo\agent'
npm ci
npm run smoke
npm run typecheck
```

The three AI Engineer demos each have offline tests of their policy gate, and a replay of a recorded run that needs no key and no network:

```powershell
Set-Location '12-26 AI Engineer\talk-1\demo'   # or talk-2\demo, or talk-3\demo
npm install
npm test
npm run replay
```

Their live runs (`npm run stage`, then the demo's runsheet) call an OpenAI model and write to an AWS account, and are an explicit opt-in.

The Python fixture path uses only the standard library:

```powershell
Set-Location '12-26 AI Engineer\workshop\scenarios\python'
python -m unittest -v
```

Live model execution is a separate, explicit opt-in and requires an approved OpenAI API account, API key, GPT-6-family model access, and spend controls. The workshop's hosted isolated infrastructure and participant model access remain organizer dependencies; fixture support does not satisfy that hosted commitment.

## Licensing and safety

The repository is MIT-licensed. Examples use synthetic state. See each runbook for mode labels, approval boundaries, reset limitations, and release gates. Do not apply the legacy CronJob example or connect a default Kubernetes context.
