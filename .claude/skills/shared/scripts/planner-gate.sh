#!/usr/bin/env bash
set -euo pipefail

# planner-gate.sh — single entry point that runs all mandatory planner
# mechanical gates against a task file and records pass/fail to
# .aic/gate-log.jsonl. This is the enforcement mechanism for HARD RULE 22
# (deferred-field bookkeeping) and §C.5 of SKILL-phase-3-write.md: if a
# planner emits `task-finalized` without a recent successful record from
# this script, checkpoint-log.sh rejects the checkpoint.
#
# Usage: planner-gate.sh <task-file>
# Exit codes:
#   0 = all gates passed, success record appended to .aic/gate-log.jsonl
#   1 = one or more gates failed; failure record appended; stdout shows which
#   2 = usage error

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <task-file>" >&2
  exit 2
fi

TARGET="$1"

if [[ ! -f "$TARGET" ]]; then
  echo "planner-gate: target not found: $TARGET" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG=.aic/gate-log.jsonl
mkdir -p .aic
TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

ABS_TARGET="$(cd "$(dirname "$TARGET")" && pwd)/$(basename "$TARGET")"

run_gate() {
  local name="$1"; shift
  local out rc
  set +e
  out="$("$@" 2>&1)"
  rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    echo "--- planner-gate: $name FAILED (exit $rc) ---"
    echo "$out"
    echo "--- end $name ---"
    return 1
  fi
  echo "planner-gate: $name ok"
  return 0
}

FAILED=""

run_gate "ambiguity-scan" bash "$SCRIPT_DIR/ambiguity-scan.sh" "$TARGET" || FAILED="${FAILED}ambiguity-scan "
run_gate "validate-task"  bash "$SCRIPT_DIR/validate-task.sh"  "$TARGET" || FAILED="${FAILED}validate-task "
run_gate "deferral-probe" bash "$SCRIPT_DIR/deferral-probe.sh" "$TARGET" || FAILED="${FAILED}deferral-probe "

if [[ -x "$SCRIPT_DIR/followup-propagation-check.sh" ]]; then
  run_gate "followup-propagation" bash "$SCRIPT_DIR/followup-propagation-check.sh" "$TARGET" || FAILED="${FAILED}followup-propagation "
fi

ART=$(printf '%s' "$ABS_TARGET" | sed 's/\\/\\\\/g; s/"/\\"/g')

if [[ -n "$FAILED" ]]; then
  FAIL_ESC=$(printf '%s' "${FAILED% }" | sed 's/"/\\"/g')
  printf '{"ts":"%s","gate":"planner-gate","target":"%s","status":"fail","failed":"%s"}\n' \
    "$TS" "$ART" "$FAIL_ESC" >> "$LOG"
  echo ""
  echo "planner-gate: FAILED gates: ${FAILED% }"
  echo "planner-gate: fix the task and re-run. checkpoint-log.sh will reject task-finalized without a fresh success record."
  exit 1
fi

printf '{"ts":"%s","gate":"planner-gate","target":"%s","status":"ok"}\n' \
  "$TS" "$ART" >> "$LOG"

echo ""
echo "planner-gate: all gates passed — success recorded in $LOG"
exit 0
