#!/usr/bin/env bash
set -euo pipefail

# validate-exploration.sh — verify an Exploration Report is fully filled.
# Usage: validate-exploration.sh <exploration-report-path>
# Exit codes: 0 = valid, 1 = missing required fields, 2 = usage error.
#
# Checks:
#   1. Mandatory sections present (LAYER, RECIPE, EXISTING FILES, etc.)
#   2. No REQUIRED field left unfilled ("[", "TODO", "TBD", "NOT VERIFIED — BLOCKER")
#   3. Every field has a "Source:" line or explicit "N/A" / "Or: ..." fallback
#   4. No "or" inside method-behaviour bullets (§METHOD BEHAVIORS must be definitive)

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <exploration-report-path>" >&2
  exit 2
fi

FILE="$1"

if [[ ! -f "$FILE" ]]; then
  echo "error: file not found: $FILE" >&2
  exit 2
fi

REQUIRED_SECTIONS=(
  "LAYER:"
  "RECIPE:"
  "EXISTING FILES"
  "SIBLING PATTERN"
  "DEPENDENCIES"
  "ESLINT CHANGES"
  "INTERFACES"
  "DEPENDENT TYPES"
  "OPTIONAL FIELD HAZARDS"
  "CONSTRUCTOR"
  "METHOD BEHAVIORS"
  "LIBRARY APIs"
  "STEP PLAN"
  "TEST STRATEGY"
  "TEST IMPACT"
  "SPECULATIVE TOOL EXECUTION"
  "DOCUMENTATION IMPACT"
  "LAYER BLOCKERS"
  "DESIGN DECISIONS"
)

MISSING=0
for section in "${REQUIRED_SECTIONS[@]}"; do
  if ! grep -qF "$section" "$FILE"; then
    echo "missing section: ${section}"
    MISSING=$((MISSING + 1))
  fi
done

BLOCKERS=$(grep -nE "NOT VERIFIED — BLOCKER|^TBD\b|^TODO\b|^\[TODO\]|^\[TBD\]" "$FILE" || true)
if [[ -n "$BLOCKERS" ]]; then
  echo ""
  echo "blocker fields:"
  echo "$BLOCKERS"
  MISSING=$((MISSING + 1))
fi

# Any field line of the form "FIELD: [placeholder]" with nothing after ]
UNFILLED=$(grep -nE "^[A-Z][A-Z ]+: *\[[^]]+\] *$" "$FILE" || true)
if [[ -n "$UNFILLED" ]]; then
  echo ""
  echo "unfilled placeholders:"
  echo "$UNFILLED"
  MISSING=$((MISSING + 1))
fi

# METHOD BEHAVIORS must be definitive — no "or" inside the bullet. Extract the section.
METHOD_BLOCK=$(awk '
  /^METHOD BEHAVIORS:/ { inblock = 1; next }
  inblock && /^[A-Z][A-Z ]+:/ { inblock = 0 }
  inblock { print NR ": " $0 }
' "$FILE" || true)
OR_HITS=$(echo "$METHOD_BLOCK" | grep -iE "\bor\b" | grep -vE "\bor:\b|\bN/A\b|\bno or\b" || true)
if [[ -n "$OR_HITS" ]]; then
  echo ""
  echo "non-definitive METHOD BEHAVIORS (contains 'or'):"
  echo "$OR_HITS"
  MISSING=$((MISSING + 1))
fi

if [[ $MISSING -gt 0 ]]; then
  echo ""
  echo "validate-exploration: ${MISSING} issue(s) in ${FILE}"
  exit 1
fi

echo "validate-exploration: ${FILE} complete"
exit 0
