#!/usr/bin/env bash
# The planted problem: point the checkout image at a tag that does not exist.
# The rolling update brings up a new pod that sits in ImagePullBackOff while the
# old one keeps serving, so the deployment reports 1 desired, 1 ready, 1
# unavailable, with Warning events (Failed, BackOff) on the new pod. That is what
# the agent reads. Undo with scripts/restore.sh or `stackql-deploy build`.
set -euo pipefail
cd "$(dirname "$0")/.."
APPROOT="${STACKQL_APPROOT:-$HOME/.stackql}"
NS="${K8S_NAMESPACE:-shop}"
ADDR="${KUBE_CLUSTER_ADDR:-localhost:8001}"
PROTO="${KUBE_PROTOCOL:-http}"
BAD_IMAGE="${BAD_IMAGE:-hashicorp/http-echo:0.0.0-does-not-exist}"

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
