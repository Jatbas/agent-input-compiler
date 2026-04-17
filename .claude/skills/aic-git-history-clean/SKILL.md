---
name: aic-git-history-clean
description: Produces feature-centric git history by grouping related commits, sanitizing messages, and placing version tags.
editors: all
---

# Git History Clean (SKILL.md)

## QUICK CARD

- **Purpose:** Rewrite a range of commits into a clean, feature-centric history before publishing or sharing.
- **Inputs:** Base ref (branch or SHA) to rewrite from; target ref (default: `HEAD`).
- **Outputs:** A new branch `clean/<base>-to-<target>-<timestamp>` with rewritten history; a plan artifact recording every decision.
- **Non-skippable steps:** Propose plan (grouping + messages) → validate plan → apply rewrite in a worktree → verify → hand off.
- **Mechanical gates:**
  `bash .claude/skills/shared/scripts/git-clean-plan-validate.sh <plan.tsv>` — validates every proposed message.
  Post-rewrite: `git diff <original-head> <new-head>` must be empty (content-preserving).
- **Checkpoint lines:** emit per phase; `checkpoint-log.sh`.
- **Degraded mode:** If interactive rebase is unavailable, use non-interactive `git rebase --onto` with a scripted commit sequence generated from the plan.

## Severity vocabulary (only two tiers)

- **HARD RULE** — enforced by `git-clean-plan-validate.sh` or by the content-diff gate.
- **GUIDANCE** — best practice.

## HARD RULES

1. **Content-preserving only.** The final tree must match the original tree at `<target>`. If the content diff is non-empty, abort.
2. **Never rewrite shared branches.** Operate on a new branch only. Do not force-push unless the user explicitly asks.
3. **Every message passes `git-clean-plan-validate.sh`.**
4. **Conventional format, ≤ 72 chars.**
5. **Preserve author and date.** Use `--committer-date-is-author-date` or equivalent.
6. **No internal codes in messages.** Strip `Phase X`, `Task N`, `AK01` before committing.
7. **Version tags only on significant feature commits.** Bumps and noise never carry version tags.

## GUIDANCE

- Squash "follow-up fix" commits into the feature they fix.
- Absorb merge commits unless the merge captures a meaningful branch-point.
- Rename "wip" / "chore: fmt" type commits even when they survive.

## Autonomous execution

Run continuously from planning through application. Stop only on:

- Plan validation failure.
- Non-empty content diff after rewrite.
- Conflict during cherry-pick that cannot be resolved mechanically.

## When to use

- Preparing a feature branch for merge into `main`.
- Cleaning a history before cutting a release.
- Rewriting imported history from a fork before merging.

## When NOT to use

- Rewriting commits already pushed to a shared branch (requires explicit user consent and force-push).
- Squashing for no reason — if history is already clean, do nothing.

## Process overview (inline phases)

1. **Inspect range** — list commits from `<base>` to `<target>` with `git log --oneline --graph <base>..<target>`. Record each commit's SHA, author, author-date, subject, and modified files. Checkpoint: `range-inspected`.
2. **Propose grouping** — cluster commits into features. Mark each commit as `keep` (stays as-is or becomes a new squash target) or `squash` (absorbed into a preceding keep). Noise rules: `wip`, `fmt`, `typo`, `chore: <no scope>`, single-file whitespace commits → squash. Checkpoint: `grouping-drafted`.
3. **Draft messages** — write one `type(scope): description` message per keep-commit. ≤ 72 chars, imperative, no period. Strip internal codes. Write the plan to `.aic/git-clean-plan/<timestamp>.tsv` (one line per commit: `keep|squash<TAB>message`). Checkpoint: `messages-drafted`.
4. **Validate plan** — run `bash .claude/skills/shared/scripts/git-clean-plan-validate.sh .aic/git-clean-plan/<timestamp>.tsv`. Must exit 0. Checkpoint: `plan-validated`.
5. **Apply** — create a new branch `clean/<base>-to-<target>-<timestamp>`. Cherry-pick keep-commits in order; for each keep followed by squashes, use `git commit --amend -C HEAD` after cherry-picking the squashes with `git cherry-pick -n`. Preserve author-date with `GIT_COMMITTER_DATE` = author date. Rewrite the message using the plan. Checkpoint: `rewrite-applied`.
6. **Verify content-preservation** — `git diff <original-target> HEAD` must be empty. If non-empty, abort and report the divergence. Checkpoint: `rewrite-verified`.
7. **Tag + deliver** — place version tags on the significant feature commits per the plan. Push the branch (never force-push `main`). Hand the branch + plan file to the user. Checkpoint: `handoff-complete`.

## Failure patterns

- Silent content drift (forgetting a squashed fix).
- Over-aggressive squashing that hides a meaningful decision point.
- Version tag on a noise commit.
- Pushing `main` before the user approves the plan.

## Output checklist

- [ ] `git diff <original> <rewritten>` is empty.
- [ ] Plan file saved under `.aic/git-clean-plan/<timestamp>.tsv`.
- [ ] All messages pass `git-clean-plan-validate.sh`.
- [ ] Seven checkpoint lines in `.aic/skill-log.jsonl`.
