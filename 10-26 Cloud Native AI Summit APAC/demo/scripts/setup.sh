#!/usr/bin/env bash
# Explicit setup for the original local-kind/StackQL estate and local dependencies.
# It is not required for offline smoke or the fixture agent.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${ENABLE_DISPOSABLE_CLUSTER:-}" != "I_UNDERSTAND" ]]; then
  echo "refusing cluster setup: set ENABLE_DISPOSABLE_CLUSTER=I_UNDERSTAND after reviewing the disposable-cluster instructions"
  exit 2
fi
KIND_CLUSTER="${KIND_CLUSTER:-platform-demo}"
if [[ "$KIND_CLUSTER" != "platform-demo" ]]; then
  echo "refusing unexpected cluster name: $KIND_CLUSTER"
  exit 2
fi
for t in stackql stackql-deploy kind kubectl node npm; do
  command -v "$t" >/dev/null 2>&1 || { echo "missing: $t"; exit 1; }
done

if ! kind get clusters 2>/dev/null | grep -qx "$KIND_CLUSTER"; then
  echo "creating kind cluster $KIND_CLUSTER"
  kind create cluster --name "$KIND_CLUSTER"
else
  echo "kind cluster $KIND_CLUSTER exists"
fi
echo "the stack manifest pins k8s::v26.08.00453; stackql-deploy resolves it during the first build"

echo "installing agent dependencies"
(cd agent && npm ci --no-fund --no-audit >/dev/null)

mkdir -p runs
echo
echo "next:"
echo "  scripts/proxy.sh                                   # second terminal, leave it running"
echo "  stackql-deploy build stack demo --env-file .env --show-queries"
echo "  cd agent && npm run smoke                           # fixture-only; no model or cluster"
