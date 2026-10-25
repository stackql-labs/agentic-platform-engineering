#!/usr/bin/env bash
# Optional local-kind bridge for the retained StackQL estate only. The context is
# explicit; this script never changes the user's current kubeconfig context.
set -euo pipefail
if [[ "${ENABLE_DISPOSABLE_CLUSTER:-}" != "I_UNDERSTAND" ]]; then
  echo "refusing proxy startup: set ENABLE_DISPOSABLE_CLUSTER=I_UNDERSTAND after reviewing the disposable-cluster instructions"
  exit 2
fi
ADDR="localhost:8001"
[[ "${KUBE_CLUSTER_ADDR:-$ADDR}" == "$ADDR" ]] || { echo "refusing non-local proxy address"; exit 2; }
PORT="${ADDR##*:}"
CONTEXT="kind-${KIND_CLUSTER:-platform-demo}"
[[ "$CONTEXT" == "kind-platform-demo" ]] || { echo "refusing unexpected context: $CONTEXT"; exit 2; }
echo "kubectl proxy on http://$ADDR (ctrl-c to stop)"
exec kubectl --context="$CONTEXT" proxy --port="$PORT" --address=127.0.0.1
