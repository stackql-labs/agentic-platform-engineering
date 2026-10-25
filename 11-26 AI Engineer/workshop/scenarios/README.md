# Shared scenario contract

`fixture.json` is synthetic, offline-only teaching data. It defines an unhealthy `shop/checkout` workload, the approved desired image, a resource-version marker, and execution bounds. It is not a real registry, cluster, or successful live run.

`policy-cases.json` is the language-neutral core contract. The TypeScript and Python implementations must reject unknown tools, additional properties, out-of-scope targets, arbitrary values, stale evidence, invalid approval, and read-only mutation attempts before dispatch. The repair operation changes only the approved image for the one named fixture target. Approval binds the canonical plan, target, expected resource version, operator identity, and expiry.

The fixture adapters demonstrate the trusted policy/execution boundary. They do not connect to Kubernetes. A production adapter must re-read state immediately before execution and use an atomic resource-version precondition where supported. If the backing API cannot make the precondition atomic, document the residual time-of-check/time-of-use race. No such live adapter is validated here.

`tracks.json` supplies bounded FinOps, CSPM, and access-review sample records. `demo/agent/src/tracks.ts` and `python/tracks.py` implement each track with the same pattern as the SRE exercise: a fixed target, an approved desired value, fresh evidence, an exact plan, plan-bound approval, one fixture change, and verification. These are functional fixture exercises, not cloud integrations.
