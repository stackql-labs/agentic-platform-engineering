# AI Engineer demo: a release is more than a signature

This event has a separate demo from the Cloud Native AI Summit talk. It uses a synthetic release candidate to show artifact provenance checks, deterministic promotion policy, exact-plan approval, a bounded simulated rollout, and fresh verification.

## Fixture replay

Requirements: Node.js 20 or newer. There are no package dependencies, API calls, credentials, network requests, cloud resources, or Kubernetes access.

```powershell
Set-Location '11-26 AI Engineer\demo'
npm test
npm run demo
```

The replay labels its output `FIXTURE REPLAY`. It prints a candidate evidence summary, demonstrates terminal denial of an over-broad rollout, then proposes and approves the one policy-bounded preview promotion. All changes are in memory and disappear when the process exits.

## Safety and limits

- The checked-in JSON is synthetic. Its signature and test status are fixture booleans, not cryptographic verification.
- The local approval token is a deterministic teaching value, not authentication or a production approval service.
- A valid provenance record and passing checks do not prove that an artifact is semantically correct or safe. That residual risk is the point of the demo.
- The scaffold has no model-driven planner or live deployment adapter. If one is added, keep model output untrusted and route every proposal through the deterministic policy boundary in `src/policy.js`.

## Four-minute demo beats

1. Identify the candidate digest and synthetic provenance evidence; note the release note is untrusted data.
2. Show the release policy and the exact preview target/traffic bound.
3. Try a 100% rollout; the policy denies it and stops that proposal.
4. Start a separate exact 10% proposal with fresh evidence.
5. Show the plan-bound local approval, simulated promotion, and verification.
6. Close with the limit: a correctly signed, policy-compliant artifact can still be wrong.

Do not describe this fixture replay as a live model run, a real signature check, or a deployment.
