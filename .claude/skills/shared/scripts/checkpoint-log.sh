#!/usr/bin/env bash
set -euo pipefail

# checkpoint-log.sh — append a single JSON line to .aic/skill-log.jsonl.
# Lets a skill record "I finished phase X and produced artifact Y" in a
# machine-readable log. The agent can re-read the log to recover state after
# a pause, and operators can measure which skills actually complete.
#
# Usage: checkpoint-log.sh <skill> <phase> <artifact> [status]
#   skill    — skill name, e.g. aic-task-planner
#   phase    — phase name, e.g. A.2 or phase-3-investigate
#   artifact — path or short description of what was produced
#   status   — optional (default: complete). Allowed: complete, blocked, skipped.
# Exit codes:
#   0 = logged
#   2 = usage error
#   3 = rejected (phase-gate discipline: rapid succession between gates that
#       are supposed to do real work; set CHECKPOINT_ALLOW_RAPID=1 to bypass)

if [[ $# -lt 3 || $# -gt 4 ]]; then
  echo "Usage: $0 <skill> <phase> <artifact> [status]" >&2
  exit 2
fi

SKILL="$1"
PHASE="$2"
ARTIFACT="$3"
STATUS="${4:-complete}"

mkdir -p .aic
TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
LOG=.aic/skill-log.jsonl

parse_iso_utc() {
  local ts="$1"
  local clean="${ts%.*}Z"
  local out=""
  out=$(date -u -d "$clean" +%s 2>/dev/null) || true
  if [[ -n "$out" ]]; then
    printf '%s\n' "$out"
    return 0
  fi
  out=$(date -u -jf "%Y-%m-%dT%H:%M:%SZ" "$clean" +%s 2>/dev/null) || true
  if [[ -n "$out" ]]; then
    printf '%s\n' "$out"
    return 0
  fi
  return 1
}

enforce_minimum_gap() {
  local skill="$1"
  local from_phase="$2"
  local to_phase="$3"
  local min_seconds="$4"

  [[ "$SKILL" == "$skill" && "$PHASE" == "$to_phase" ]] || return 0
  [[ -f "$LOG" ]] || return 0

  local matches=""
  matches=$(grep -F "\"skill\":\"${skill}\"" "$LOG" 2>/dev/null) || matches=""
  [[ -n "$matches" ]] || return 0

  local last_line=""
  last_line=$(printf '%s\n' "$matches" | grep -F "\"phase\":\"${from_phase}\"" | tail -1) || last_line=""
  [[ -n "$last_line" ]] || return 0

  local last_ts=""
  last_ts=$(printf '%s' "$last_line" | sed -n 's/.*"ts":"\([^"]*\)".*/\1/p')
  [[ -n "$last_ts" ]] || return 0

  local last_epoch=""
  last_epoch=$(parse_iso_utc "$last_ts") || last_epoch=""
  [[ -n "$last_epoch" ]] || return 0

  local now_epoch
  now_epoch=$(date -u +%s)
  local delta=$((now_epoch - last_epoch))

  if [[ "$delta" -lt "$min_seconds" ]]; then
    if [[ "${CHECKPOINT_ALLOW_RAPID:-}" == "1" ]]; then
      echo "checkpoint-log: WARNING ${skill} ${from_phase} → ${to_phase} gap ${delta}s < ${min_seconds}s (bypass via CHECKPOINT_ALLOW_RAPID=1)" >&2
      return 0
    fi
    cat >&2 <<EOF
checkpoint-log: rejecting ${skill} ${to_phase} — only ${delta}s since last ${from_phase} (minimum ${min_seconds}s).
checkpoint-log: phase gates require real wall-clock work. Batching all checkpoints at run end defeats the independent-verification subagents that are supposed to run between gates.
checkpoint-log: if this is a test or replay run, set CHECKPOINT_ALLOW_RAPID=1 to bypass.
EOF
    exit 3
  fi
}

enforce_minimum_gap "aic-task-planner" "exploration-complete" "task-finalized" 5
enforce_minimum_gap "aic-task-planner" "task-picked" "exploration-complete" 5
enforce_minimum_gap "aic-task-planner" "setup-complete" "task-picked" 1

ART=$(printf '%s' "$ARTIFACT" | sed 's/\\/\\\\/g; s/"/\\"/g')

printf '{"ts":"%s","skill":"%s","phase":"%s","artifact":"%s","status":"%s"}\n' \
  "$TS" "$SKILL" "$PHASE" "$ART" "$STATUS" >> "$LOG"

echo "logged: ${SKILL} ${PHASE} ${STATUS}"
exit 0
