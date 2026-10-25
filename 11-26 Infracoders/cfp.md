# Call for papers

## Agentic Platform Engineering with StackQL

**Proposed speaking slot:** 15–20 minutes.

> As agents start operating infrastructure, the "C" in IaC shifts from Code to Context. StackQL exposes cloud and SaaS providers as data sources accessed via SQL, giving agents a query-before-mutation guardrail with no state files to drift. Demonstrated live with the StackQL MCP server (in the Anthropic connector directory) and stackql-deploy, a declarative statefile-less deployment framework.

## Session summary

Infrastructure automation is moving from reviewing code and applying saved plans toward agents that inspect current provider state, reason over evidence, and act through bounded interfaces. This talk introduces context as a first-class input to infrastructure operations: SQL makes provider state queryable, the StackQL MCP server lets an agent discover and read that context, and `stackql-deploy` expresses convergent desired state without a separate state file.

The demonstration uses a disposable local Kubernetes environment. The agent reads live deployment state through the configured StackQL MCP connector, identifies drift, and proposes a correction. The operator reviews the evidence; `stackql-deploy` then rebuilds the declared state and the presenter queries again to verify convergence. The demo is explicitly scoped to the disposable cluster and does not use production credentials or accounts.

The talk also covers the limits of the pattern: current context can be stale, a query is not authorization, and statefile-less deployment is not a substitute for identity boundaries, approvals, audit, or verification.

**Status:** The proposed synopsis describes the intended live demonstration. The local demo scaffold and runbook are being prepared; live MCP connector setup and `stackql-deploy` execution must be validated in the target environment before claiming a successful live run.
