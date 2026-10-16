#!/usr/bin/env bash
# One-time setup: tools, kind cluster, the k8s provider, the agent's dependencies.
# Run from the demo directory with .env sourced (set -a; source .env; set +a).
set -euo pipefail
cd "$(dirname "$0")/.."

KIND_CLUSTER="${KIND_CLUSTER:-platform-demo}"
APPROOT="${STACKQL_APPROOT:-$HOME/.stackql}"

for t in stackql stackql-deploy kind kubectl node npm; do
  command -v "$t" >/dev/null 2>&1 || { echo "missing: $t"; exit 1; }
done

if ! kind get clusters 2>/dev/null | grep -qx "$KIND_CLUSTER"; then
  echo "creating kind cluster $KIND_CLUSTER"
  kind create cluster --name "$KIND_CLUSTER"
else
  echo "kind cluster $KIND_CLUSTER exists"
fi
kubectl config use-context "kind-$KIND_CLUSTER" >/dev/null

echo "pulling the k8s provider into $APPROOT"
stackql exec --approot "$APPROOT" "REGISTRY PULL k8s" >/dev/null
stackql exec --approot "$APPROOT" "SHOW PROVIDERS" | grep -i k8s

echo "installing agent dependencies"
(cd agent && npm install --no-fund --no-audit >/dev/null)

mkdir -p runs
echo
echo "next:"
echo "  scripts/proxy.sh                                   # second terminal, leave it running"
echo "  stackql-deploy build stack demo --env-file .env --show-queries"
echo "  cd agent && npm run agent"
