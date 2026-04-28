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
#   - AN-lite: every `Source:` path in the task body exists on disk
#   - AN-table: every path in the `## Files` table exists on disk when the
#     Action is Modify/Verify/Delete/Replace/Rename
#   - AR: multi-line documentation changes in Steps must route to
#     `aic-documentation-writer` via `## Follow-up Items` or justify inline
#     authorship via a `**Documentation routing:**` bullet
#   - AT: Files table ≤ 10 rows (HARD RULE 6 "Max ten files per task")
#   - AU: Step complexity — each numbered step under `## Steps` may
#     reference at most 1 distinct source path and fewer than 4 distinct
#     `line N` anchors (HARD RULE 6 "One file per step. Max two methods
#     per step."). Heuristic; ≥ 2 distinct paths or ≥ 4 line anchors fails.
#   - AV: Test-surface coverage (HARD RULE 25, task-file-inferred) — for
#     every `Modify` row whose path is a production `.ts` under `shared/src/`
#     or `mcp/src/`, if a sibling `__tests__/<name>.test.ts` exists on
#     disk, the test path must also appear somewhere in the task file
#     (Files table, Architecture Notes bullet, Follow-up Items). An
#     explicit `**Test-surface excluded:**` bullet naming the path opts out.
#   - AX: Composition-root placement feasibility — server.ts after/before
#     wiring instructions must include a placement bullet and cannot target
#     a call inside createMcpServer "after createMcpServer returns".
#   - AY: Acceptance proof contract — task-specific acceptance criteria must
#     name concrete proof artifacts; generic toolchain bullets alone fail.

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

