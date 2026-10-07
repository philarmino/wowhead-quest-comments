#!/usr/bin/env bash
# Fetch Wowhead comments in batches for one expansion.
# After each run, wait (default 5 minutes), then repeat until remaining is 0,
# or until a run saves nothing and no quests are left unattempted (the same
# failures would be retried forever). A 403 stop still waits and retries.
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

# Prints: remaining saved deferred stoppedOn403 total done
# remaining is -1 when this expansion has no report yet.
run_stats() {
  if [[ ! -f "$REPORT" ]]; then
    echo "-1 0 0 0 0 0"
    return
  fi
  node -e '
    const r = require(process.argv[1]);
    const wanted = String(process.argv[2] || "").toLowerCase();
    const got = String(r.expansion || "").toLowerCase();
    if (!wanted || got !== wanted) {
      process.stdout.write("-1 0 0 0 0 0");
      process.exit(0);
    }
    const remaining = Number(r.remaining ?? -1);
    const saved = Number(r.saved ?? 0);
    const deferred = Number(r.deferred ?? 0);
    const stopped = r.stoppedOn403 ? 1 : 0;
    const total = Number(r.total ?? 0);
    const done = remaining >= 0 && total > 0 ? Math.max(0, total - remaining) : Number(r.cached ?? 0) + saved;
    process.stdout.write(`${remaining} ${saved} ${deferred} ${stopped} ${total} ${done}`);
  ' "$REPORT" "$EXPANSION"
}

# Overall expansion coverage, shown before each sleep.
overall_progress_line() {
  local remaining="$1" total="$2" done="$3"
  if [[ "$remaining" == "-1" || "$total" -le 0 ]]; then
    return
  fi
  node -e '
    const remaining = Number(process.argv[1]);
    const total = Number(process.argv[2]);
    const done = Math.min(total, Math.max(0, Number(process.argv[3])));
    const width = 32;
    const partials = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
    const ratio = total === 0 ? 1 : done / total;
    const scaled = Math.min(1, Math.max(0, ratio)) * width;
    let full = Math.floor(scaled);
    let partialIndex = Math.round((scaled - full) * 8);
    if (partialIndex >= 8) { full += 1; partialIndex = 0; }
    full = Math.min(width, full);
    const partial = full === width ? "" : (partials[partialIndex] || "");
    const empty = width - full - (partial ? 1 : 0);
    const bar = "█".repeat(full) + partial + "░".repeat(Math.max(0, empty));
    const percent = (ratio * 100).toFixed(1).padStart(5);
    process.stdout.write(
      `overall remaining ${String(remaining).padStart(5)}  [${bar}] ${percent}%  ${done}/${total} done`
    );
  ' "$remaining" "$total" "$done"
}

log "loop start expansion=${EXPANSION} max-requests=${MAX_REQUESTS} pause=${PAUSE_SECONDS}s"

while true; do
  log "==== fetch start ===="
  set +e
  "$NPM" run fetch -- --expansion "$EXPANSION" --max-requests "$MAX_REQUESTS" >>"$LOG" 2>&1
  status=$?
  set -e
  read -r remaining saved deferred stopped403 total done <<<"$(run_stats)"
  log "==== fetch end remaining ${remaining} (exit ${status}, saved ${saved}, deferred ${deferred}) ===="

  if [[ "$remaining" == "0" ]]; then
    overall="$(overall_progress_line "$remaining" "$total" "$done")"
    [[ -n "$overall" ]] && log "$overall"
    log "fetch complete for ${EXPANSION}; exiting loop"
    exit 0
  fi

  # Every missing quest was attempted and none were saved. Another pass would
  # request the same failures again (for example permanent HTTP 404s).
  if [[ "$saved" == "0" && "$deferred" == "0" && "$stopped403" != "1" && "$remaining" != "-1" ]]; then
    overall="$(overall_progress_line "$remaining" "$total" "$done")"
    [[ -n "$overall" ]] && log "$overall"
    log "no quests saved and none left unattempted (${remaining} still missing); exiting loop"
    exit 0
  fi

  overall="$(overall_progress_line "$remaining" "$total" "$done")"
  [[ -n "$overall" ]] && log "$overall"
  log "sleeping ${PAUSE_SECONDS}s before next run"
  sleep "$PAUSE_SECONDS"
done
