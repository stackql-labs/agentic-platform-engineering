#!/usr/bin/env bash
# The planted problem: point the checkout image at a tag that does not exist.
# The rolling update brings up a new pod that sits in ImagePullBackOff while the
# old one keeps serving, so the deployment reports 1 desired, 1 ready, 1
# unavailable, with Warning events (Failed, BackOff) on the new pod. That is what
# the agent reads. Undo with scripts/restore.sh or `stackql-deploy build`.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ $# -eq 0 ]] || { echo "this fixed demo mutation accepts no arguments"; exit 2; }
if [[ "${ENABLE_DISPOSABLE_CLUSTER:-}" != "I_UNDERSTAND" ]]; then
  echo "refusing mutation: set ENABLE_DISPOSABLE_CLUSTER=I_UNDERSTAND only for the dedicated disposable cluster"
  exit 2
fi
APPROOT="${STACKQL_APPROOT:-$PWD/.stackql}"
NS="shop"
ADDR="localhost:8001"
PROTO="http"
BAD_IMAGE="registry.example.invalid/workshop/checkout:broken"
echo "Target is fixed to kind-platform-demo via the local proxy, namespace shop, deployment checkout."
echo "This is a destructive demo mutation. Confirm only after the disposable lab is ready."
[[ "${CONFIRM_DEMO_MUTATION:-}" == "YES" ]] || { echo "set CONFIRM_DEMO_MUTATION=YES to continue"; exit 2; }
kubectl --context=kind-platform-demo -n shop get deployment checkout -l purpose=agentic-demo >/dev/null

SQL="UPDATE k8s.apps.deployments
SET spec = '{\"template\": {\"spec\": {\"containers\": [{\"name\": \"checkout\", \"image\": \"$BAD_IMAGE\"}]}}}'
WHERE name = 'checkout'
  AND namespace = '$NS'
  AND cluster_addr = '$ADDR'
  AND protocol = '$PROTO';"

echo "$SQL"
echo
stackql exec --approot "$APPROOT" "$SQL"
echo
echo "watch it land:  kubectl -n $NS get pods -w"
