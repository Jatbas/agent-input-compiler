#!/usr/bin/env bash
set -euo pipefail

# followup-propagation-check.sh — cross-task obligation verifier.
#
# Context: when task M (e.g. task 322) defers a field to a successor task N
# (e.g. task 330), the planner is required by HARD RULE 22 to register the
# obligation under `## Follow-up Items` in M with the name of N. This check
# runs against task N (the task being validated or executed) and asserts
# that every field M declared as N's responsibility is actually addressed
# somewhere in N — in the Files table, Goal, Architecture Notes, Steps, or
# Tests section. If an obligation is advertised against N but N never
# mentions the field, N is shipping a drift against M's follow-up promise
# and must either cover the field or emit an explicit successor entry.
#
# This closes the 322→330 drift where task 330 ("classifier-scores") shipped
# without touching `quality_snapshots.classifier_confidence` even though
# task 322 declared its `classifierConfidence` to be populated "in a later
# task" — the later task arrived and passed without addressing the named
# field.
#
# Usage: followup-propagation-check.sh <task-file>
# Exit codes:
#   0 = clean (no advertised obligations, or all obligations covered)
#   1 = obligations advertised against this task are not covered
#   2 = usage/parse error
#
# Format it expects in other tasks' `## Follow-up Items` bullets:
#   - [pending] `fieldName` → task NNN — short reason
#   - [pending] `field_name` → task NNN: reason
#   - [pending] `field_name` → pending/NNN-slug.md — reason
#   - [pending] `field_name` → documentation/tasks/NNN-slug.md — reason
# Accepts `[open]` / `[todo]` / `[pending]` / no bracket-prefix variants.

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <task-file>" >&2
  exit 2
fi

TARGET="$1"

if [[ ! -f "$TARGET" ]]; then
  echo "followup-propagation-check: target not found: $TARGET" >&2
  exit 2
fi

BASENAME="$(basename "$TARGET")"
TASK_ID="${BASENAME%%-*}"
if ! [[ "$TASK_ID" =~ ^[0-9]{3,4}$ ]]; then
  echo "followup-propagation-check: could not extract task id from filename '$BASENAME' (expected NNN-* or NNNN-*)" >&2
  echo "followup-propagation-check: skipping — no task id means no obligations can target this file"
  exit 0
fi

TARGET_ABS="$(cd "$(dirname "$TARGET")" && pwd)/$BASENAME"

SEARCH_DIRS=()
for d in documentation/tasks documentation/tasks/done documentation/tasks/pending; do
  if [[ -d "$d" ]]; then
    SEARCH_DIRS+=("$d")
  fi
done

if [[ ${#SEARCH_DIRS[@]} -eq 0 ]]; then
  exit 0
fi

CANDIDATES=()
while IFS= read -r -d '' f; do
  [[ -f "$f" ]] || continue
  abs="$(cd "$(dirname "$f")" && pwd)/$(basename "$f")"
  [[ "$abs" != "$TARGET_ABS" ]] || continue
  if grep -lE "(task[[:space:]]+${TASK_ID}\b|[Tt]ask[[:space:]]+${TASK_ID}\b|/${TASK_ID}-|pending/${TASK_ID}-|done/${TASK_ID}-|documentation/tasks/${TASK_ID}-)" "$f" >/dev/null 2>&1; then
    CANDIDATES+=("$f")
  fi
done < <(find "${SEARCH_DIRS[@]}" -maxdepth 1 -type f -name '*.md' -print0 2>/dev/null)

VIOLATIONS=""
OBLIGATIONS_FOUND=0

for other in "${CANDIDATES[@]}"; do
  [[ -f "$other" ]] || continue

  other_base="$(basename "$other")"

  followup_block="$(awk '
    /^## [Ff]ollow-up [Ii]tems/ { in_section=1; next }
    /^## / && in_section { exit }
    in_section { print }
  ' "$other" 2>/dev/null || true)"

  [[ -n "$followup_block" ]] || continue

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue

    if ! echo "$line" | grep -qE "(task[[:space:]]+${TASK_ID}\b|[Tt]ask[[:space:]]+${TASK_ID}\b|/${TASK_ID}-|pending/${TASK_ID}-|done/${TASK_ID}-|documentation/tasks/${TASK_ID}-)"; then
      continue
    fi

    field="$(echo "$line" | grep -oE '`[A-Za-z_][A-Za-z0-9_.]{1,80}`' | head -n 1 | tr -d '`' || true)"
    [[ -n "$field" ]] || continue

    OBLIGATIONS_FOUND=$((OBLIGATIONS_FOUND + 1))

    field_base="${field##*.}"

    if grep -qE "(\`${field}\`|\`${field_base}\`|\b${field}\b|\b${field_base}\b)" "$TARGET"; then
      continue
    fi

    VIOLATIONS="${VIOLATIONS}${other_base}: field \`${field}\` — this task is the named successor but \`${field}\` does not appear anywhere in the task file\n"
  done < <(echo "$followup_block" | grep -E '^[[:space:]]*[-*][[:space:]]' || true)
done

if [[ -n "$VIOLATIONS" ]]; then
  echo "followup-propagation-check: FAIL — uncovered obligations advertised against task ${TASK_ID}:"
  echo ""
  printf '%b' "$VIOLATIONS"
  echo ""
  echo "Fix: either add the field to this task's scope (Files table, Steps, or Tests), or edit the originating task's \`## Follow-up Items\` entry to name a different successor and re-run the planner against the new target."
  exit 1
fi

if [[ "$OBLIGATIONS_FOUND" -eq 0 ]]; then
  echo "followup-propagation-check: no obligations advertised against task ${TASK_ID} — clean"
else
  echo "followup-propagation-check: ${OBLIGATIONS_FOUND} obligation(s) advertised against task ${TASK_ID} — all covered"
fi
exit 0