# 12. Files table path existence (AN-table)
# Every backtick-quoted path in the second column of the `## Files` table must
# exist on disk when the Action in the first column is Modify/Verify/Delete/
# Replace/Rename. Create rows are skipped (they legitimately reference paths
# that do not yet exist). Table header and separator rows are filtered by the
# action whitelist in the case statement. Closes the drift observed in task
# 333 where the Files table cited `mcp/src/server.test.ts` (not on disk) while
# the real path `mcp/src/__tests__/server.test.ts` appeared only in the Tests
# section.
while IFS= read -r raw; do
  [[ -z "$raw" ]] && continue
  LN="${raw%%|*}"
  REST="${raw#*|}"
  ACTION=$(echo "$REST" | sed -nE 's/^[[:space:]]*\|[[:space:]]*([A-Za-z]+)[[:space:]]*\|.*/\1/p')
  PATH_REF=$(echo "$REST" | sed -nE 's/^[[:space:]]*\|[[:space:]]*[A-Za-z]+[[:space:]]*\|[[:space:]]*`([^`]+)`.*/\1/p')
  [[ -z "$ACTION" || -z "$PATH_REF" ]] && continue
  if [[ "$PATH_REF" = /* ]]; then
    FULL_PATH="$PATH_REF"
  else
    FULL_PATH="${PROJECT_ROOT}/${PATH_REF}"
  fi
  case "$ACTION" in
    Modify|Verify|Delete|Replace|Rename)
      if [[ ! -e "$FULL_PATH" ]]; then
        echo "Files table path not found (AN-table) at ${FILE}:${LN}: action=${ACTION} path=${PATH_REF}"
        ISSUES=$((ISSUES + 1))
      fi
      ;;
    *)
      ;;
  esac
done < <(awk '
  BEGIN { in_files = 0; in_fence = 0 }
  /^```/ { in_fence = 1 - in_fence; next }
  in_fence { next }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|/ { print NR "|" $0 }
' "$FILE")

# 13. Documentation routing (AR)
# If the task's Steps section contains block-insertion language for markdown
# docs (capturing CLI output, inserting a ####-level section, appending a
# named section to a .md, authoring a fenced sample), the task must either
# route that work to `aic-documentation-writer` via `## Follow-up Items`, or
# justify inline authorship via a `**Documentation routing:**` bullet in
# `## Architecture Notes`. One-line substring edits (single-word renames,
# single-line copy tweaks) do not trigger this check. Closes the drift
# observed in task 333 where a 15-line README sample insertion was bundled
# inline without routing.
STEPS_DOC_BLOCK=$(awk '
  BEGIN { in_steps = 0; fence = 0 }
  /^## Steps/ { in_steps = 1; next }
  /^## / && in_steps { in_steps = 0 }
  /^```/ { fence = 1 - fence; next }
  in_steps && fence == 0 { print }
' "$FILE" | grep -inE "(capture stdout|insert[^.]*#### |append[^.]*section[^.]*\.md|fenced[^.]*sample|new[[:space:]]+#### |insert[^.]*into[^.]*README)" || true)
if [[ -n "$STEPS_DOC_BLOCK" ]]; then
  if ! grep -qE "aic-documentation-writer" "$FILE" \
     && ! grep -qE "^\*\*Documentation routing:\*\*|^-[[:space:]]+\*\*Documentation routing:\*\*" "$FILE"; then
    echo "documentation routing missing (AR) — Steps reference multi-line doc changes (block insertion, sample capture, section authoring) but the task does not route to aic-documentation-writer in ## Follow-up Items, nor justify inline authorship via a **Documentation routing:** bullet in ## Architecture Notes. Triggering lines:"
    echo "$STEPS_DOC_BLOCK"
    ISSUES=$((ISSUES + 1))
  fi
fi

# 14. Files-table row cap (AT) — HARD RULE 6 "Max ten files per task."
# Count rows in the `## Files` table whose Action is a real action verb
# (Create/Modify/Verify/Delete/Replace/Rename). Header and separator rows
# are filtered by the action whitelist. Hard cap at 10 — no inline escape
# hatch; exceeding it signals the task must be split.
FILES_ROW_COUNT=$(awk '
  BEGIN { in_files = 0; in_fence = 0; n = 0 }
  /^```/ { in_fence = 1 - in_fence; next }
  in_fence { next }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|[[:space:]]*(Create|Modify|Verify|Delete|Replace|Rename)[[:space:]]*\|/ { n++ }
  END { print n + 0 }
' "$FILE")
if [[ "${FILES_ROW_COUNT:-0}" -gt 10 ]]; then
  echo "Files table exceeds HARD RULE 6 cap (AT) — ${FILES_ROW_COUNT} rows > 10 max. Split into multiple tasks."
  ISSUES=$((ISSUES + 1))
fi

# 15. Step complexity (AU) — HARD RULE 6 "One file per step. Max two
# methods per step." For every numbered step under `## Steps`, count
# distinct backtick-quoted source paths (ending in .ts/.cjs/.mjs/.cts/.mts)
# referenced in the step body that appear in the task's Files table as
# an actionable row. Paths outside the Files table are treated as
# references (pattern sources, cross-file context, fixture literals) and
# ignored — only Files-table paths represent step targets. ≥ 2 distinct
# Files-table paths in a single step fails. Separately count distinct
# `line N` / `lines N-M` / `at line N` anchors; ≥ 4 distinct anchors in
# one step heuristically indicates >2 methods touched, fail.
AU_FILES_TABLE_PATHS=$(awk '
  BEGIN { in_files = 0; in_fence = 0 }
  /^```/ { in_fence = 1 - in_fence; next }
  in_fence { next }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|/ {
    match($0, /`[^` 	]+\.(ts|cjs|mjs|cts|mts)`/)
    if (RSTART > 0) print substr($0, RSTART + 1, RLENGTH - 2)
  }
' "$FILE")
AU_RAW=$(awk '
  BEGIN { in_steps = 0; in_fence = 0; step_num = 0; body = "" }
  function flush(   tmp, tok, i) {
    if (step_num == 0) { body = ""; return }
    tmp = body
    while (match(tmp, /`[^` 	]+\.(ts|cjs|mjs|cts|mts)`/)) {
      tok = substr(tmp, RSTART + 1, RLENGTH - 2)
      print "PATH " step_num " " tok
      tmp = substr(tmp, RSTART + RLENGTH)
    }
    tmp = body
    while (match(tmp, /line[s]?[[:space:]]+`?[0-9]+(-[0-9]+)?`?/)) {
      tok = substr(tmp, RSTART, RLENGTH)
      gsub(/`/, "", tok)
      print "ANCHOR " step_num " " tok
      tmp = substr(tmp, RSTART + RLENGTH)
    }
    body = ""
  }
  /^## Steps/ { in_steps = 1; next }
  /^## / && in_steps { flush(); in_steps = 0 }
  !in_steps { next }
  /^```/ { in_fence = 1 - in_fence; body = body " " $0; next }
  /^[0-9]+\.[[:space:]]/ {
    flush()
    step_num++
    body = $0
    next
  }
  { body = body " " $0 }
  END { flush() }
' "$FILE")
AU_OUT=$(
  {
    echo "$AU_FILES_TABLE_PATHS" | awk 'NF { print "FT " $0 }'
    echo "$AU_RAW"
  } | awk '
    BEGIN { }
    $1 == "FT" { ft[$2] = 1; next }
    $1 == "PATH" {
      step = $2
      path = $3
      key = step "|" path
      if (key in seen_pp) next
      seen_pp[key] = 1
      if (!(path in ft)) next
      pp_count[step]++
      if (pp_list[step] == "") pp_list[step] = "\n    " path
      else pp_list[step] = pp_list[step] "\n    " path
      next
    }
    $1 == "ANCHOR" {
      step = $2
      anch = $3
      if ($4 != "") anch = anch " " $4
      key = step "|" anch
      if (key in seen_aa) next
      seen_aa[key] = 1
      aa_count[step]++
      if (aa_list[step] == "") aa_list[step] = "\n    " anch
      else aa_list[step] = aa_list[step] "\n    " anch
    }
    END {
      for (s in pp_count) if (pp_count[s] >= 2) {
        print "step " s " references " pp_count[s] " distinct source paths (HARD RULE 6 — one file per step):" pp_list[s]
      }
      for (s in aa_count) if (aa_count[s] >= 4) {
        print "step " s " references " aa_count[s] " distinct line anchors — likely touches >2 methods (HARD RULE 6):" aa_list[s]
      }
    }
  '
)
if [[ -n "$AU_OUT" ]]; then
  echo "step complexity (AU):"
  echo "$AU_OUT"
  ISSUES=$((ISSUES + 1))
fi

# 16. Test-surface sibling coverage (AV) — HARD RULE 25 task-file
# inferred layer. For every `Modify` row whose path is a non-test .ts
# file under `shared/src/` or `mcp/src/`, infer the candidate sibling
# test path `<dir>/__tests__/<basename>.test.ts`. If that sibling exists
# on disk, the task must mention the sibling path anywhere — Files
# table, Architecture Notes, Follow-up Items — OR declare an explicit
# `**Test-surface excluded:**` bullet naming the sibling and the reason
# (e.g. "type-only rename; no assertion touches the renamed identifier").
while IFS= read -r raw; do
  [[ -z "$raw" ]] && continue
  LN="${raw%%|*}"
  REST="${raw#*|}"
  ACTION=$(echo "$REST" | sed -nE 's/^[[:space:]]*\|[[:space:]]*([A-Za-z]+)[[:space:]]*\|.*/\1/p')
  PATH_REF=$(echo "$REST" | sed -nE 's/^[[:space:]]*\|[[:space:]]*[A-Za-z]+[[:space:]]*\|[[:space:]]*`([^`]+)`.*/\1/p')
  [[ "$ACTION" != "Modify" ]] && continue
  [[ -z "$PATH_REF" ]] && continue
  case "$PATH_REF" in
    *.test.ts|*.test.cjs|*.test.mjs|*.interface.ts) continue ;;
    shared/src/*|mcp/src/*) ;;
    *) continue ;;
  esac
  case "$PATH_REF" in
    *.ts) ;;
    *) continue ;;
  esac
  DIR=$(dirname "$PATH_REF")
  STEM=$(basename "$PATH_REF" .ts)
  CAND1="${DIR}/__tests__/${STEM}.test.ts"
  CAND2="${DIR}/${STEM}.test.ts"
  for CAND in "$CAND1" "$CAND2"; do
    [[ -f "${PROJECT_ROOT}/${CAND}" ]] || continue
    if grep -qF "\`${CAND}\`" "$FILE"; then
      continue
    fi
    if grep -qF "${CAND}" "$FILE"; then
      continue
    fi
    if grep -qE "^-[[:space:]]+\*\*Test-surface excluded:\*\*" "$FILE" \
       && grep -qF "${CAND}" "$FILE"; then
      continue
    fi
    echo "test-surface sibling not in task (AV) at ${FILE}:${LN}: Modify ${PATH_REF} has sibling test ${CAND} on disk but the test path is not listed in the Files table, Architecture Notes, or a **Test-surface excluded:** bullet"
    ISSUES=$((ISSUES + 1))
  done
done < <(awk '
  BEGIN { in_files = 0; in_fence = 0 }
  /^```/ { in_fence = 1 - in_fence; next }
  in_fence { next }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|/ { print NR "|" $0 }
' "$FILE")

# 17. Composition-root placement feasibility (AX)
# Composition-root tasks often need "insert A after anchor B and before anchor C"
# instructions. The ambiguity scan catches vague choices, not impossible control
# flow such as placing code inside createMcpServer after createMcpServer returns.
SERVER_TS_MOD=$(awk '
  BEGIN { in_files = 0; in_fence = 0 }
  /^```/ { in_fence = 1 - in_fence; next }
  in_fence { next }
  /^## Files/ { in_files = 1; next }
  /^## / && in_files { in_files = 0 }
  in_files && /^\|/ && /Modify/ && /`mcp\/src\/server\.ts`/ { found = 1 }
  END { print found ? "yes" : "" }
' "$FILE")
if [[ -n "$SERVER_TS_MOD" ]]; then
  STEPS_PROSE=$(awk '
    BEGIN { in_steps = 0; fence = 0 }
    /^## Steps/ { in_steps = 1; next }
    /^## / && in_steps { in_steps = 0 }
    /^```/ { fence = 1 - fence; next }
    in_steps && fence == 0 { print }
  ' "$FILE")
  IMPOSSIBLE_PLACEMENT=$(printf '%s\n' "$STEPS_PROSE" |
    grep -inE "after .*createMcpServer.*returns?.*createCompileHandler|createCompileHandler.*after .*createMcpServer.*returns?" || true)
  if [[ -n "$IMPOSSIBLE_PLACEMENT" ]]; then
    echo "composition-root placement impossible (AX) — instruction targets createCompileHandler inside createMcpServer after createMcpServer returns:"
    echo "$IMPOSSIBLE_PLACEMENT"
    ISSUES=$((ISSUES + 1))
  fi
  ORDERED_WIRING=$(printf '%s\n' "$STEPS_PROSE" |
    grep -inE "\b(after|before)\b.*\b(after|before)\b.*(createCompileHandler|registerTool|new McpServer|listRoots)|\b(createCompileHandler|registerTool|new McpServer|listRoots)\b.*\b(after|before)\b.*\b(after|before)\b" || true)
  if [[ -n "$ORDERED_WIRING" ]] &&
     ! grep -qE "^(-[[:space:]]+)?\*\*Composition root placement:\*\*" "$FILE"; then
    echo "composition-root placement missing (AX) — ordered server.ts wiring instructions need a **Composition root placement:** bullet naming the target function, after-anchor, before-anchor, and insertion point:"
    echo "$ORDERED_WIRING"
    ISSUES=$((ISSUES + 1))
  fi
fi

# 18. Acceptance proof contract (AY)
# Acceptance Criteria are the executor's post-implementation obligations. Generic
# toolchain bullets are necessary, but cannot be the only proof that the task's
# behavior changed as intended.
AC_BULLETS=0
AC_NON_GENERIC_PROOF=0
AC_MISSING_PROOF=""
while IFS='|' read -r tag ln generic proof line; do
  [[ "$tag" == "BULLET" ]] || continue
  AC_BULLETS=$((AC_BULLETS + 1))
  if [[ "$generic" == "0" && "$proof" == "1" ]]; then
    AC_NON_GENERIC_PROOF=$((AC_NON_GENERIC_PROOF + 1))
  fi
  if [[ "$generic" == "0" && "$proof" == "0" ]]; then
    AC_MISSING_PROOF="${AC_MISSING_PROOF}${ln}: ${line}"$'\n'
  fi
done < <(awk '
  BEGIN { in_acc = 0; fence = 0 }
  /^```/ { fence = 1 - fence; next }
  /^## Acceptance/ { in_acc = 1; next }
  /^## / && in_acc { in_acc = 0 }
  in_acc && fence == 0 && /^[[:space:]]*[-*][[:space:]]+(\[[ xX]\][[:space:]]+)?/ {
    line = $0
    generic = line ~ /(pnpm[[:space:]]+(lint|typecheck|test|knip)|lint reports zero|typecheck passes|test suite passes|knip reports|generic invariant|all tests pass)/
    proof = line ~ /(Proof:|`[^`]+`|[A-Za-z_][A-Za-z0-9_]*_[A-Za-z0-9_]+|schema|descriptor|payload|field|column|table|migration|CLI output|command output|log line|JSON field|MCP tool)/ || line ~ /[.](test[.](ts|js|cjs|mjs)|ts|js|cjs|mjs|json|md)/
    print "BULLET|" NR "|" (generic ? 1 : 0) "|" (proof ? 1 : 0) "|" line
  }
' "$FILE")
if [[ "$AC_BULLETS" -gt 0 && "$AC_NON_GENERIC_PROOF" -eq 0 ]]; then
  echo "acceptance proof missing (AY) — ## Acceptance Criteria contains no task-specific bullet with a concrete proof artifact; generic toolchain success alone is not proof"
  ISSUES=$((ISSUES + 1))
fi
if [[ -n "$AC_MISSING_PROOF" ]]; then
  echo "acceptance criteria without proof artifact (AY) — add Proof: with a named test, command output, source symbol, schema/descriptor field, payload field, log line, migration/schema row, MCP tool, or file path:"
  printf '%s' "$AC_MISSING_PROOF"
  ISSUES=$((ISSUES + 1))
fi

if [[ $ISSUES -gt 0 ]]; then
  echo ""
  echo "validate-task: ${ISSUES} issue group(s) in ${FILE}"
  exit 1
fi

echo "validate-task: ${FILE} clean"
exit 0
