# Sourced by the other scripts: loads .env from the demo root, applies defaults, and
# resolves the cell named on the command line. Values already in the environment win
# over .env.
#   . "$(dirname "$0")/_env.sh"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# .env, with anything already in the environment kept over it
_names="$(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=.*/\2/p' "$ROOT/.env" 2>/dev/null || true)"
for _n in $_names; do [ -z "${!_n+x}" ] || printf -v "_keep_$_n" '%s' "${!_n}"; done
set -a
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a
for _n in $_names; do _k="_keep_$_n"; [ -z "${!_k+x}" ] || export "$_n=${!_k}"; done
unset _n _k _names

# the stackql-deploy entry point: the one on the PATH unless .env names one
export STACKQL_DEPLOY="${STACKQL_DEPLOY:-stackql-deploy}"
export PYTHONUTF8=1

[ -n "${AWS_ACCESS_KEY_ID:-}" ]     || { echo "AWS_ACCESS_KEY_ID is not set (see .env.example)" >&2; exit 2; }
[ -n "${AWS_SECRET_ACCESS_KEY:-}" ] || { echo "AWS_SECRET_ACCESS_KEY is not set (see .env.example)" >&2; exit 2; }

SERVICE=orders
CELLS="$(for f in "$ROOT"/cells/*.env; do basename "$f" .env; done | tr '\n' ' ')"

# cell <name>: sets CELL, CELL_FILE and the cell's declared values, or exits
cell() {
  CELL="${1:-}"
  CELL_FILE="cells/$CELL.env"
  [ -n "$CELL" ] && [ -f "$ROOT/$CELL_FILE" ] || { echo "usage: $(basename "$0") <cell>   cells: $CELLS" >&2; exit 2; }
  set -a; . "$ROOT/$CELL_FILE"; set +a
}

# Run a statement with the local stackql, echoing it so the room can read it. The
# providers live in the stack's own store (.stackql under the demo root).
sql() {
  echo "+ stackql exec \"$(echo "$1" | tr -s ' \n' ' ')\"" >&2
  # a cell that is not built yet answers 400 for its table; the rows for the others still come back
  stackql exec "$@" 2> >(grep -v '^http response status code: 400' >&2)
}
