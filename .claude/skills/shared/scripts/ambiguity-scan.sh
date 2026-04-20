#!/usr/bin/env bash
set -euo pipefail

# ambiguity-scan.sh — deterministic gate for banned phrases in planner/executor/docs output.
# Usage: ambiguity-scan.sh <file> [--strict]
# Exit codes: 0 = clean, 1 = violations found, 2 = usage/error.
#
# Scans for Categories 1-8 from aic-task-planner/SKILL-guardrails.md "No ambiguity".
# Skips fenced code blocks (``` ... ```) and lines under "## Architecture Notes"
# through the next top-level header (rationale is exempt per guardrails).
#
# This script is the single source of truth for ambiguity scanning. Any skill
# that needs the check must call this script rather than re-listing phrases.

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <file> [--strict]" >&2
  exit 2
fi

FILE="$1"
STRICT="${2:-}"

if [[ ! -f "$FILE" ]]; then
  echo "error: file not found: $FILE" >&2
  exit 2
fi

# Patterns grouped by category. Each entry: category|pattern|fix-hint
# Use word boundaries (\b) and case-insensitive matching (grep -iE).
PATTERNS=(
  # Cat 1: Hedging
  "1|\bif needed\b|Decide yes/no and remove hedge"
  "1|\bif necessary\b|Decide yes/no and remove hedge"
  "1|\bif required\b|Decide yes/no and remove hedge"
  "1|\bif appropriate\b|Decide yes/no and remove hedge"
  "1|\bif desired\b|Decide yes/no and remove hedge"
  "1|\bif applicable\b|Decide yes/no and remove hedge"
  "1|\bas needed\b|Decide yes/no and remove hedge"
  "1|\bas necessary\b|Decide yes/no and remove hedge"
  "1|\bas appropriate\b|Decide yes/no and remove hedge"
  "1|\bmay want\b|Decide and remove hedge"
  "1|\bmay need\b|Decide and remove hedge"
  "1|\bmay be added\b|Decide — in scope or not"
  "1|\bmight want\b|Decide and remove hedge"
  "1|\bmight need\b|Decide and remove hedge"
  "1|\byou could\b|Decide and remove hedge"
  "1|\bcould also\b|Decide and remove hedge"
  "1|\bshould work\b|Verify; replace with definitive statement"
  "1|\bshould be fine\b|Verify; replace with definitive statement"
  "1|\bshould suffice\b|Verify; replace with definitive statement"
  "1|\bprobably\b|Verify and state definitively"
  "1|\blikely\b|Verify and state definitively"
  "1|\bpossibly\b|Decide and remove hedge"
  "1|\bpotentially\b|Decide and remove hedge"
  "1|\bperhaps\b|Decide and remove hedge"
  "1|\btry to\b|State the definitive action"
  "1|\battempt to\b|State the definitive action"
  "1|\bideally\b|State what the instruction requires"
  "1|\bpreferably\b|State the required choice"
  "1|\bfeel free to\b|Instructions are mandatory; remove"
  # Cat 2: Examples-as-instructions
  "2|\be\.g\.|Replace example with definitive instruction"
  "2|\beg\.|Replace example with definitive instruction"
  "2|\bfor example\b|Replace example with definitive instruction"
  "2|\bfor instance\b|Replace example with definitive instruction"
  "2|\bsomething like\b|State the exact value"
  "2|\balong the lines of\b|State the exact value"
  "2|\bsimilar to\b|State the exact value"
  "2|\bor similar\b|Remove alternative; pick one"
  "2|\bor equivalent\b|Remove alternative; pick one"
  "2|\bor comparable\b|Remove alternative; pick one"
  "2|\bsome kind of\b|State exactly"
  "2|\bsome sort of\b|State exactly"
  "2|\bsome form of\b|State exactly"
  # Cat 3: Delegation of choice
  "3|\bdecide whether\b|Planner decides, not executor"
  "3|\bdecide if\b|Planner decides, not executor"
  "3|\bchoose between\b|Planner decides, not executor"
  "3|\bpick one\b|Planner decides, not executor"
  "3|\bdepending on\b|Resolve during planning"
  "3|\bdepends on\b|Resolve during planning"
  "3|\bup to you\b|Planner decides, not executor"
  "3|\byour choice\b|Planner decides, not executor"
  "3|\bat your discretion\b|Planner decides, not executor"
  "3|\balternatively\b|Remove alternative; pick one"
  "3|\bor alternatively\b|Remove alternative; pick one"
  "3|\bwhichever\b|Pick one and write it"
  "3|\bwhatever works\b|Pick one and write it"
  "3|\bhowever you prefer\b|Pick one and write it"
  "3|\boptionally\b|Decide — in scope or not"
  "3|\bor optionally\b|Decide — in scope or not"
  # Cat 4: Vague qualifiers
  "4|\bappropriate (handling|tests|error|value|place|location|approach)\b|Specify exactly"
  "4|\bsuitable (handling|tests|error|value|place|location)\b|Specify exactly"
  "4|\betc\.|List every item"
  "4|\band so on\b|List every item"
  "4|\band so forth\b|List every item"
  # Cat 5: Conditional state hedges
  "5|\bif not present\b|State the known fact (exists/absent)"
  "5|\bif not already\b|State the known fact (exists/absent)"
  "5|\bif it doesn'?t exist\b|State the known fact (exists/absent)"
  "5|\bif missing\b|State the known fact (exists/absent)"
  "5|\bif not installed\b|Verify and state concrete version or absence"
  "5|\badd if not present\b|State explicit create or skip"
  "5|\bcreate if not exists\b|State explicit create or skip (use idempotent API instead)"
  # Cat 6: Escape clauses
  "6|\bor skip\b|If in scope, write it; if not, remove"
  "6|\bor ignore\b|If in scope, write it; if not, remove"
  "6|\bor leave for later\b|Remove; not in this task"
  "6|\bor a follow-up\b|Remove; not in this task"
  "6|\bin a later task\b|Remove; executor may not have it"
  "6|\bin a future task\b|Remove; executor may not have it"
  "6|\bfollow-up task\b|Name the task ID and register under ## Follow-up Items"
  "6|\bsubsequent task\b|Name the task ID and register under ## Follow-up Items"
  "6|\bdownstream task\b|Name the task ID and register under ## Follow-up Items"
  "6|\bpopulated later\b|Register under ## Follow-up Items with a named successor task"
  "6|\bwill be populated\b|Register under ## Follow-up Items with a named successor task"
  "6|\bwill be wired\b|Register under ## Follow-up Items with a named successor task"
  "6|\bif possible\b|Commit or remove"
  "6|\bwhere possible\b|Commit or remove"
  "6|\bwhen possible\b|Commit or remove"
  "6|\bif feasible\b|Commit or remove"
  "6|\bif time permits\b|Commit or remove"
  # Cat 7: False alternatives (narrow — broad \bX or Y\b has too many false positives)
  "7|\bor use another\b|Pick one"
  "7|\bor use any\b|Pick one"
  "7|\beither.*or (use|call|invoke|add|create)\b|Pick one"
  # Cat 8: Tool-conditional scope
  "8|\bif knip reports\b|Run knip during exploration; record exact output"
  "8|\bif knip flags\b|Run knip during exploration; record exact output"
  "8|\bif lint shows\b|Run lint during exploration; record exact errors"
  "8|\bif lint reports\b|Run lint during exploration; record exact errors"
  "8|\bif test shows\b|Run test during exploration; record exact output"
  "8|\bif test fails\b|Run test during exploration; record exact output"
  "8|\bif typecheck reports\b|Run typecheck during exploration; record exact errors"
  "8|\brun knip and add\b|Run knip during exploration; record specific entries"
  "8|\brun lint and add\b|Run lint during exploration; record specific entries"
  "8|\bcheck .* output\b|Capture specific output during exploration"
  # Plan-failure patterns
  "P|\bTBD\b|Resolve; no TBD in task file"
  "P|\bimplement later\b|Resolve; no deferrals"
  "P|\bhandle edge cases\b|List each edge case"
  "P|\bwrite tests for the above\b|List each test case by name"
  "P|\bupdate as needed\b|State the specific update"
  "P|\bfix if broken\b|Decide; state the fix or remove"
  "P|\brefactor if necessary\b|Decide now"
)

