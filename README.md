# Agentic platform engineering

Talks, demos, and workshop material for building platforms that agents can use safely.

> **Status:** teaching assets and fixture paths are under development. Live API and isolated-cluster paths have not been validated for event delivery. No sponsorship, model credits, deployment, recording, or publication beyond this repository is implied.

## Contents

| Material | Location |
| --- | --- |
| Cloud Native AI Summit Melbourne (28 Oct 2026), 20 minutes + 5 minutes Q&A | [Talk A slides](10-26%20Cloud%20Native%20AI%20Summit%20APAC/slides.md) |
| AI Engineer Sydney (8 Dec 2026), 18 minutes + 2 minutes transition; full-length dry run at AI Engineering Night (29 Oct) | [Talk B slides](11-26%20AI%20Engineer/slides.md), [rehearsal plan](11-26%20AI%20Engineer/rehearsal.md), [separate release-gate demo](11-26%20AI%20Engineer/demo/README.md) |
| Infracoders, Agentic Platform Engineering with StackQL (15–20 minute slot) | [CFP synopsis](11-26%20Infracoders/cfp.md), [slides](11-26%20Infracoders/slides.md), [StackQL MCP + stackql-deploy demo scaffold](11-26%20Infracoders/demo/README.md) |
| Half-day workshop, 180 teaching/lab minutes + 30-minute break | [Participant workbook](11-26%20AI%20Engineer/workshop/participant-workbook.md), [facilitator runbook](11-26%20AI%20Engineer/workshop/facilitator-runbook.md) |
| Shared workshop scenario, fixtures, Python and TypeScript safety paths | [Workshop scenarios](11-26%20AI%20Engineer/workshop/scenarios/README.md) |
| Public and live-delivery gates | [Release checklist](11-26%20AI%20Engineer/workshop/release-gates.md) |
| Current repository rules | [AGENTS.md](AGENTS.md) |

## Safe local path

The default smoke path is offline and uses no API key, network, cluster, or background process:

```powershell
Set-Location '10-26 Cloud Native AI Summit APAC\demo\agent'
npm ci
npm run smoke
npm run typecheck
```

The AI Engineer demo is an independent dependency-free Node.js fixture:

```powershell
Set-Location '11-26 AI Engineer\demo'
npm test
npm run demo
```

The Python fixture path uses only the standard library:

```powershell
Set-Location '11-26 AI Engineer\workshop\scenarios\python'
python -m unittest -v
```

Live model execution is a separate, explicit opt-in and requires an approved OpenAI API account, API key, GPT-6-family model access, and spend controls. The workshop's hosted isolated infrastructure and participant model access remain organizer dependencies; fixture support does not satisfy that hosted commitment.

## Licensing and safety

The repository is MIT-licensed. Examples use synthetic state. See each runbook for mode labels, approval boundaries, reset limitations, and release gates. Do not apply the legacy CronJob example or connect a default Kubernetes context.
