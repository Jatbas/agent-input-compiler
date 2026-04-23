---
name: aic-code-audit
description: Scans a code surface area at scale — discovers real bugs, traces blast radius, and registers findings directly into Phase BUGS in aic-progress.md so you can act immediately with the right skill. Use this whenever the user wants to audit a directory, run a pre-release sweep, find systemic issues, or generate a batch of tracked fix entries. Trigger on "audit", "scan", "sweep", "find all bugs in", "what's broken in", "code health check", "pre-release check", "systematic review". Do NOT wait for the user to say "run aic-code-audit" — if they want bugs found at scale, this is the skill. Uniquely different from aic-pr-review (scans surface area, not a diff) and aic-systematic-debugging (discovery at scale, not deep investigation of one bug).
editors: all
---

# Code Audit (SKILL.md)

## QUICK CARD

- **Purpose:** Discover real bugs across a file surface area, trace blast radius, and register findings in Phase BUGS so the user knows exactly which skill to use next.
- **Inputs:** A scope (directory, file glob, or "whole repo"). Optional: focus area (e.g. "storage layer only").
- **Outputs:** New rows appended to the `## Phase BUGS` table in `documentation/tasks/progress/aic-progress.md`. One row per root cause. No permanent output other than Phase BUGS (scratch under `.aic/runs/<run-id>/` is removed on completion).
- **Non-skippable steps:** Scope resolution → Static analysis → Parallel subagent dispatch → Validate findings → Blast radius trace → Register in Phase BUGS.
- **Mechanical gates:**
  Static analysis runs before subagents. If `pnpm typecheck` or `pnpm lint` exits with parse errors, stop — the tree must compile before an audit is meaningful.
  Before registering any finding: confirm it is a real bug, not a false positive (see §Finding validation).
- **Checkpoint lines:** emit per phase; `bash checkpoint-log.sh aic-code-audit <phase> <artifact>` — three arguments required (skill, phase, artifact path or description).
- **Degraded mode:** No subagents → run the three check lists sequentially inline as self-review using the same prompt files as rubrics. Every other rule still applies.

## Severity vocabulary (four tiers)

- **Critical** — correctness bug, data-loss risk, or security vulnerability. Root cause may be unclear. Next skill: `aic-systematic-debugging`.
- **High** — architectural invariant violation or ESLint-enforced rule broken in a way that affects runtime behavior. Root cause is clear. Next skill: `aic-task-planner`.
- **Medium** — convention drift, test gap for existing behavior, pattern violation. Root cause is clear. Next skill: `aic-task-planner`.
- **Low** — naming, comment quality, minor nit. Can be batched. Next skill: `aic-task-planner`.

## HARD RULES

1. **Only register real bugs.** A finding that cannot be confirmed with `file:line` evidence is not registered. Suspected false positives are noted in `.aic/runs/<run-id>/discarded.txt` but never added to Phase BUGS.
2. **One entry per root cause.** If the same bug manifests in 9 files, that is one BUGS-XX entry with all 9 files in the blast radius — not 9 entries.
3. **Blast radius is mandatory.** Every entry lists the affected files. "Unknown" is not acceptable; if blast radius cannot be determined, register the entry with Next Skill = `aic-systematic-debugging` and note "blast radius unresolved" in the description — do not block the audit.
4. **Next Skill is mandatory.** Every entry carries either `aic-systematic-debugging` (root cause unclear or multi-layer correctness bug) or `aic-task-planner` (root cause clear, fix is mechanical or architectural).
5. **No fixing in this skill.** The audit registers findings only. Never edit source files.
6. **Chains are recognized and grouped.** If bugs share a root cause or must be fixed in a specific order, register them as a chain: mark the primary entry with `(chain: N)` and list the N linked entries in its description column.
7. **Phase BUGS is the only output.** No research notes, no task files, no intermediate reports. Scratch lives under `.aic/runs/<run-id>/` and is removed on completion.

## GUIDANCE

- Read `aic-pr-review/SKILL-checklist.md` before dispatching subagents — it is the canonical check list for all eight dimensions (A, T, E, D, S, X, V, C). Do not re-derive the checks from memory.
- Surface systemic patterns explicitly: "12 files call `Date.now()` directly" is one root cause, not 12.
- When a chain is detected, order the entries so the dependency direction is clear: BUGS-01 must be fixed before BUGS-02.
- Static analysis output (lint errors, typecheck errors) is strong evidence of real bugs — weight it accordingly.

## Autonomous execution

Run continuously from scope resolution through Phase BUGS registration. Stop only when:

- Scope is ambiguous and the working tree has >500 `.ts` files → ask the user to narrow scope.
- Scope resolves to 0 `.ts` files → emit "Scope resolved to 0 files — check directory path" and stop.
- Static analysis exits with parse errors → paste the errors and stop.
- Phase BUGS section is absent from `aic-progress.md` → create it at the end of the file, then continue.
- A finding's blast radius cannot be determined → register with Next Skill = `aic-systematic-debugging` and note "blast radius unresolved" in the description; continue.