# Pre-process: build a line-by-line stream that strips:
#   1. fenced code blocks (``` ... ```)
#   2. lines under "## Architecture Notes" through the next "## " header
# We emit "LINE|TEXT" where skipped lines become empty text but retain the number.
STREAM=$(awk '
  BEGIN { in_code = 0; in_arch = 0 }
  /^```/ { in_code = 1 - in_code; print NR "|"; next }
  /^## Architecture Notes/ { in_arch = 1; print NR "|"; next }
  /^## / && !/^## Architecture Notes/ { in_arch = 0 }
  in_code == 1 { print NR "|"; next }
  in_arch == 1 { print NR "|"; next }
  { print NR "|" $0 }
' "$FILE")

HITS=0
for entry in "${PATTERNS[@]}"; do
  CAT="${entry%%|*}"
  REST="${entry#*|}"
  PAT="${REST%%|*}"
  HINT="${REST#*|}"
  while IFS= read -r match; do
    [[ -z "$match" ]] && continue
    LINE="${match%%|*}"
    TEXT="${match#*|}"
    echo "Cat${CAT} ${FILE}:${LINE}: ${TEXT}"
    echo "    pattern: ${PAT}"
    echo "    fix:     ${HINT}"
    HITS=$((HITS + 1))
  done < <(echo "$STREAM" | grep -iE "^[0-9]+\|.*${PAT}" 2>/dev/null || true)
done

if [[ $HITS -gt 0 ]]; then
  echo ""
  echo "ambiguity-scan: ${HITS} violation(s) in ${FILE}"
  exit 1
fi

echo "ambiguity-scan: ${FILE} clean"
exit 0
