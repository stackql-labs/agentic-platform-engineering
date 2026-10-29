#!/usr/bin/env bash
# A burst of requests at the zone, so the last hour of traffic has something in it.
# The rate limit rule keys on ip.src and cf.colo.id: more than the threshold from one
# address through one colo inside a period gets a 429, so against the drifted rule
# (5 per 10 s) a burst of 30 is a few passes and the rest 429s. The analytics data set
# is sampled and shows them within a minute. Run it a few minutes before the agent.
#
#   scripts/traffic.sh [count]      default 30
set -euo pipefail
. "$(dirname "$0")/_env.sh"

count="${1:-30}"
url="https://$CLOUDFLARE_ZONE_NAME/"
if [ -t 1 ]; then green=$'\e[32m' yellow=$'\e[33m' red=$'\e[31m' off=$'\e[0m'; else green='' yellow='' red='' off=''; fi
paint() { case "$1" in 2*) echo "$green$1$off" ;; 429) echo "$red$1$off" ;; *) echo "$yellow$1$off" ;; esac; }

# one curl, one connection, the URL repeated: a burst, not a trickle
args=()
for _ in $(seq 1 "$count"); do args+=(-o /dev/null "$url"); done
echo "+ $count GETs at $url" >&2
codes="$(curl -s -m 30 -w '%{http_code}\n' "${args[@]}" | tr -d '\r' || true)" # mingw curl ends its lines with CR LF

for code in $codes; do printf '%s ' "$(paint "$code")"; done
echo
echo
printf '%s\n' $codes | sort | uniq -c | sort -k2 | while read -r n code; do printf '  %s  %s\n' "$(paint "$code")" "$n"; done
