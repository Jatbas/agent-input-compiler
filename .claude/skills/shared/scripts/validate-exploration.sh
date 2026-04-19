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
  "SIBLING QUORUM"
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
  "PREDECESSOR CONTRACTS"
  "UNIT CONTRACT"
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

# Source path existence (AN) — every "Source: <path>" must resolve to an existing file.
# Exploration reports should cite real evidence; a missing path is a hallucination.
# Lines describing future/new artifacts are skipped.
if [[ "$FILE" = /* ]]; then
  TASK_DIR="$(dirname "$FILE")"
  PROJECT_ROOT="$(dirname "$(dirname "$TASK_DIR")")"
else
  PROJECT_ROOT="$(pwd)"
fi

SOURCE_MISSING=0
while IFS= read -r raw; do
  [[ -z "$raw" ]] && continue
  LN="${raw%%|*}"
  REST="${raw#*|}"
  if echo "$REST" | grep -qiE "(new (export|interface|class|function|migration|file|column|table|schema)|once .* (ships?|merges?|lands?|is (merged|shipped|ready))|to be created|shipped on main|merged on main|\bTask +[0-9]+|verified via)"; then
    continue
  fi
  PATH_REF=$(echo "$REST" | sed -nE 's/.*Source:[^`]*`([^`]+)`.*/\1/p' | head -n1)
  if [[ -z "$PATH_REF" ]]; then
    PATH_REF=$(echo "$REST" | sed -nE 's/^[[:space:]]*Source:[[:space:]]+([^[:space:])]+).*/\1/p')
  fi
  [[ -z "$PATH_REF" ]] && continue
  case "$PATH_REF" in
    N/A|verified*|NOT*|Verified*) continue ;;
  esac
  PATH_ONLY="${PATH_REF%% *}"
  if [[ "$PATH_ONLY" = /* ]]; then
    FULL_PATH="$PATH_ONLY"
  else
    FULL_PATH="${PROJECT_ROOT}/${PATH_ONLY}"
  fi
  if [[ ! -e "$FULL_PATH" ]]; then
    echo "source path not found (AN) at ${FILE}:${LN}: ${PATH_ONLY}"
    SOURCE_MISSING=$((SOURCE_MISSING + 1))
  fi
done < <(awk '/^Source:/ { print NR "|" $0 }; /[[:space:]]Source:/ { print NR "|" $0 }' "$FILE")

if [[ $SOURCE_MISSING -gt 0 ]]; then
  MISSING=$((MISSING + SOURCE_MISSING))
fi

if [[ $MISSING -gt 0 ]]; then
  echo ""
  echo "validate-exploration: ${MISSING} issue(s) in ${FILE}"
  exit 1
fi

echo "validate-exploration: ${FILE} complete"
exit 0
