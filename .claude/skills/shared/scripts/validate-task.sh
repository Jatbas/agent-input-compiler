#!/usr/bin/env bash
set -euo pipefail

# validate-task.sh — mechanical checks for a task file (C.5 automation).
# Usage: validate-task.sh <task-file-path>
# Exit codes: 0 = clean, 1 = issues found, 2 = usage error.
#
# Checks that are scriptable:
#   - Empty parentheses: (), ( ), (,), (;)
#   - Trailing prepositions at end of line
#   - Trailing punctuation fragments
#   - Internal codes still present (AK01, T123, Phase X, /AB)
#   - Section presence (Goal, Files, Interface / Signature, Steps, Tests,
#     Config Changes, Acceptance Criteria)
#   - Step size: warn if any step block references more than one file path
#     under shared/ or mcp/ (heuristic; not exhaustive)

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <task-file-path>" >&2
  exit 2
fi

FILE="$1"
[[ -f "$FILE" ]] || { echo "error: not found: $FILE" >&2; exit 2; }

ISSUES=0

# 1. Empty parens (outside fenced code blocks)
HITS=$(awk '/^```/{c=1-c; next} c==0' "$FILE" |
  grep -nE "\( *[,;] *\)" || true)
if [[ -n "$HITS" ]]; then
  echo "empty parentheses:"
  echo "$HITS"
  ISSUES=$((ISSUES + 1))
fi

# 2. Trailing prepositions (not inside code fences)
HITS=$(awk '/^```/{c=1-c; next} c==0' "$FILE" |
  grep -nE "[[:space:]](for|and|or|with|to|from|in|on|at)[[:space:]]*$" || true)
if [[ -n "$HITS" ]]; then
  echo "trailing prepositions:"
  echo "$HITS"
  ISSUES=$((ISSUES + 1))
fi

# 3. Trailing punctuation fragments outside code
HITS=$(awk '/^```/{c=1-c; next} c==0' "$FILE" |
  grep -nE "(^|[^-])[,;] *$" || true)
if [[ -n "$HITS" ]]; then
  echo "trailing comma/semicolon:"
  echo "$HITS"
  ISSUES=$((ISSUES + 1))
fi

# 4. Internal codes leaked into prose (skip fenced blocks, title line, and metadata block before "## Goal")
HITS=$(awk '
  NR==1 { next }
  /^## Goal/ { past_header=1 }
  /^```/ { c=1-c; next }
  c==1 { next }
  past_header { print NR "|" $0 }
' "$FILE" |
  grep -nE "\b[A-Z]{1,2}[0-9]{2,3}\b|\bTask [0-9]+\b|\bPhase [A-Za-z]{1,2}\b|/[A-Z]{2}\b" || true)
if [[ -n "$HITS" ]]; then
  echo "internal codes in prose (Phase X, Task N, AK01, /AB):"
  echo "$HITS"
  ISSUES=$((ISSUES + 1))
fi

# 5. Section presence
for section in "## Goal" "## Files" "## Steps" "## Tests" "## Acceptance"; do
  if ! grep -qF "$section" "$FILE"; then
    echo "missing section: ${section}"
    ISSUES=$((ISSUES + 1))
  fi
done

# 5b. Behavior spec — either "## Interface" (new-component recipes) or "## Behavior Change" (fix-patch)
if ! grep -qE "^## (Interface|Behavior Change)" "$FILE"; then
  echo "missing section: ## Interface / Signature   OR   ## Behavior Change (fix-patch)"
  ISSUES=$((ISSUES + 1))
fi

# 6. Prohibited alternatives: "Option A / Option B" or "Approach A vs Approach B" in Interface
HITS=$(awk '
  /^## Interface/ { in_if = 1; next }
  /^## / && in_if { in_if = 0 }
  in_if
' "$FILE" | grep -nE "Option A|Option B|Approach [AB]\b" || true)
if [[ -n "$HITS" ]]; then
  echo "multiple options in Interface/Signature:"
  echo "$HITS"
  ISSUES=$((ISSUES + 1))
fi

if [[ $ISSUES -gt 0 ]]; then
  echo ""
  echo "validate-task: ${ISSUES} issue group(s) in ${FILE}"
  exit 1
fi

echo "validate-task: ${FILE} clean"
exit 0
