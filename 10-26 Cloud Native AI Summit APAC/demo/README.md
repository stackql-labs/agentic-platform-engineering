# Demo: query before a policy-gated repair

This demo now has a safe, deterministic offline path and an explicit optional OpenAI Responses API path backed by fixture tools. The prior StackQL/MCP cluster path is not an approved mutation implementation and must not be described as a successful agent repair.

## Modes

| Mode | Default | Uses network/API key/cluster | Behavior |
| --- | --- | --- | --- |
| Fixture smoke | Yes | No | Runs the same synthetic state and policy boundary used by both language paths. |
| Live model + fixture tools | Explicit `--live-model` | OpenAI API only | GPT-6-family Responses API proposes; tools read the local fixture and never connect to Kubernetes. |
| Live isolated cluster | Not implemented | Would require approved disposable resources | Release blocker. No isolated cluster adapter, authenticated approval service, or atomic resource-version mutation path has been validated. |

Do not connect the fixture runner to production, expose an MCP/Kubernetes endpoint, use a default cluster context, or use personal API accounts for the promised workshop experience.

## Offline TypeScript path

Windows PowerShell:

```powershell
Set-Location '10-26 Cloud Native AI Summit APAC\demo\agent'
npm ci
npm run smoke
npm test
npm run typecheck
```

The smoke path accepts no options other than `--offline` internally and fails on unknown flags. It does not read `.env`, API keys, Kubernetes configuration, or StackQL configuration.

## Offline Python path

```powershell
Set-Location '11-26 AI Engineer\workshop\scenarios\python'
python -m unittest -v
```

The Python tests use only the standard library. Install `requirements.txt` only to use the separate optional model runner.

## Explicit model calls (fixture tools only)

The verified default model identifier is `gpt-6-astra`. The documented GPT-6 family IDs are configurable as `gpt-6-astra`, `gpt-6.1-sol`, or `gpt-6-luna`; account access is not verified in this checkout. No other model family is accepted and there is no silent fallback. GPT-6 Astra tool calls use the Responses API.

```powershell
$env:OPENAI_API_KEY = '<approved API key>'
$env:OPENAI_MODEL = 'gpt-6-astra'
$env:DEMO_POLICY_MODE = 'read_only'
npm run agent -- --live-model
```

Python:

```powershell
Set-Location '11-26 AI Engineer\workshop\scenarios\python'
python -m pip install -r requirements.txt
$env:OPENAI_API_KEY = '<approved API key>'
python openai_agent.py --live-model
```

These commands make paid API calls. Configure provider spend limits separately; application turn/output caps are not a billing guarantee. Errors, unavailable model access, and exhausted limits must remain visible.

Optional Vercel AI SDK TypeScript adapter:

```powershell
npm run vercel -- --live-model
```

It explicitly uses `createOpenAI().responses(modelId)` and the same local policy dispatcher. It is not a separate safety boundary or curriculum.

## Container smoke

Build using the repository root as context so the shared fixture can be copied:

```powershell
Set-Location ..\..\..
docker build -f '10-26 Cloud Native AI Summit APAC\demo\agent\Dockerfile' -t platform-agent:fixture .
docker run --rm platform-agent:fixture
```

The image default runs only the offline fixture smoke, not the live model or a recurring workload.

## Retained local-kind / StackQL lab (not the fixture agent)

The former stack-based estate remains separate and has not been revalidated against a cluster. Do not run these scripts during offline smoke or against a default/current production context. If a facilitator explicitly approves the disposable local-kind exercise, use `ENABLE_DISPOSABLE_CLUSTER=I_UNDERSTAND`; the mutation/reset scripts also require `CONFIRM_DEMO_MUTATION=YES` and have fixed target names. Start the proxy with `kubectl --context=kind-platform-demo`; the scripts do not switch the user's active context. The stack manifest and provider version should be reviewed before use.

## Approval and audit boundary

The only mutation-shaped capability is a proposal for the single approved image in the `shop/checkout` fixture. The model cannot invoke an executor. `read_only` cannot mutate even with a valid test approval; `safe` requires an exact-plan confirmation and an approver identity. The local CLI identity prompt is self-attested and is teaching-only, not a production authenticated approval interface.

The fixture mutator verifies fresh evidence, exact plan digest, target, approval identity presence, bounded expiry, and a single-use operation, then reads back the result. It emits structured in-memory audit events with a correlation ID; that is not durable audit retention. Fixture state is synthetic and in-memory. It is not evidence of Kubernetes RBAC, atomic resource-version enforcement, or a real live repair.

## Retained StackQL/Kubernetes materials

`stack/`, `scripts/`, and `k8s/` preserve the original local-kind and StackQL example for study. These files are not wired to the new fixture agent. The stack manifest pins its Kubernetes provider; setup avoids pulling an unpinned provider. Mutation scripts now require explicit disposable-cluster confirmation, and the CronJob example is suspended/read-only. Never apply it as evidence of a validated live agent path.

Official references: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [OpenAI models](https://developers.openai.com/api/docs/models), [OpenAI SDK libraries](https://developers.openai.com/api/docs/libraries), [AI SDK OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai), and [AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling).

## Migration from the original demo

The previous `agent.ts` used Vercel AI SDK with Anthropic and exposed a broad StackQL MCP tool surface. It could propose generic SQL mutations; it did not implement deterministic application policy or a successful agent-approved repair. The new `agent.ts` is an OpenAI Responses API fixture runner. The old prompts and manifests are retained only as updated/guarded teaching artifacts. No automatic StackQL MCP compatibility path is enabled.
