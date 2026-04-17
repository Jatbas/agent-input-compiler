---
name: aic-pr-review
description: Review pull requests against AIC architectural conventions, type safety, security, and style rules.
editors: all
---

# PR Review (SKILL.md)

## QUICK CARD

- **Purpose:** Produce a structured PR review with HARD / SOFT findings, each cited.
- **Inputs:** PR number (`gh pr view <id>`) or a branch diff (`git diff <base>...HEAD`).
- **Outputs:** The posted review summary (delivered back to the user or `gh pr review`). The three subagent reports and cached diff are scratch under `.aic/runs/<run-id>/` and removed on run-complete. Pass `--keep-artifacts` to retain for debugging.
- **Non-skippable steps:** Classify mode → Fetch diff → Dispatch 3 subagents in parallel → Merge findings → Write summary.
- **Mechanical gates:** Every HARD finding must cite `file:line` from the diff. The merge step runs `bash .claude/skills/shared/scripts/evidence-scan.sh <review-summary>`.
- **Checkpoint lines:** Emit at each phase; `checkpoint-log.sh aic-pr-review <phase>`.
- **Degraded mode:** If subagent dispatch is unavailable, run the three subagent check-lists sequentially against the diff, using the same prompt files as rubrics.

## Severity vocabulary (only two tiers)

- **HARD** — blocks merge (ESLint rule broken, security invariant violated, storage boundary crossed, missing test for behavioural change).
- **SOFT** — improvement recommendation (style drift, test-case gap, commit message formatting).

No other tiers. Do not use "Critical", "Important", "Minor", "Nit" — collapse into HARD / SOFT.

## HARD RULES

1. **Dispatch all three subagents.** Arch-safety, storage-security, testing-conventions. Skipping one is a HARD failure of the review.
2. **Every finding cites `file:line` from the PR diff** plus (where relevant) the convention source (`shared/src/...` or `.cursor/rules/...`).
3. **No hand-waving.** "Looks good" or "LGTM" without an explicit pass list is rejected; use the pass list in the summary.
4. **Never approve a PR that adds `eslint-disable`, `@ts-ignore`, `@ts-nocheck`, or `--no-verify`.** Automatic HARD finding.
5. **Never approve a PR that adds a `let` in production code outside the allowed boolean-flag exception.**
6. **Cited evidence must be fresh.** Run the code / read the file during the review; never trust memory.
7. **HARD vs SOFT classification is a routed decision.** For each finding, dispatch a subagent rendered from `../shared/prompts/ask-stronger-model.md` with the strongest available model. The orchestrator never classifies severity inline. See `../shared/SKILL-routing.md`.
8. **Before writing the summary,** read the canonical example at `examples/review-summary-example.md` (TODO: author) and imitate its structure. Until authored, imitate the pass-list / HARD list / SOFT list / strong-points layout described in `SKILL-checklist.md`.

## GUIDANCE

- Prefer stating the exact fix with code.
- Group SOFT findings by file to save reader attention.
- Acknowledge well-done sections in a short "Strong points" list.

## Autonomous execution

Run continuously. Stop only when:

- The diff is too large for one pass (> 3000 lines) → partition by directory, dispatch subagents per partition.
- Subagents disagree materially on a finding → surface the disagreement in the summary; do not silently merge.

## When to use

- A pending PR on GitHub.
- A feature branch awaiting merge.
- A community contribution needing evaluation.

## When NOT to use

- Writing the PR yourself (just follow project conventions).
- Debugging a bug (use `aic-systematic-debugging`).

## Process overview (inline phases)

Checklist-level detail lives in `SKILL-checklist.md`. The phases below are executed sequentially with a checkpoint after each.

1. **Classify mode** — PR (`gh pr view <id>`), branch diff (`git diff <base>...HEAD`), or a local working tree. Record the mode and the base ref. Checkpoint: `mode-classified`.
2. **Fetch diff** — obtain the unified diff and the list of changed files. For GitHub PRs use `gh pr diff <id>`; for a branch use `git diff <base>...HEAD`. Write the diff to `.aic/runs/<run-id>/diff.patch`. Checkpoint: `diff-fetched`.
3. **Dispatch subagents** — in parallel, spawn three subagents with the templates in `prompts/`: `arch-safety.md`, `storage-security.md`, `testing-conventions.md`. Substitute `{{PR_ID}}`, `{{DIFF_PATH}}`, `{{FILES_CHANGED}}`, `{{BASE_BRANCH}}`, `{{BUDGET}}`, `{{OUTPUT_PATH}}`. Verify no `{{` remains in any rendered prompt. Checkpoint: `subagents-complete`.
4. **Merge findings + write summary** — concatenate the three reports, deduplicate findings that cross categories, order HARD findings before SOFT, write a top-level summary (one-line verdict, pass list, HARD list, SOFT list, strong points). Run `bash .claude/skills/shared/scripts/evidence-scan.sh <summary-path>`. Checkpoint: `review-drafted`.
5. **Deliver** — paste the summary back to the user or post as a PR comment (`gh pr review`). Checkpoint: `review-delivered`.

Every intermediate artifact (the three subagent reports, `diff.patch`, rendered prompts, merge workspace) lives under `.aic/runs/<run-id>/`. Never write them under `documentation/` or anywhere else in the working tree. Under the runner, `advance` on the final phase auto-removes the scratch dir + state file (`--keep-artifacts` disables it, `skill-run.cjs cleanup <run-id>` finishes the job later). Inline: `rm -rf .aic/runs/<run-id>/` once the review is delivered.

## Subagent dispatch

Templates in `prompts/`:

- `arch-safety.md` — hexagonal boundaries, DI, determinism, immutability, errors, security.
- `storage-security.md` — SQL boundary, migrations, IDs, telemetry sanitation.
- `testing-conventions.md` — test parity, file naming, type safety, lint bypass.

Substitute `{{PR_ID}}`, `{{DIFF_PATH}}`, `{{FILES_CHANGED}}`, `{{BASE_BRANCH}}`, `{{BUDGET}}`, `{{OUTPUT_PATH}}` before dispatch.

## Failure patterns

- Finding 100 SOFT items and missing the one HARD finding.
- Approving a PR because "tests pass" without checking whether _new_ tests cover the change.
- Failing to cite `file:line` — the reviewer dismisses the finding and ships the defect.

## Output checklist

- [ ] Three subagent reports lived under `.aic/runs/<run-id>/` during the review; none under `documentation/`.
- [ ] Review summary lists every HARD finding with a fix.
- [ ] Every finding cites `file:line` (run `evidence-scan.sh`).
- [ ] Five checkpoint lines in `.aic/skill-log.jsonl`.
- [ ] Final verdict: `approve`, `approve-with-nits`, `request-changes`, or `reject`.
- [ ] On run-complete: scratch at `.aic/runs/<run-id>/` is removed (auto under the runner, or `skill-run.cjs cleanup <run-id>`).
