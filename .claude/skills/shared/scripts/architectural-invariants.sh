#!/usr/bin/env bash
set -euo pipefail

# architectural-invariants.sh — task-file discipline gate for DRY / SOLID /
# branded-type / label-alignment invariants.
#
# Usage: architectural-invariants.sh <task-file>
# Exit codes: 0 = clean, 1 = violations found, 2 = usage error.
#
# Scope: this script reads the TASK FILE only. It checks shape, not semantics —
# it verifies the planner has written named justification bullets when known
# defect-class triggers fire. Real-code enforcement lives in ESLint / the
# type-checker; semantic correctness of the bullets is verified by
# critic-measurement-consistency.md.
#
# Output side-effect: appends a structured record to .aic/gate-log.jsonl with
#   {"gate":"architectural-invariants","status":"ok"|"fail","triggers_fired":[...],
#    "missing_bullets":[...],"exempted":[...],"measurement_critic_required":bool}
# Planner and executor MUST read the latest record for `target` == task-file
# and dispatch the critic iff `critic_required` is true. No LLM judgement
# enters the dispatch path — the field determines the action.
#
# Each check maps to a confirmed defect class:
#   DRY-01      — 128_000 − 4_000 − 500 duplicated at 4 sites
#   SRP-01      — hero-line arithmetic inside format-*.ts
#   LABEL-01    — hero-line subject/object confusion on `aic last`
#   BRAND-01    — Percentage used as 0-100 instead of 0-1
#   DIP-01      — defense in depth for composition-root drift
#   OCP-01      — BudgetAllocator mutated instead of new step added
#   SCOPE-01    — per-project queries without project_id guard
#   PERSIST-01  — quality_snapshots.budget_utilisation persisted wrong while
#                 display was fixed independently
#
# The required bullets are:
#   - **Source-of-truth probe:**       (DRY-01)
#   - **Computation source:**          (SRP-01)
#   - **Label-formula alignment:**     (LABEL-01)
#   - **Brand invariant cite:**        (BRAND-01)
#   - **DIP exception:**               (DIP-01)
#   - **OCP exception:**               (OCP-01)
#   - **Query scope:**                 (SCOPE-01)
#   - **Persistence-display parity:**  (PERSIST-01)   OR   **Recompute-from-log note:**
#
# Escape hatch — **Gate-exempt:** bullet:
#   Format:  **Gate-exempt:** <CHECK-ID>: <reason>
#   Reasons: mention-only | test-fixture-only | docstring-reference | interface-signature-only
#   Any other wording fails the gate. Trailing text after the reason is allowed
#   and is reviewed by critic-measurement-consistency.md (SOFT).

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <task-file>" >&2
  exit 2
fi

FILE="$1"
[[ -f "$FILE" ]] || { echo "error: not found: $FILE" >&2; exit 2; }

# PROJECT_ROOT derivation — resolves from script location, NOT from task-file
# location. The script lives at <root>/.claude/skills/shared/scripts/; walking
# up 4 levels always lands at the repo root regardless of where the task file
# sits. The previous task-file-relative derivation silently failed to find
# shared/src/core/types/ when the task file was absolute-path nested.
SCRIPT_PATH="${BASH_SOURCE[0]}"
while [[ -L "$SCRIPT_PATH" ]]; do
  SCRIPT_PATH="$(readlink "$SCRIPT_PATH")"
done
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

ISSUES=0
TRIGGERS_FIRED=""
MISSING_BULLETS=""
EXEMPTED=""

# Task file with code fences stripped — used for prose-level triggers.
PROSE=$(awk '/^```/{c=1-c; next} c==0' "$FILE")

# Task file INSIDE fenced code blocks — used for code-shaped triggers.
CODE=$(awk '/^```/{c=1-c; next} c==1' "$FILE")

ALLOWED_CHECK_IDS="DRY-01|SRP-01|LABEL-01|BRAND-01|DIP-01|OCP-01|SCOPE-01|PERSIST-01"
ALLOWED_EXEMPT_REASONS="mention-only|test-fixture-only|docstring-reference|interface-signature-only"

