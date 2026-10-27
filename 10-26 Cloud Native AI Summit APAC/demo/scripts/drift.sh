#!/usr/bin/env bash
# The 3am changes: what a well-meaning human did with kubectl during an incident,
# outside the declaration. Both are drift. One of them is also an outage.
#
#   scripts/drift.sh hotfix   checkout -> hashicorp/http-echo:1.0.1-hotfix, a tag that does
#                             not exist. The rollout brings up a new pod that sits in
#                             ImagePullBackOff while the old one keeps serving: 1 desired,
#                             1 ready, 1 unavailable, Warning events on the new pod.
#   scripts/drift.sh scale    web 2 -> 4 replicas. Fully ready, not what is declared.
#   scripts/drift.sh all      both (default)
#
# Deliberately kubectl, not StackQL: the point is that the change did not go through
# the pipeline. Undo with scripts/build.sh (the declaration wins).
set -euo pipefail
. "$(dirname "$0")/_env.sh"

K=("${KUBECTL[@]}" -n "$K8S_NAMESPACE")
# only resources the stack labelled, only on the disposable cluster
for d in web checkout; do
  label="$("${K[@]}" get deployment "$d" -o jsonpath='{.metadata.labels.purpose}')"
  [ "$label" = "agentic-demo" ] || { echo "refusing: deployment $d in $K8S_NAMESPACE is not labelled purpose=agentic-demo" >&2; exit 2; }
done

hotfix() {
  echo "+ kubectl --context=$CTX -n $K8S_NAMESPACE set image deployment/checkout checkout=hashicorp/http-echo:1.0.1-hotfix" >&2
  "${K[@]}" set image deployment/checkout checkout=hashicorp/http-echo:1.0.1-hotfix
}
scale() {
  echo "+ kubectl --context=$CTX -n $K8S_NAMESPACE scale deployment/web --replicas=4" >&2
  "${K[@]}" scale deployment/web --replicas=4
}

case "${1:-all}" in
  hotfix) hotfix ;;
  scale) scale ;;
  all) hotfix; scale ;;
  *) echo "usage: $0 [hotfix|scale|all]" >&2; exit 2 ;;
esac

echo >&2
echo "give it 20 s, then look:  kubectl --context=$CTX -n $K8S_NAMESPACE get deploy,pods" >&2
echo "or the human view in SQL: stackql shell --approot \"$STACKQL_APPROOT\"  (paste scripts/shell.iql)" >&2