## When to use

- Proactive audit of a directory, layer, or the whole repo.
- Pre-release sweep to catch regressions.
- Post-incident audit to find similar bugs across the surface area.
- Generating a batch of tracked defects for a new phase (see Phase BH as a reference — 13 linked defects discovered by a single audit sweep).

## When NOT to use

- Single known bug → use `aic-systematic-debugging`.
- Reviewing a PR diff → use `aic-pr-review`.
- Adding new features → use `aic-task-planner`.
- Research questions → use `aic-researcher`.

## Process overview (inline phases)

1. **Scope resolution** — Parse the user's scope argument:
   - **Directory or glob:** collect matching `.ts` files, excluding `__tests__/`, `node_modules/`, `.aic/`.
   - **Phase name** (e.g. "Phase BH", "audit Phase BH", "did BH land correctly?"): read all task files for that phase from `documentation/tasks/done/` (glob `done/*bh*.md` — lowercase, no leading-dash assumption; adapt the pattern to match the phase label, e.g. `done/*auth*.md` for Phase AUTH). Extract every path in their `## Files` tables with Action = Create/Modify/Replace. Use that as the scope. Emit: "Auditing N files touched by Phase BH".
   - **No scope provided:** default to `shared/src/` and `mcp/src/`.
     Pick scratch slug `.aic/runs/aic-code-audit-<utc-timestamp>/`. Emit to user: "Auditing N files in <scope>". Checkpoint: `bash checkpoint-log.sh aic-code-audit scope-resolved ".aic/runs/<run-id>/"`.

2. **Static analysis** — Always run `pnpm typecheck` (uses the project tsconfig; catches all type errors regardless of scope). For ESLint: run `npx eslint <directory-or-glob>` where `<directory-or-glob>` is the root directory or glob pattern from Phase 1 (pass the directory so ESLint applies its own traversal); if scope covers both `shared/` and `mcp/` in their entirety, use `pnpm lint` instead. Capture full stdout+stderr to `.aic/runs/<run-id>/static-analysis.txt`. Parse and count errors. If parse errors exist, stop (see §Autonomous execution). Typecheck and lint errors are high-confidence findings — carry them into Phase 3 as pre-confirmed candidates. Checkpoint: `bash checkpoint-log.sh aic-code-audit static-analysis-complete ".aic/runs/<run-id>/static-analysis.txt"`.

3. **Parallel subagent dispatch** — Before dispatch, define the substitution values:
   - `{{SCOPE_FILES}}` — newline-separated list of absolute file paths resolved in Phase 1.
   - `{{STATIC_OUTPUT_PATH}}` — `.aic/runs/<run-id>/static-analysis.txt` (written in Phase 2).
   - `{{OUTPUT_PATH}}` — subagent-specific: `.aic/runs/<run-id>/arch-invariants.md`, `.aic/runs/<run-id>/behavioral-logic.md`, `.aic/runs/<run-id>/security-privacy.md`.
   - `{{BUDGET}}` — 20 tool calls per subagent.

   Spawn three subagents simultaneously using templates in `prompts/`. For each:
   a. Read the template.
   b. Substitute all four placeholders with the values defined above.
   c. Verify `grep -q '{{' <rendered>` returns nothing before dispatch.
   Templates:
   - `prompts/arch-invariants.md` → dimensions A, T, D (architecture, types, determinism/immutability)
   - `prompts/behavioral-logic.md` → dimensions E, V + logic correctness (errors, tests, null gaps, async)
   - `prompts/security-privacy.md` → dimensions X, S (security, storage SQL boundary)
     Checkpoint: `bash checkpoint-log.sh aic-code-audit subagents-complete ".aic/runs/<run-id>/"`.

4. **Finding validation** — For each candidate finding from the three subagent reports and from static analysis: confirm with a direct file read at the cited `file:line`. If the code at that location does not match the finding description, discard as false positive. Pre-confirmed static analysis errors are already valid. Document discarded findings in `.aic/runs/<run-id>/discarded.txt` with reason. Checkpoint: `bash checkpoint-log.sh aic-code-audit findings-validated ".aic/runs/<run-id>/discarded.txt"`.

