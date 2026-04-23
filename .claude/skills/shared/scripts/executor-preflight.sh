#!/usr/bin/env bash
set -euo pipefail

# executor-preflight.sh — single entry point that runs all mandatory executor
# pre-flight mechanical gates against a task file and records pass/fail to
# .aic/gate-log.jsonl. This is defense in depth — the planner is supposed to
# have run equivalent gates, but the executor independently re-runs them so a
# planner skip cannot silently ship. checkpoint-log.sh rejects the executor's
# `setup-complete` checkpoint if no recent success record for this target is
# present.
#
# Usage: executor-preflight.sh <task-file>
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
  echo "executor-preflight: target not found: $TARGET" >&2
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

TMPDIR_GATE="$(mktemp -d -t executor-preflight.XXXXXX)"
trap 'rm -rf "$TMPDIR_GATE"' EXIT

GATES=(
  "ambiguity-scan:$SCRIPT_DIR/ambiguity-scan.sh"
  "deferral-probe:$SCRIPT_DIR/deferral-probe.sh"
  "architectural-invariants:$SCRIPT_DIR/architectural-invariants.sh"
)

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
for name in "${NAMES[@]}"; do
  out="$TMPDIR_GATE/$name.out"
  rcf="$TMPDIR_GATE/$name.rc"
  rc=1
  if [[ -f "$rcf" ]]; then
    rc=$(cat "$rcf")
  fi
  if [[ "$rc" -ne 0 ]]; then
    echo "--- executor-preflight: $name FAILED (exit $rc) ---"
    [[ -f "$out" ]] && cat "$out"
    echo "--- end $name ---"
    FAILED="${FAILED}${name} "
  else
    echo "executor-preflight: $name ok"
  fi
done

ART=$(printf '%s' "$ABS_TARGET" | sed 's/\\/\\\\/g; s/"/\\"/g')

if [[ -n "$FAILED" ]]; then
  FAIL_ESC=$(printf '%s' "${FAILED% }" | sed 's/"/\\"/g')
  printf '{"ts":"%s","gate":"executor-preflight","target":"%s","status":"fail","failed":"%s"}\n' \
    "$TS" "$ART" "$FAIL_ESC" >> "$LOG"
  echo ""
  echo "executor-preflight: FAILED gates: ${FAILED% }"
  echo "executor-preflight: the task is unshippable as written. STOP. Report the failing gates to the planner's follow-up items, do not patch in the executor."
  exit 1
fi

printf '{"ts":"%s","gate":"executor-preflight","target":"%s","status":"ok"}\n' \
  "$TS" "$ART" >> "$LOG"

echo ""
echo "executor-preflight: all gates passed — success recorded in $LOG"
exit 0
