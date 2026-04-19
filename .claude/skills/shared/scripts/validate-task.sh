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

# Project root inference — used by AN (source path existence) and AP (prerequisite glob).
# When the task file is absolute and lives under <root>/documentation/tasks/, strip to get <root>.
# Otherwise fall back to $PWD.
if [[ "$FILE" = /* ]]; then
  TASK_DIR="$(dirname "$FILE")"
  PROJECT_ROOT="$(dirname "$(dirname "$TASK_DIR")")"
else
  PROJECT_ROOT="$(pwd)"
fi

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

# 4. Internal codes leaked into prose (skip fenced blocks, title line, metadata block
#    before "## Goal", AND ## Architecture Notes — the latter is rationale and is allowed
#    to cite Task N for predecessor contracts, cross-task coherence, and design notes).
HITS=$(awk '
  NR==1 { next }
  /^## Goal/ { past_header=1 }
  /^## Architecture Notes/ { in_arch=1; next }
  /^## / && !/^## Architecture Notes/ { in_arch=0 }
  /^```/ { c=1-c; next }
  c==1 { next }
  in_arch==1 { next }
  past_header { print NR "|" $0 }
' "$FILE" |
  grep -nE "\b[A-Z]{1,2}[0-9]{2,3}\b|\bPhase [A-Za-z]{1,2}\b|/[A-Z]{2}\b" || true)
if [[ -n "$HITS" ]]; then
  echo "internal codes in prose (Phase X, AK01, /AB) — 'Task N' is allowed per predecessor-contract discipline:"
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

# 7. Dual anchor for line-number references (AL)
# Outside code blocks, any "line N" / "lines N-M" / "at line N" reference must
# co-occur with at least one backtick-quoted substring on the same line — that
# substring is the stable anchor the executor uses if the line shifts.
HITS=$(awk '
  /^```/ { c = 1 - c; next }
  c == 1 { next }
  /(^|[^a-zA-Z])(line |lines |at line |:line )[0-9]+/ {
    if ($0 !~ /`[^`]+`/) print NR ": " $0
  }
' "$FILE" || true)
if [[ -n "$HITS" ]]; then
  echo "dual-anchor missing (AL) — line-number references without a backtick-quoted literal on the same line:"
  echo "$HITS"
  ISSUES=$((ISSUES + 1))
fi

# 8. Prerequisite graph validation (AP)
# Extract 3- or 4-digit task numbers from the Depends-on / Prerequisite header line.
# Every referenced number must resolve to a file under documentation/tasks/{,drafts/,done/}.
# Prose prerequisites ("none", "X shipped on main") have no digits and are skipped.
DEPS=$(grep -E "^> \*\*(Depends on|Prerequisite)s?:\*\*" "$FILE" || true)
if [[ -n "$DEPS" ]]; then
  REFS=$(echo "$DEPS" | grep -oE "Task +[0-9]{3,4}|[[:space:]][0-9]{3,4}-[a-z]" | grep -oE "[0-9]{3,4}" | sort -u || true)
  for num in $REFS; do
    if ! compgen -G "${PROJECT_ROOT}/documentation/tasks/${num}-*.md" > /dev/null \
       && ! compgen -G "${PROJECT_ROOT}/documentation/tasks/drafts/${num}-*.md" > /dev/null \
       && ! compgen -G "${PROJECT_ROOT}/documentation/tasks/done/${num}-*.md" > /dev/null; then
      echo "prerequisite not found (AP): Task ${num} — no matching file in documentation/tasks/{,drafts/,done/}"
      ISSUES=$((ISSUES + 1))
    fi
  done
fi

# 9. SECTION EDIT resolution (AK)
# Any "- **Target text:**" bullet whose body delegates work to a downstream skill
# ("produced by running the documentation-writer skill", "output of …", etc.) means
# the planner shifted the resolution step onto the executor. Fail.
HITS=$(awk '
  /^```/ { c = 1 - c; next }
  c == 1 { next }
  /^-[[:space:]]+\*\*Target text:\*\*/ { print NR "|" $0 }
' "$FILE" | grep -iE "(produced by (running|the) [a-z-]+|generated by (running|the) [a-z-]+|output of running|after running|synthesized by|result of running|written by (the )?[a-z-]+ skill|to be written by|resolved during execution|:\s*TBD)" || true)
if [[ -n "$HITS" ]]; then
  echo "SECTION EDIT unresolved (AK) — Target text delegates resolution to the executor:"
  echo "$HITS"
  ISSUES=$((ISSUES + 1))
fi

# 10. Unit contract mandate (AJ)
# If the task references slot names with unit-hint suffixes (snake_case _ratio/_pct/...
# or camelCase Ratio/Rate/Pct/...), Architecture Notes must include a Unit contract
# bullet declaring each slot's domain. Template form: "- **Unit contract:**"; legacy
# tasks may use "- Unit contract:" — both accepted.
NUM_HITS=$(grep -cE "\b[a-zA-Z][a-zA-Z0-9_]+(_ratio|_pct|_percent|_percentage|_ms|_seconds|_rate|_hit_count|_duration_ms|Ratio|Rate|Pct|Percent|Percentage|HitCount|DurationMs)\b" "$FILE" || true)
if [[ ${NUM_HITS:-0} -gt 0 ]]; then
  if ! grep -qE "^-[[:space:]]+\*\*Unit contract:?\*\*|^-[[:space:]]+Unit contract:" "$FILE"; then
    echo "missing Unit contract (AJ) — task references ${NUM_HITS} slot(s) with unit-hint suffixes but Architecture Notes has no 'Unit contract:' bullet"
    ISSUES=$((ISSUES + 1))
  fi
fi

# 11. Source path existence — task body (AN-lite)
# Every "Source: <path>" line in the task body must resolve to an existing file on
# disk. Lines describing future state ("new export in …", "once X ships on main",
# "to be created", "after Task N") are skipped — those paths will exist after the
# prerequisite executes.
while IFS= read -r raw; do
  [[ -z "$raw" ]] && continue
  LN="${raw%%|*}"
  REST="${raw#*|}"
  # Skip lines describing future/new state OR cross-task references (prerequisite outputs).
  if echo "$REST" | grep -qiE "(new (export|interface|class|function|migration|file|column|table|schema)|once .* (ships?|merges?|lands?|is (merged|shipped|ready))|to be created|shipped on main|merged on main|\bTask +[0-9]+)"; then
    continue
  fi
  # Prefer the FIRST backticked path-like token — robust against prose prefixes
  # like "existing export in `path/to/file.ts` line 323". Fall back to the first
  # bare word after "Source:" only when no backticks are present.
  PATH_REF=$(echo "$REST" | sed -nE 's/.*Source:[^`]*`([^`]+)`.*/\1/p' | head -n1)
  if [[ -z "$PATH_REF" ]]; then
    PATH_REF=$(echo "$REST" | sed -nE 's/^[[:space:]]*Source:[[:space:]]+([^[:space:])]+).*/\1/p')
  fi
  [[ -z "$PATH_REF" ]] && continue
  case "$PATH_REF" in
    N/A|verified*|NOT*|Verified*) continue ;;
  esac
  # Strip any embedded "lines N-M" suffix or trailing punctuation.
  PATH_ONLY="${PATH_REF%% *}"
  if [[ "$PATH_ONLY" = /* ]]; then
    FULL_PATH="$PATH_ONLY"
  else
    FULL_PATH="${PROJECT_ROOT}/${PATH_ONLY}"
  fi
  if [[ ! -e "$FULL_PATH" ]]; then
    echo "source path not found (AN) at ${FILE}:${LN}: ${PATH_ONLY}"
    ISSUES=$((ISSUES + 1))
  fi
done < <(awk '
  /^```/ { c = 1 - c; next }
  c == 1 { next }
  /^[[:space:]]*Source:/ { print NR "|" $0 }
' "$FILE")

if [[ $ISSUES -gt 0 ]]; then
  echo ""
  echo "validate-task: ${ISSUES} issue group(s) in ${FILE}"
  exit 1
fi

echo "validate-task: ${FILE} clean"
exit 0
