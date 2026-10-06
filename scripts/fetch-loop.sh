#!/usr/bin/env bash
# Fetch Wowhead comments in batches for one expansion.
# After each run, wait (default 5 minutes), then repeat until remaining is 0.
#
# Usage:
#   scripts/fetch-loop.sh <expansion> [--max-requests N] [--pause-seconds N]
# Examples:
#   nohup scripts/fetch-loop.sh tbc >/dev/null 2>&1 &
#   nohup scripts/fetch-loop.sh dragonflight --max-requests 99 --pause-seconds 300 >/dev/null 2>&1 &
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NPM="${NPM:-/usr/bin/npm}"
MAX_REQUESTS=99
PAUSE_SECONDS=300

usage() {
  cat <<'USAGE' >&2
Usage: scripts/fetch-loop.sh <expansion> [--max-requests N] [--pause-seconds N]

Expansions: classic, tbc, wrath, cata, mop, wod, legion, bfa, shadowlands,
            dragonflight, tww, midnight (and full names)

Stop a running loop with: kill "$(cat data/fetch-<expansion>.pid)"
USAGE
  exit 2
}

if [[ $# -lt 1 || "$1" == "-h" || "$1" == "--help" ]]; then
  usage
fi

EXPANSION="$1"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-requests)
      [[ $# -ge 2 ]] || usage
      MAX_REQUESTS="$2"
      shift 2
      ;;
    --pause-seconds)
      [[ $# -ge 2 ]] || usage
      PAUSE_SECONDS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage
      ;;
  esac
done

if ! [[ "$MAX_REQUESTS" =~ ^[1-9][0-9]*$ ]]; then
  printf '--max-requests must be a positive integer\n' >&2
  exit 2
fi
if ! [[ "$PAUSE_SECONDS" =~ ^[0-9]+$ ]]; then
  printf '--pause-seconds must be a nonnegative integer\n' >&2
  exit 2
fi

# Validate expansion early via the same alias table the fetch script uses.
cd "$ROOT"
node --import tsx -e 'import { expansionId } from "./scripts/area-selection.ts"; expansionId(process.argv[1]); console.log("ok")' "$EXPANSION" >/dev/null

SLUG="$(printf '%s' "$EXPANSION" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
LOG_DIR="$ROOT/data/logs"
LOCK="$ROOT/data/fetch-${SLUG}.lock"
PIDFILE="$ROOT/data/fetch-${SLUG}.pid"
LOG="$LOG_DIR/fetch-${SLUG}.log"
REPORT="$ROOT/data/wowhead-fetch-report.json"

mkdir -p "$LOG_DIR"

exec 9>"$LOCK"
if ! flock -n 9; then
  printf '%s already running for %s (lock held; pid file %s)\n' "$(date -Iseconds)" "$EXPANSION" "$PIDFILE" >&2
  exit 1
fi

echo $$ >"$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

log() { printf '%s %s\n' "$(date -Iseconds)" "$*" >>"$LOG"; }

remaining_after_run() {
  if [[ ! -f "$REPORT" ]]; then
    echo -1
    return
  fi
  node -e '
    const r = require(process.argv[1]);
    const wanted = String(process.argv[2] || "").toLowerCase();
    const got = String(r.expansion || "").toLowerCase();
    if (!wanted || got !== wanted) {
      process.stdout.write("-1");
      process.exit(0);
    }
    process.stdout.write(String(r.remaining ?? -1));
  ' "$REPORT" "$EXPANSION"
}

log "loop start expansion=${EXPANSION} max-requests=${MAX_REQUESTS} pause=${PAUSE_SECONDS}s"

while true; do
  log "==== fetch start ===="
  set +e
  "$NPM" run fetch -- --expansion "$EXPANSION" --max-requests "$MAX_REQUESTS" >>"$LOG" 2>&1
  status=$?
  set -e
  remaining="$(remaining_after_run)"
  log "==== fetch end (exit ${status}, remaining ${remaining}) ===="

  if [[ "$remaining" == "0" ]]; then
    log "fetch complete for ${EXPANSION}; exiting loop"
    exit 0
  fi

  log "sleeping ${PAUSE_SECONDS}s before next run"
  sleep "$PAUSE_SECONDS"
done
