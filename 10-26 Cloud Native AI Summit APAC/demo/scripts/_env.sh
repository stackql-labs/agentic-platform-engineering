# Sourced by the other scripts: loads .env from the demo root, applies defaults, and
# pins every kubectl call to the disposable kind cluster. Values already in the
# environment win over .env.
#   . "$(dirname "$0")/_env.sh"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

set -a
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a

export KIND_CLUSTER="${KIND_CLUSTER:-platform-demo}"
export KUBE_CLUSTER_ADDR="${KUBE_CLUSTER_ADDR:-localhost:8001}"
export KUBE_PROTOCOL="${KUBE_PROTOCOL:-http}"
export K8S_NAMESPACE="${K8S_NAMESPACE:-shop}"
export STACKQL_APPROOT="${STACKQL_APPROOT:-$HOME/.stackql}"
# stackql-deploy is a pip entry point; on Windows it is often not on the Git Bash PATH
export STACKQL_DEPLOY="${STACKQL_DEPLOY:-stackql-deploy}"
# stackql-deploy draws its progress boxes with characters the default Windows console
# code page cannot encode
export PYTHONUTF8=1

CTX="kind-$KIND_CLUSTER"
KUBECTL=(kubectl --context="$CTX")

# only ever the disposable kind cluster: refuse anything else, never touch the current context
case "$KIND_CLUSTER" in
  platform-demo|stackql-test) ;;
  *) echo "refusing KIND_CLUSTER=$KIND_CLUSTER: this demo only runs against a local kind cluster" >&2; exit 2 ;;
esac
case "$KUBE_CLUSTER_ADDR" in
  localhost:*|127.0.0.1:*) ;;
  *) echo "refusing KUBE_CLUSTER_ADDR=$KUBE_CLUSTER_ADDR: the k8s provider must reach the cluster through a local kubectl proxy" >&2; exit 2 ;;
esac

# Is the kubectl proxy answering? (the k8s provider talks to the API server through it)
proxy_up() { curl -s -m 2 "http://${KUBE_CLUSTER_ADDR}/version" >/dev/null 2>&1; }

# Run a statement with the local stackql, echoing it so the room can read it.
sql() {
  echo "+ stackql exec $*" >&2
  stackql exec --approot "$STACKQL_APPROOT" "$@"
}