# Parse any **Gate-exempt:** bullets and validate grammar. An exempted check
# skips its bullet requirement but still records the trigger fire.
while IFS= read -r raw_line; do
  if [[ "$raw_line" =~ ^(-[[:space:]]+)?\*\*Gate-exempt:\*\*[[:space:]]+([A-Z]+-[0-9]+):[[:space:]]+([a-z-]+) ]]; then
    ex_check="${BASH_REMATCH[2]}"
    ex_reason="${BASH_REMATCH[3]}"
    if [[ ! "$ex_check" =~ ^(${ALLOWED_CHECK_IDS})$ ]]; then
      echo ""
      echo "Gate-exempt: ${FILE}"
      echo "    invalid check-id '${ex_check}'"
      echo "    allowed: ${ALLOWED_CHECK_IDS//|/, }"
      ISSUES=$((ISSUES + 1))
      continue
    fi
    if [[ ! "$ex_reason" =~ ^(${ALLOWED_EXEMPT_REASONS})$ ]]; then
      echo ""
      echo "Gate-exempt: ${FILE}"
      echo "    invalid reason '${ex_reason}' for ${ex_check}"
      echo "    allowed: ${ALLOWED_EXEMPT_REASONS//|/, }"
      ISSUES=$((ISSUES + 1))
      continue
    fi
    EXEMPTED="${EXEMPTED}${ex_check} "
  fi
done < "$FILE"

record_trigger() {
  TRIGGERS_FIRED="${TRIGGERS_FIRED}$1 "
}

is_exempt() {
  local needle="$1"
  local e
  for e in $EXEMPTED; do
    [[ "$e" = "$needle" ]] && return 0
  done
  return 1
}

fail_with_hint() {
  local check="$1"
  local bullet="$2"
  local hint="$3"
  echo ""
  echo "${check}: ${FILE}"
  echo "    required bullet: ${bullet}"
  echo "    fix:             ${hint}"
  ISSUES=$((ISSUES + 1))
  MISSING_BULLETS="${MISSING_BULLETS}${check} "
}

has_bullet() {
  local name="$1"
  grep -qE "^(-[[:space:]]+)?\*\*${name}:\*\*" "$FILE"
}

has_bullet_any() {
  local n
  for n in "$@"; do
    has_bullet "$n" && return 0
  done
  return 1
}

require_bullet() {
  local check="$1"
  local bullet_label="$2"
  local hint="$3"
  shift 3
  if is_exempt "$check"; then
    return 0
  fi
  if has_bullet_any "$@"; then
    return 0
  fi
  fail_with_hint "$check" "$bullet_label" "$hint"
}

# === DRY-01: Constants-reuse probe ============================================
# Trigger: any TypeScript-style numeric literal with an underscore separator
# matching \b\d{1,3}(_\d{3})+\b OR any bare decimal literal of 6+ digits
# matching \b\d{6,}\b. Both shapes indicate a named constant that must live in
# exactly one module. A 5-digit literal like 30000 is below the threshold
# because such numbers are frequently line counts, port numbers, or timeouts
# that are genuinely local; 6+ digits in AIC consistently indicates a budget,
# window size, or token count that needs a single owner.
DRY01_HITS=$(printf '%s\n' "$PROSE" "$CODE" |
  grep -oE "\b[0-9]{1,3}(_[0-9]{3})+\b|\b[0-9]{6,}\b" |
  sort -u || true)
if [[ -n "$DRY01_HITS" ]]; then
  record_trigger "DRY-01"
  require_bullet "DRY-01" "**Source-of-truth probe:**" \
    "task mentions numeric literal(s) [$(echo "$DRY01_HITS" | tr '\n' ' ')]; name the single module that owns each constant (or declare this task creates that module). Import — never re-literalise." \
    "Source-of-truth probe"
fi

