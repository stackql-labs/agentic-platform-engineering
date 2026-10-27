#!/usr/bin/env bash
# One-time setup: tools, the disposable kind cluster, agent dependencies.
# Safe to re-run; it creates nothing that already exists.
set -euo pipefail
. "$(dirname "$0")/_env.sh"

for t in stackql kind kubectl node npm curl; do
  command -v "$t" >/dev/null 2>&1 || { echo "missing on PATH: $t" >&2; exit 1; }
done
if ! command -v "$STACKQL_DEPLOY" >/dev/null 2>&1 && [ ! -x "$STACKQL_DEPLOY" ]; then
  echo "stackql-deploy not found (STACKQL_DEPLOY=$STACKQL_DEPLOY): pip install stackql-deploy, or set STACKQL_DEPLOY in .env to the exe" >&2
  exit 1
fi
[ -f .env ] || { echo "no .env: copy .env.example to .env and fill in ANTHROPIC_API_KEY" >&2; exit 1; }

if kind get clusters 2>/dev/null | grep -qx "$KIND_CLUSTER"; then
  echo "kind cluster $KIND_CLUSTER exists"
else
  echo "creating kind cluster $KIND_CLUSTER (pulls the node image on first run)"
  # KIND_NODE_IMAGE pins the node image; a Docker Desktop on cgroup v1 cannot bootstrap
  # kind's newest default image, and kindest/node:v1.33.1 is known to work there
  kind create cluster --name "$KIND_CLUSTER" --wait 180s ${KIND_NODE_IMAGE:+--image "$KIND_NODE_IMAGE"}
fi
"${KUBECTL[@]}" get nodes

echo "installing agent dependencies"
(cd agent && npm install --no-fund --no-audit >/dev/null)

mkdir -p runs recordings
echo
echo "next:"
echo "  scripts/proxy.sh        # second terminal, leave it running"
echo "  scripts/build.sh        # the estate, asserted from stack/stackql_manifest.yml"
echo "  scripts/drift.sh        # the 3am changes"
echo "  cd agent && npm run agent"
