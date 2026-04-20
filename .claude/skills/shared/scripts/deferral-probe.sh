#!/usr/bin/env bash
set -euo pipefail

# deferral-probe.sh — gate that catches cross-task obligation leaks.
# Usage: deferral-probe.sh <task-file>
# Exit codes: 0 = clean, 1 = violations found, 2 = usage/error.
#
# Problem it closes (observed in task 322): the planner introduces a new
# nullable field in a CREATE TABLE (or a new interface field) in the same
# task, then hardcodes the value to `null` / `false` / `0` in a Step body
# with a parenthetical like "populated in a later task". No ## Follow-up
# Items section exists, so no successor task is ever tracked. The column
# ships forever null in practice.
#
# Heuristic:
#   1. Scan Step bodies (outside fenced code blocks and Architecture Notes)
#      for patterns that assign a literal zero value to a named field:
#        <field> → `null`         <field>: null,        <field> → null
#        <field> → `false`        <field>: false,       <field> → 0
#        <field> → `undefined`    <field>: undefined,   <field> → undefined
#        <field> → `None`         <field>: None,        <field> → None
#        <field> → ""             <field>: "",          <field> → ''
#        <field> → []             <field>: [],          <field> → []
#      Where <field> is a backticked identifier of length 2..64.
#   2. For each hit, extract the field name.
#   3. Require at least one of:
#        (a) an explicit "## Follow-up Items" section in the task file that
#            mentions the field name AND a task-ID reference matching
#            `(task|Task) \d{3}` or `pending/\d{3}-` or `documentation/tasks/\d{3}-`,
#        (b) a Goal/Architecture Notes sentence naming the field and saying
#            "remains null" / "always null" / "never populated" (deliberate
#            permanent null),
#        (c) a Change Specification block whose Target text shows the field
#            being populated non-null within this same task.
#   4. Missing all three = fail with hint.
#
# The script is intentionally conservative: it emits at most one finding per
# deferred field, and it does nothing when no matching pattern is found.

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <task-file>" >&2
  exit 2
fi

FILE="$1"

if [[ ! -f "$FILE" ]]; then
  echo "error: file not found: $FILE" >&2
  exit 2
fi

STREAM=$(awk '
  BEGIN { in_code = 0; in_arch = 0 }
  /^```/ { in_code = 1 - in_code; print NR "|"; next }
  /^## Architecture Notes/ { in_arch = 1; print NR "|"; next }
  /^## / && !/^## Architecture Notes/ { in_arch = 0 }
  in_code == 1 { print NR "|"; next }
  in_arch == 1 { print NR "|"; next }
  { print NR "|" $0 }
' "$FILE")

FOLLOWUP=$(awk '
  BEGIN { in_fu = 0 }
  /^## Follow-up Items/ { in_fu = 1; next }
  /^## / && !/^## Follow-up Items/ { in_fu = 0 }
  in_fu == 1 { print }
' "$FILE")

ARCH=$(awk '
  BEGIN { in_arch = 0 }
  /^## Architecture Notes/ { in_arch = 1; next }
  /^## / && !/^## Architecture Notes/ { in_arch = 0 }
  in_arch == 1 { print }
' "$FILE")

GOAL=$(awk '
  BEGIN { in_goal = 0 }
  /^## Goal/ { in_goal = 1; next }
  /^## / && !/^## Goal/ { in_goal = 0 }
  in_goal == 1 { print }
' "$FILE")

HITS=0
SEEN=""

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  LINE_NO="${line%%|*}"
  TEXT="${line#*|}"

  while read -r match; do
    [[ -z "$match" ]] && continue
    FIELD="$match"
    case ",$SEEN," in
      *",${FIELD},"*) continue ;;
    esac
    SEEN="${SEEN},${FIELD}"

    PERMANENT=0
    if echo "$ARCH" | grep -qE "\`${FIELD}\`.*(remains null|stays null|always null|permanently null|never populated)"; then
      PERMANENT=1
    elif echo "$GOAL" | grep -qE "\`${FIELD}\`.*(remains null|stays null|always null|permanently null|never populated)"; then
      PERMANENT=1
    fi
    if [[ $PERMANENT -eq 1 ]]; then
      continue
    fi

    FIELD_IN_FU=0
    SUCCESSOR_IN_FU=0
    if echo "$FOLLOWUP" | grep -qF "\`${FIELD}\`"; then FIELD_IN_FU=1; fi
    if echo "$FOLLOWUP" | grep -qE "(task|Task) [0-9]{3}|pending/[0-9]{3}-|documentation/tasks/[0-9]{3}-"; then
      SUCCESSOR_IN_FU=1
    fi

    if [[ $FIELD_IN_FU -eq 1 && $SUCCESSOR_IN_FU -eq 1 ]]; then
      continue
    fi

    echo "Deferral ${FILE}:${LINE_NO}: field \`${FIELD}\` hardcoded to zero-value"
    echo "    line:    ${TEXT}"
    if [[ $FIELD_IN_FU -eq 0 ]]; then
      echo "    missing: ## Follow-up Items entry mentioning \`${FIELD}\`"
    fi
    if [[ $SUCCESSOR_IN_FU -eq 0 ]]; then
      echo "    missing: successor task reference (e.g. 'task 330' or 'pending/330-...')"
    fi
    echo "    fix:     register \`${FIELD}\` under ## Follow-up Items naming the successor task, or state in ## Architecture Notes that \`${FIELD}\` remains null permanently"
    HITS=$((HITS + 1))
  done < <(echo "$TEXT" | grep -oE "\`[A-Za-z_][A-Za-z0-9_]{1,63}\`[[:space:]]*(→|:)[[:space:]]*(\`?(null|false|0|undefined|None)\`?|\"\"|''|\[\])([[:space:]]|,|\.|$|\))" | sed -E 's/^`([A-Za-z_][A-Za-z0-9_]+)`.*/\1/' | sort -u)
done < <(echo "$STREAM")

if [[ $HITS -gt 0 ]]; then
  echo ""
  echo "deferral-probe: ${HITS} deferred-field violation(s) in ${FILE}"
  exit 1
fi

echo "deferral-probe: ${FILE} clean"
exit 0