# === SRP-01: Display-layer compute ============================================
# Trigger: task Modifies a display file (formatter/diagnostic) AND the Steps
# section contains arithmetic keywords or operators on identifiers.
SRP01_DISPLAY_MOD=$(awk '
  BEGIN { in_files = 0 }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|/ && /Modify/ { print }
' "$FILE" | grep -E "mcp/src/format-|mcp/src/diagnostic-|-formatter\.ts|format-diagnostic-output\.ts" || true)

SRP01_STEPS_MATH=$(awk '
  /^## Steps/ { in_steps = 1; next }
  /^## / && in_steps { in_steps = 0 }
  in_steps { print }
' "$FILE" | grep -iE "\b(divide|multiply|percentage of|ratio of|sum of|total of|compute|derive|accumulate|reduce|aggregate|subtract|average|mean|count of|min of|max of)\b|[0-9]+[[:space:]]*[/%*+\-][[:space:]]*[0-9]+" || true)

if [[ -n "$SRP01_DISPLAY_MOD" && -n "$SRP01_STEPS_MATH" ]]; then
  record_trigger "SRP-01"
  require_bullet "SRP-01" "**Computation source:**" \
    "task modifies a display file AND Steps contain arithmetic. Name the upstream module that computes the metric and explain what the formatter reads verbatim — no new arithmetic inside format-*/diagnostic-*." \
    "Computation source"
fi

# === LABEL-01: Label/formula alignment ========================================
# Trigger: task Modifies any formatter/diagnostic file AND Steps edit a user-
# visible string literal or hero-line / CLI output / status-line text.
LABEL01_STRING_EDIT=$(awk '
  /^## Steps/ { in_steps = 1; next }
  /^## / && in_steps { in_steps = 0 }
  in_steps { print }
' "$FILE" | grep -iE "\"[^\"]*%[^\"]*\"|\`[^\`]*%[^\`]*\`|\bhero[- ]line\b|\blabel\b|\bstring\b|\bCLI output\b|\breport line\b|\bstatus line\b" || true)

if [[ -n "$SRP01_DISPLAY_MOD" && -n "$LABEL01_STRING_EDIT" ]]; then
  record_trigger "LABEL-01"
  require_bullet "LABEL-01" "**Label-formula alignment:**" \
    "task modifies a formatter/diagnostic file AND edits a user-visible string. Add a table with columns [label-fragment | formula | denominator | unit] so reviewers can verify each label maps to exactly one formula and one unit." \
    "Label-formula alignment"
fi

# === BRAND-01: Brand invariant cite ===========================================
# Trigger: task text references a branded type defined under
# shared/src/core/types/. Forces planner to open the brand file and confirm
# the domain (ratio vs percent, ms vs sec) by quoting the // invariant comment.
BRAND_TYPES=$(grep -rhoE "^export type [A-Z][A-Za-z0-9]+ = Brand<" \
  "${PROJECT_ROOT}/shared/src/core/types" 2>/dev/null |
  sed -E 's/^export type ([A-Z][A-Za-z0-9]+) = Brand<.*/\1/' | sort -u || true)

BRAND01_USED=""
while IFS= read -r b; do
  [[ -z "$b" ]] && continue
  if grep -qE "\b${b}\b" "$FILE"; then
    BRAND01_USED="${BRAND01_USED}${b} "
  fi
done <<< "$BRAND_TYPES"

if [[ -n "$BRAND01_USED" ]]; then
  record_trigger "BRAND-01"
  require_bullet "BRAND-01" "**Brand invariant cite:**" \
    "task uses branded type(s) [${BRAND01_USED% }]. Quote the one-line // invariant that sits directly above the matching 'export type <Brand> = Brand<...>' line in shared/src/core/types/ byte-for-byte. No paraphrase. Forces the planner to verify domain/unit against the declaration." \
    "Brand invariant cite"
fi

# === DIP-01: new outside composition root =====================================
# Trigger: task Interface or Steps construct a service via `new X()` AND the
# Files table does NOT include mcp/src/server.ts as a Modify target.
DIP01_NEW=$(printf '%s\n' "$CODE" | grep -E "\bnew [A-Z][A-Za-z0-9_]+\s*\(" || true)
DIP01_ROOT_MOD=$(awk '
  BEGIN { in_files = 0 }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|/ && /Modify/ { print }
' "$FILE" | grep -E "mcp/src/server\.ts" || true)

if [[ -n "$DIP01_NEW" && -z "$DIP01_ROOT_MOD" ]]; then
  record_trigger "DIP-01"
  require_bullet "DIP-01" "**DIP exception:**" \
    "task constructs a service via \`new X()\` outside mcp/src/server.ts. Move the construction to the composition root and inject via ctor, OR justify the exception (aic-mcp.mdc §Composition Root Discipline)." \
    "DIP exception"
fi

# === OCP-01: Pipeline class mutation ==========================================
# Trigger: Files table modifies a non-test, non-interface file under
# shared/src/pipeline/ AND Goal does not begin with "Add/Introduce/Create".
OCP01_PIPE_MOD=$(awk '
  BEGIN { in_files = 0 }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|/ && /Modify/ { print }
' "$FILE" |
  grep -E "shared/src/pipeline/[^|]*\.ts" |
  grep -vE "__tests__|\.interface\.ts|\.test\.ts" || true)

GOAL_LINE=$(awk '
  /^## Goal/ { in_goal = 1; next }
  /^## / && in_goal { exit }
  in_goal && NF { print; exit }
' "$FILE")

if [[ -n "$OCP01_PIPE_MOD" ]] && ! echo "$GOAL_LINE" | grep -qiE "^(add |introduce |create )"; then
  record_trigger "OCP-01"
  require_bullet "OCP-01" "**OCP exception:**" \
    "task modifies a non-test pipeline class AND Goal is not 'Add/Introduce/Create ...'. Prefer a new class implementing the existing interface, OR justify the exception (aic-pipeline.mdc §OCP)." \
    "OCP exception"
fi

# === SCOPE-01: Query scope declaration ========================================
# Trigger: task Modifies any storage module AND Steps add or change a SQL
# statement. All per-project queries must be WHERE project_id = ?.
SCOPE01_STORAGE_MOD=$(awk '
  BEGIN { in_files = 0 }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|/ && /Modify/ { print }
' "$FILE" | grep -E "shared/src/storage/[^|]*\.ts" | grep -vE "__tests__|\.test\.ts" || true)

SCOPE01_SQL=$(awk '
  /^## Steps/ { in_steps = 1; next }
  /^## / && in_steps { in_steps = 0 }
  in_steps { print }
' "$FILE" | grep -iE "\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b" || true)

if [[ -n "$SCOPE01_STORAGE_MOD" && -n "$SCOPE01_SQL" ]]; then
  record_trigger "SCOPE-01"
  require_bullet "SCOPE-01" "**Query scope:**" \
    "task modifies a storage module AND Steps reference SQL. State the scope for every added/modified statement: 'project-scoped (WHERE project_id = ?)', 'global', or 'session' — name the column or join that enforces the scope." \
    "Query scope"
fi

# === PERSIST-01: Persisted/displayed parity ===================================
# Trigger: Files table lists BOTH a formatter/diagnostic file AND a storage or
# migration file. Single computation site required.
PERSIST01_PERSIST_MOD=$(awk '
  BEGIN { in_files = 0 }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|/ { print }
' "$FILE" | grep -E "shared/src/storage/(migrations/[^|]*\.ts|[^|]*-store\.ts|[^|]*-snapshot[^|]*\.ts)" || true)

if [[ -n "$SRP01_DISPLAY_MOD" && -n "$PERSIST01_PERSIST_MOD" ]]; then
  record_trigger "PERSIST-01"
  require_bullet "PERSIST-01" "**Persistence-display parity:** OR **Recompute-from-log note:**" \
    "task touches BOTH a formatter and a storage/migration file. Either (a) declare the single computation site both sides read from (parity), or (b) explain why the persisted column cannot be retroactively corrected and register a recompute-from-compilation_log follow-up." \
    "Persistence-display parity" "Recompute-from-log note"
fi

# ==============================================================================
# Emit structured gate-log record — planner/executor read this to dispatch the
# measurement-consistency critic mechanically, without LLM judgement. The
# critic runs iff ANY trigger fired: each of the 8 checks in the prompt is
# gated on its own trigger being present in `triggers_fired`, so gating the
# whole critic on a subset would leave Checks 2 / 6 / 7 / 8 unreachable.
# ==============================================================================
CRITIC_REQUIRED="false"
for t in $TRIGGERS_FIRED; do
  [[ -n "$t" ]] && CRITIC_REQUIRED="true" && break
done

json_array() {
  local out="["
  local first=1
  local item
  for item in $1; do
    [[ -z "$item" ]] && continue
    if [[ $first -eq 1 ]]; then
      out="${out}\"${item}\""
      first=0
    else
      out="${out},\"${item}\""
    fi
  done
  out="${out}]"
  printf '%s' "$out"
}

TRIGGERS_JSON=$(json_array "$TRIGGERS_FIRED")
MISSING_JSON=$(json_array "$MISSING_BULLETS")
EXEMPTED_JSON=$(json_array "$EXEMPTED")

if [[ "$FILE" = /* ]]; then
  ABS_TARGET="$FILE"
else
  ABS_TARGET="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
fi
ART=$(printf '%s' "$ABS_TARGET" | sed 's/\\/\\\\/g; s/"/\\"/g')

STATUS="ok"
[[ $ISSUES -gt 0 ]] && STATUS="fail"

TS=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
mkdir -p .aic
printf '{"ts":"%s","gate":"architectural-invariants","target":"%s","status":"%s","triggers_fired":%s,"missing_bullets":%s,"exempted":%s,"critic_required":%s}\n' \
  "$TS" "$ART" "$STATUS" "$TRIGGERS_JSON" "$MISSING_JSON" "$EXEMPTED_JSON" "$CRITIC_REQUIRED" \
  >> .aic/gate-log.jsonl

if [[ $ISSUES -gt 0 ]]; then
  echo ""
  echo "architectural-invariants: ${ISSUES} violation(s) in ${FILE}"
  echo "architectural-invariants: add the named bullet(s) above somewhere in the task file. The script accepts any of: ## Architecture Notes, a ## Steps line, a ## Files row description cell, or a ## Goal line. Pattern matched: ^(-\s+)?\*\*<Name>:\*\* — case-sensitive. Then re-run."
  exit 1
fi

if [[ "$CRITIC_REQUIRED" = "true" ]]; then
  echo "architectural-invariants: ${FILE} clean — critic required (triggers: ${TRIGGERS_FIRED% })"
else
  echo "architectural-invariants: ${FILE} clean"
fi
exit 0
