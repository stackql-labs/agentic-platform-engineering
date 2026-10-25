# Demo: context in, reviewed intent out

The demo pairs two distinct interfaces:

1. The configured StackQL MCP connector in the Anthropic connector directory reads the current deployment through a narrow SQL query.
2. `stackql-deploy` compares a reviewed declaration with the disposable local cluster and converges it after the presenter approves the dry run.

The target is fixed to a dedicated kind cluster named `infracoders-demo`, a local `kubectl proxy` bound to `127.0.0.1:8002`, and namespace `agent-context-demo`. No default/current Kubernetes context is changed. Do not use a shared, cloud, SaaS, or production account for the mutation portion.

## Read-only fixture fallback

Run `npm run fixture` to print the checked-in synthetic rows in `fixtures/deployment-context.json` if the connector, cluster, or provider is unavailable. This is a fixture replay, not a live query. A fallback can preserve the explanation but does not fulfill the live demo claim.

## Live setup checklist

The live integration is a scaffold and must be preflighted on the presentation machine. This repository does not contain an Anthropic connector configuration or credentials.

1. Install and verify `kind`, `kubectl`, `stackql`, `stackql-deploy`, and the StackQL MCP connector required by the selected Anthropic client. Confirm the commands and provider version supported by that environment; this scaffold has not been built with `stackql-deploy` here.
2. Create a disposable kind cluster only after confirming Docker/Podman capacity and the local reset plan:

   ```powershell
   kind create cluster --name infracoders-demo
   ```

3. Start a proxy in its own terminal, with the context explicit:

   ```powershell
   kubectl --context kind-infracoders-demo proxy --port=8002 --address=127.0.0.1
   ```

4. Copy `.env.example` to `.env`; preserve the fixed local endpoint and namespace. The root `.gitignore` excludes `.env`.
5. Open the user's installed StackQL MCP server entry from the Anthropic connector directory. Confirm its executable, args, provider setup, read/write permissions, and endpoint locally. Do not copy connector config or credentials into this repository.
6. Ask the connector to run the read-only SQL in `queries/deployment-context.sql`. Confirm the returned namespace, deployment label, image, desired/ready replicas, and resource version before continuing.
7. Inspect the deployment declaration and run the default dry run:

   ```powershell
   Set-Location '11-26 Infracoders\demo'
   Copy-Item .env.example .env
   .\run-deploy.ps1
   ```

   Review all generated queries. The script refuses an unexpected cluster, endpoint, or namespace. It does not mutate by default.
8. For the live convergence beat, explicitly approve the fixed local build:

   ```powershell
   .\run-deploy.ps1 -Apply
   ```

   At the prompt, type `APPLY agent-context-demo`. This is a local teaching confirmation, not an authenticated approval system.
9. Run the read-only MCP query again and verify the declared image and replica count. Capture only synthetic output; stop the proxy and delete the dedicated kind cluster after the talk.

Do not introduce drift by hand against an unknown target. If the drift-recovery beat is desired, prepare a separate, reviewed perturbation command that verifies the `kind-infracoders-demo` context, `agent-context-demo` namespace, and demo label before and after its single fixed mutation. It must require an additional explicit confirmation and have a tested restore path.

## Offline checks

```powershell
npm test
npm run fixture
```

These checks exercise the synthetic fallback and fixed-target/read-only contract; they do not contact the MCP connector, Kubernetes, cloud, or SaaS APIs.

## What the demo proves—and does not

- It demonstrates provider context queried through StackQL MCP and a declarative `stackql-deploy` build on one local Kubernetes provider.
- It does not demonstrate every cloud or SaaS provider, production authorization, atomic change preconditions, or a live agent-controlled mutation.
- The MCP query should remain read-only; deployment is a separate operator-invoked `stackql-deploy` command.
- A query is a time-bound observation. Re-read after convergence and disclose any consistency or race limitations.
- `stackql-deploy` behavior depends on its installed version and manifest/provider schema. Validate the pinned provider and dry-run output before the event; never assume a successful parse or build.
