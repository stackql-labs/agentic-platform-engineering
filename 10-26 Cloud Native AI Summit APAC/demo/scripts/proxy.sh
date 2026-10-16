#!/usr/bin/env bash
# kubectl proxy in front of the kind API server. The k8s provider talks to this
# address (KUBE_CLUSTER_ADDR, default localhost:8001) over plain http; the proxy
# authenticates with the current kubeconfig context. Leave it running in its own
# terminal for the whole demo.
set -euo pipefail
ADDR="${KUBE_CLUSTER_ADDR:-localhost:8001}"
PORT="${ADDR##*:}"
kubectl config use-context "kind-${KIND_CLUSTER:-platform-demo}" >/dev/null
echo "kubectl proxy on http://$ADDR (ctrl-c to stop)"
exec kubectl proxy --port="$PORT" --address=127.0.0.1
