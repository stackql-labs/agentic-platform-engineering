# Sourced by the other scripts: loads .env from the demo root, applies defaults, and
# refuses to run without a zone. Values already in the environment win over .env.
#   . "$(dirname "$0")/_env.sh"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# .env, with anything already in the environment kept over it (an empty line in .env
# would otherwise blank an exported value)
_names="$(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2/p' "$ROOT/.env" 2>/dev/null || true)"
for _n in $_names; do [ -z "${!_n+x}" ] || printf -v "_keep_$_n" '%s' "${!_n}"; done
set -a
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a
for _n in $_names; do _k="_keep_$_n"; [ -z "${!_k+x}" ] || export "$_n=${!_k}"; done
unset _n _k _names

# stackql's own approot (~/.stackql) unless .env names one; only then is --approot passed
APPROOT_ARGS=()
if [ -n "${STACKQL_APPROOT:-}" ]; then APPROOT_ARGS=(--approot "$STACKQL_APPROOT"); fi
STACKQL_SHELL="stackql shell${STACKQL_APPROOT:+ --approot \"$STACKQL_APPROOT\"}"
# stackql-deploy is a pip entry point: the one on the Git Bash PATH, unless .env names one
export STACKQL_DEPLOY="${STACKQL_DEPLOY:-stackql-deploy}"
# stackql-deploy draws its progress boxes with characters the default Windows console
# code page cannot encode
export PYTHONUTF8=1

# the blast radius is the token's: scoped to one zone. The scripts still refuse to run
# without saying which zone that is, so the room can see it.
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || { echo "CLOUDFLARE_API_TOKEN is not set (see .env.example)" >&2; exit 2; }
[ -n "${CLOUDFLARE_ZONE_ID:-}" ]   || { echo "CLOUDFLARE_ZONE_ID is not set (see .env.example)" >&2; exit 2; }
[ -n "${CLOUDFLARE_ZONE_NAME:-}" ] || { echo "CLOUDFLARE_ZONE_NAME is not set: name the zone you are about to change" >&2; exit 2; }
if [ -z "${_ZONE_SHOWN:-}" ]; then echo "zone: $CLOUDFLARE_ZONE_NAME ($CLOUDFLARE_ZONE_ID)" >&2; export _ZONE_SHOWN=1; fi

# Run a statement with the local stackql, echoing it so the room can read it.
sql() {
  echo "+ stackql exec $*" >&2
  stackql exec ${APPROOT_ARGS[@]+"${APPROOT_ARGS[@]}"} "$@"
}
