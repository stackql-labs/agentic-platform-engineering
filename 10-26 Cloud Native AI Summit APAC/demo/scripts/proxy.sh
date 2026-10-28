#!/usr/bin/env bash
# kubectl proxy in the foreground, on the port the k8s provider expects. Run it in its
# own terminal and leave it there for the whole talk: every k8s statement, from the
# shell, from stackql-deploy and from the agent, goes through it. The context is
# explicit; this never changes the current kubeconfig context.
set -euo pipefail
. "$(dirname "$0")/_env.sh"

PORT="${KUBE_CLUSTER_ADDR##*:}"
if proxy_up; then
  echo "something is already listening on http://$KUBE_CLUSTER_ADDR" >&2
  exit 1
fi
echo "+ kubectl --context=$CTX proxy --port=$PORT --address=127.0.0.1  (ctrl-c to stop)" >&2
exec "${KUBECTL[@]}" proxy --port="$PORT" --address=127.0.0.1