5. **Blast radius trace** — For each confirmed finding: grep the codebase for all callers, importers, and string-literal references. Record every affected file. If the same root cause appears in multiple files, group them into one entry. Detect chains: if fixing bug A requires bug B to be fixed first, mark them linked. Assign severity tier and Next Skill per §Severity vocabulary and §Next Skill routing. Write the merged findings (one entry per root cause with blast radius) to `.aic/runs/<run-id>/merged-findings.md`. Run `bash "$(git rev-parse --show-toplevel)/.claude/skills/shared/scripts/evidence-scan.sh" "$(git rev-parse --show-toplevel)/.aic/runs/<run-id>/merged-findings.md"` — every entry must cite `file:line`. Checkpoint: `bash checkpoint-log.sh aic-code-audit blast-radius-traced ".aic/runs/<run-id>/merged-findings.md"`.

6. **Register in Phase BUGS** — Read `.aic/runs/<run-id>/merged-findings.md` (written in Phase 5). Read `documentation/tasks/progress/aic-progress.md`. If `## Phase BUGS — Discovered Defects` section is absent, append it with the table header from §Phase BUGS entry format. Determine the next BUGS-NN ID by counting existing rows. Append one row per confirmed finding. Then update the header block: the header block is the large dense paragraph at the top of the file (before the `---` separator). Append one sentence to the end of that paragraph in the form: `**Audit <YYYY-MM-DD>:** Found N defects (X Critical, Y High, Z Medium) in <scope> — see Phase BUGS.` Run `bash checkpoint-log.sh aic-code-audit registered "documentation/tasks/progress/aic-progress.md"`. Then run `rm -rf .aic/runs/<run-id>/`.

## Phase BUGS entry format

The Phase BUGS section in `aic-progress.md` uses this table:

```markdown
## Phase BUGS — Discovered Defects

| Bug                | Severity | Blast Radius                                                       | Status     | Next Skill                 | Description                                                                             |
| ------------------ | -------- | ------------------------------------------------------------------ | ---------- | -------------------------- | --------------------------------------------------------------------------------------- |
| BUGS-01            | Critical | 4 files: `compilation-runner.ts`, `run-pipeline-steps.ts`, 2 tests | Discovered | `aic-systematic-debugging` | Null dereference when budget returns 0 — caller chain unguarded                         |
| BUGS-02 (chain: 3) | High     | 9 files in `adapters/` and `storage/`                              | Discovered | `aic-task-planner`         | `Date.now()` called directly — Clock not injected; BUGS-02a–02c are the three sub-sites |
| BUGS-03            | Medium   | 2 files: `compilation-log-store.ts`, its test                      | Discovered | `aic-task-planner`         | Missing `project_id` scope in `compilation_log` query                                   |
```

Rules for the table:

- **Bug column:** `BUGS-NN` for standalone; `BUGS-NN (chain: N)` for linked root causes.
- **Blast Radius column:** list file names (not full paths) plus count. If >5 files, list the 3 most critical and add "+ N more".
- **Status column:** always `Discovered` when the audit writes the row. The user or a subsequent skill updates it.
- **Next Skill column:** exactly `\`aic-systematic-debugging\``or`\`aic-task-planner\``. No other values.
- **Description column:** one line — root cause, not symptom.

## Next Skill routing

Assign `aic-systematic-debugging` when ANY of:

- Root cause is unclear after blast radius trace.
- The bug involves data corruption, incorrect persisted values, or silent wrong results.
- Data-loss or correctness risk is present — even when root cause is otherwise clear.
- The bug requires reproducing a specific input to confirm it exists.
- The fix order is unclear because bugs form a cycle or deep chain.

Assign `aic-task-planner` when ALL of:

- Root cause is clear and confirmed at `file:line`.
- The fix is mechanical: swap `Date.now()` for `Clock`, add `project_id` guard, extract interface, etc.
- Blast radius is fully known.
- No data-loss or correctness risk.

When in doubt, assign `aic-systematic-debugging` — it is cheaper to investigate than to plan a fix for the wrong root cause.

## Failure patterns

- Registering a finding without confirming it at `file:line` — creates noise in Phase BUGS.
- Creating one BUGS-XX per file instead of per root cause — floods the table.
- Assigning `aic-task-planner` to a bug whose root cause is unclear — the planner cannot plan what it cannot understand.
- Writing intermediate artifacts to `documentation/` instead of `.aic/runs/<run-id>/`.
- Editing source files during the audit — this skill discovers, never fixes.

## Output checklist

- [ ] Every BUGS-XX row cites `file:line` evidence (confirmed by direct read, not subagent assertion).
- [ ] Every BUGS-XX row has a Blast Radius listing specific files.
- [ ] Every BUGS-XX row has a Next Skill (`aic-systematic-debugging` or `aic-task-planner`).
- [ ] Chains are marked with `(chain: N)` and the linked entries are noted in description.
- [ ] Phase BUGS section exists in `aic-progress.md` and is correctly formatted.
- [ ] Header block at top of `aic-progress.md` updated with one-line audit summary.
- [ ] Six checkpoint lines in `.aic/skill-log.jsonl`.
- [ ] Scratch at `.aic/runs/<run-id>/` removed on run-complete.
