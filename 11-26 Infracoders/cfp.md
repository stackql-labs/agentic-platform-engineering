# Session abstract

## Stateless IaC for Agents: stackql-deploy

**Event:** Infracoders Melbourne, November meetup, 10 November 2026. Presentation 1. About 25 minutes including about 5 for Q&A.

**Speaker:** Jeffrey Aven (StackQL Studios)

> stackql-deploy is an open-source, SQL-native IaC tool backed by the stackql engine. It has no state file: it queries the live cloud control plane with SQL and runs idempotent existence checks, state checks and create or update operations against the provider directly.
>
> With your cloud APIs exposed as a self-discoverable data layer, agents can query before they mutate, work inside policy gates, and use one interface for both provisioning and SRE tasks such as cost analysis, posture checks and incident triage. Patterns for safe agent access to the control and data planes are covered, followed by a live demo.

## How the session delivers on it

| Abstract | Where |
| --- | --- |
| No state file; existence checks, state checks, create or update against the provider | Slide 13 and the first two demo beats: a cell built from nothing, then built again with no change |
| Cloud APIs as a self-discoverable data layer | Slides 2 to 4 and 9 to 11 |
| Agents query before they mutate, inside policy gates | Slide 14 and the agent run: SELECTs through a read-only MCP server, then a gated `stackql-deploy build` with an approval |
| One interface for provisioning and SRE: posture checks, incident triage, cost analysis | The demo shows a posture check (deletion protection across three regions) and triage (who changed it, from CloudTrail). Slide 17 covers cost analysis and the rest as patterns; cost analysis is not run live |
| Patterns for safe agent access to the control and data planes | Slide 14: read wide, write narrow |
| A live demo | [demo/](demo/README.md), with a recorded transcript as a clearly labelled fallback |

## Earlier working title

This session was first outlined as "Agentic Platform Engineering with StackQL" with a local Kubernetes demo. The published abstract above replaced it; the Kubernetes scaffold was removed in favour of the three-region AWS demo.
