#!/usr/bin/env bash
set -euo pipefail

# git-clean-plan-validate.sh — validates proposed commit messages (aic-git-history-clean plan).
# Usage: git-clean-plan-validate.sh <plan.tsv>
#   plan.tsv format (one message per line, tab-separated columns):
#     status<TAB>message
#   where status is one of: keep, squash.
# Exit codes: 0 = clean, 1 = issues, 2 = usage error.

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <plan.tsv>" >&2
  exit 2
fi

FILE="$1"
[[ -f "$FILE" ]] || { echo "error: not found: $FILE" >&2; exit 2; }

ISSUES=0
LINE=0
while IFS=$'\t' read -r status message; do
  LINE=$((LINE + 1))
  [[ -z "${message:-}" ]] && continue
  [[ -z "${status:-}" ]] && continue

  # 1. Empty parens
  if echo "$message" | grep -qE "\( *[,;]? *\)"; then
    echo "line ${LINE}: empty parentheses — ${message}"
    ISSUES=$((ISSUES + 1))
  fi
  # 2. Trailing prepositions
  if echo "$message" | grep -qiE "[[:space:]](for|and|or|with|to|from|in|on|at)[[:space:]]*$"; then
    echo "line ${LINE}: trailing preposition — ${message}"
    ISSUES=$((ISSUES + 1))
  fi
  # 3. Trailing punctuation
  if echo "$message" | grep -qE "[,;—–-][[:space:]]*$"; then
    echo "line ${LINE}: trailing punctuation — ${message}"
    ISSUES=$((ISSUES + 1))
  fi
  # 4. Internal codes
  if echo "$message" | grep -qE "\b[A-Z]{1,2}[0-9]{2,3}\b|\bTask [0-9]+\b|\bPhase [A-Za-z]{1,2}\b|/[A-Z]{2}\b"; then
    echo "line ${LINE}: internal code — ${message}"
    ISSUES=$((ISSUES + 1))
  fi
  # 5. Minimum description length (after stripping prefix)
  DESC=$(echo "$message" | sed -E 's/^[a-z]+(\([a-z0-9/-]+\))?: *//')
  if [[ ${#DESC} -lt 12 ]]; then
    echo "line ${LINE}: description < 12 chars — ${message}"
    ISSUES=$((ISSUES + 1))
  fi
  # 6. Conventional format
  if ! echo "$message" | grep -qE "^[a-z]+(\([a-z0-9/-]+\))?: .{12,}$"; then
    echo "line ${LINE}: non-conventional format — ${message}"
    ISSUES=$((ISSUES + 1))
  fi
  # 7. Merge task numbers
  if echo "$message" | grep -qE "Merge branch '.+task-[0-9]+"; then
    echo "line ${LINE}: merge contains task number — ${message}"
    ISSUES=$((ISSUES + 1))
  fi
done < "$FILE"

if [[ $ISSUES -gt 0 ]]; then
  echo ""
  echo "git-clean-plan-validate: ${ISSUES} issue(s)"
  exit 1
fi

echo "git-clean-plan-validate: clean"
exit 0
