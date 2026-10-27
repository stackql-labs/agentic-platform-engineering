#!/usr/bin/env bash
# Delete the disposable kind cluster. Nothing else on the machine is touched.
set -euo pipefail
. "$(dirname "$0")/_env.sh"
echo "+ kind delete cluster --name $KIND_CLUSTER" >&2
kind delete cluster --name "$KIND_CLUSTER"
