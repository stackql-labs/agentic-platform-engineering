#!/usr/bin/env bash
# Converge the estate back to the manifest. The checkout statecheck compares the
# image, so a build after scripts/perturb.sh runs the update anchor and restores
# it. This is the idempotent-assertion beat: no state file, the manifest is
# asserted against the live API.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ $# -eq 0 ]] || { echo "this fixed demo restore accepts no arguments"; exit 2; }
if [[ "${ENABLE_DISPOSABLE_CLUSTER:-}" != "I_UNDERSTAND" ]]; then
  echo "refusing stack convergence: set ENABLE_DISPOSABLE_CLUSTER=I_UNDERSTAND only for the dedicated disposable cluster"
  exit 2
fi
[[ "${CONFIRM_DEMO_MUTATION:-}" == "YES" ]] || { echo "set CONFIRM_DEMO_MUTATION=YES to continue"; exit 2; }
[[ -f .env ]] || { echo "missing .env; create it from .env.example and review the fixed local target"; exit 2; }
for key in KUBE_CLUSTER_ADDR KUBE_PROTOCOL K8S_NAMESPACE; do
  count="$(grep -c "^${key}=" .env || true)"
  [[ "$count" == "1" ]] || { echo "refusing .env: expected one $key entry"; exit 2; }
done
grep -qx 'KUBE_CLUSTER_ADDR=localhost:8001' .env || { echo "refusing non-local cluster address"; exit 2; }
grep -qx 'KUBE_PROTOCOL=http' .env || { echo "refusing unexpected protocol"; exit 2; }
grep -qx 'K8S_NAMESPACE=shop' .env || { echo "refusing unexpected namespace"; exit 2; }
kubectl --context=kind-platform-demo -n shop get deployment checkout -l purpose=agentic-demo >/dev/null
KUBE_CLUSTER_ADDR=localhost:8001 KUBE_PROTOCOL=http K8S_NAMESPACE=shop \
  exec stackql-deploy build stack demo --env-file .env --show-queries
