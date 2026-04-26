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

# Gates run in parallel (all independent readers; none share state except the
# trailing JSONL write, which happens serially after wait). Ordered stdout is
# preserved by capturing per-gate output to tempfiles and emitting them in the
# declared order after every job has completed.

TMPDIR_GATE="$(mktemp -d -t planner-gate.XXXXXX)"
trap 'rm -rf "$TMPDIR_GATE"' EXIT

GATES=(
  "ambiguity-scan:$SCRIPT_DIR/ambiguity-scan.sh"
  "validate-task:$SCRIPT_DIR/validate-task.sh"
  "deferral-probe:$SCRIPT_DIR/deferral-probe.sh"
  "architectural-invariants:$SCRIPT_DIR/architectural-invariants.sh"
)

if [[ -x "$SCRIPT_DIR/followup-propagation-check.sh" ]]; then
  GATES+=("followup-propagation:$SCRIPT_DIR/followup-propagation-check.sh")
fi

PIDS=()
NAMES=()
for spec in "${GATES[@]}"; do
  name="${spec%%:*}"
  script="${spec#*:}"
  out="$TMPDIR_GATE/$name.out"
  rcf="$TMPDIR_GATE/$name.rc"
  (
    set +e
    bash "$script" "$TARGET" >"$out" 2>&1
    echo $? >"$rcf"
  ) &
  PIDS+=("$!")
  NAMES+=("$name")
done

for pid in "${PIDS[@]}"; do
  wait "$pid" || true
done

FAILED=""
GATE_RESULTS=""
for name in "${NAMES[@]}"; do
  out="$TMPDIR_GATE/$name.out"
  rcf="$TMPDIR_GATE/$name.rc"
  rc=1
  if [[ -f "$rcf" ]]; then
    rc=$(cat "$rcf")
  fi
  status="ok"
  if [[ "$rc" -ne 0 ]]; then
    status="fail"
    echo "--- planner-gate: $name FAILED (exit $rc) ---"
    [[ -f "$out" ]] && cat "$out"
    echo "--- end $name ---"
    FAILED="${FAILED}${name} "
  else
    echo "planner-gate: $name ok"
  fi
  NAME_ESC=$(printf '%s' "$name" | sed 's/\\/\\\\/g; s/"/\\"/g')
  ENTRY="{\"name\":\"${NAME_ESC}\",\"status\":\"${status}\",\"exitCode\":${rc}}"
  if [[ -z "$GATE_RESULTS" ]]; then
    GATE_RESULTS="$ENTRY"
  else
    GATE_RESULTS="${GATE_RESULTS},${ENTRY}"
  fi
done

ART=$(printf '%s' "$ABS_TARGET" | sed 's/\\/\\\\/g; s/"/\\"/g')

if [[ -n "$FAILED" ]]; then
  FAIL_ESC=$(printf '%s' "${FAILED% }" | sed 's/"/\\"/g')
  printf '{"ts":"%s","gate":"planner-gate","target":"%s","status":"fail","failed":"%s","gates":[%s]}\n' \
    "$TS" "$ART" "$FAIL_ESC" "$GATE_RESULTS" >> "$LOG"
  echo ""
  echo "planner-gate: FAILED gates: ${FAILED% }"
  echo "planner-gate: fix the task and re-run. checkpoint-log.sh will reject task-finalized without a fresh success record."
  exit 1
fi

printf '{"ts":"%s","gate":"planner-gate","target":"%s","status":"ok","gates":[%s]}\n' \
  "$TS" "$ART" "$GATE_RESULTS" >> "$LOG"

echo ""
echo "planner-gate: all gates passed — success recorded in $LOG"
exit 0
