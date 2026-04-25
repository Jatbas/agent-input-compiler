# Phase 5: Finalize and Merge

### 5. Finalize

When all dimensions are confirmed clean, complete these three sub-steps in order.

**5a — Report to the user:**

- What was implemented (files created/modified)
- Test results (pass count, confirming no regressions) — for code tasks and mixed tasks. For pure documentation tasks: subagent verification results instead.
- **First-pass quality: N/M** (from §4c or §4-doc-d or §4-mixed-d, where M = applicable dimensions) — list any dimensions that needed fixing and what was fixed. For mixed tasks, report code and documentation dimensions separately: "Code: N/M first-pass clean. Docs: N/M first-pass clean."
- **Benchmark impact** (benchmark/transformer tasks only): "[benchmark name]: baseline/artifact X → Y (delta: -Z%) / unchanged." Include this only when dimension 16 applied.
- **Verification subagent results** (doc/mixed tasks): writing quality, factual accuracy, consistency, reader simulation findings
- **Pre-existing issues** (doc/mixed, informational): GAP/TODO/FIXME markers, stale phase refs outside task scope
- **Scope-adjacent consistency** (doc/mixed): dim-8 findings — stale/contradicted concepts in same document
- **Cross-doc term ripple** (doc/mixed): dim-11 findings — stale old terms in other docs (follow-up items)
- **Intra-doc consistency** (doc/mixed): dim-12 findings — same-document contradictions
- **Parallel section notes** (doc/mixed): sibling section asymmetry flagged by Critic 1
- Review findings and fixes applied (if any)
- Any concerns or follow-up items

**5b — Update progress.**

Use the `aic-update-progress` skill to update `documentation/tasks/progress/aic-progress.md`.

**Main workspace only** — this file is gitignored. Edit in main workspace, not worktree. Do NOT stage or commit.

**Daily log deduplication:** Grep for `### YYYY-MM-DD` with today's date. If exists, append to existing entry. If not, create new heading. Verify exactly one heading for today after edit.

**5c — Commit and prepare the merge proposal.**

Do NOT move the task file yet — archiving to `done/` happens in §6b after a successful merge so the `done/` directory never contains an unmerged task. Run these sequentially in one flow:

1. **Worktree guard:** `git rev-parse --abbrev-ref HEAD` in worktree. Must match stored branch → if not, **Blocked diagnostic**.

2. **Stage only touched files and commit in the worktree.**

   Use the touched-files list built in §2 — never `git add -A`. Stage each file explicitly:

   ```
   git add path/to/file1.ts path/to/file2.ts ... && git commit -m "feat(<scope>): <what was built>"
   ```

   Do NOT stage any `documentation/tasks/` paths — they are gitignored and not part of the commit.

   Before committing, run `git status --porcelain` and compare against the touched-files list. The **only** side-effects that may be silently staged are (a) lint-staged / prettier reformatting of files **already on the list**, (b) benchmark baseline/golden/expected-output artifacts the task file explicitly marks as auto-ratcheting (search the task for "baseline", "ratchet", "auto-update", "golden", or "expected-output"), (c) generated artifacts named in a Config Changes or Build section of the task file, and (d) an existing benchmark baseline file **when the diff is a strict decrease** in an existing task key's token-count field produced by the repo's deterministic benchmark runner. A baseline diff that adds a new task key, **increases** token count, changes duration only, or changes an undeclared expected-output/golden artifact is **not** this case and remains a Blocked diagnostic (do not silently stage it — investigate). Anything else dirty in the worktree — test fixtures modified to pass new logic, integration snapshots you regenerated with `vitest -u`, sibling-test keyword adjustments, benchmark expected-output/golden artifacts that changed because behavior changed, schema/validator/descriptor mirrors not declared by the task, adjacent refactors, or any file the task did not name — is a **Blocked diagnostic** per HARD RULE 9. Do not `git add` it. Do not rationalize it as a "legitimate side-effect". Stop and ask the user to extend scope, re-plan, or discard (see `SKILL.md` §Blocked Handling). Unrelated files → leave unstaged. Accidentally staged → `git reset HEAD <path>`.

   Conventional commit format: `type(scope): description`, max 72 chars, imperative, no period.

3. **Post-commit hygiene check.** Lint-staged may auto-format, leaving dirty files. Sub-steps (b)–(d) exist **only** to validate an amend; they never run on a clean commit.

   a. Run `git status --porcelain`. **If the output is empty, OR every dirty entry is outside the touched-files list, jump directly to (e) — do not run (b), (c), or (d).** The §4a gate from Phase 4 already validated lint + typecheck + test on this tree; re-running them on an unchanged tree is ~48s of wasted wall-clock and is explicitly forbidden here.
   b. **Reached only when a file in the touched-files list is dirty.** Stage those dirty touched files and amend: `git add <files> && git commit --amend --no-edit`.
   c. **Reached only after (b).** Run `pnpm lint && pnpm typecheck && pnpm test` to re-validate the amended tree. Fail → fix, stage, amend. Max 2 fix attempts → **Blocked diagnostic**.
   d. Re-check `git status --porcelain`. Still dirty on touched files → repeat from (b). Max 3 outer iterations → **Blocked diagnostic**.
   e. `git diff main...HEAD --stat` for merge proposal. Verify branch name matches.

---

### 6. Merge and Clean Up (MANDATORY — never skip)

All commands in §6 run from the **main workspace root**.

**6a — Auto-merge or stop.** Auto-merge runs when every finalize signal is clean. Stop and ask the user only when something is off.

Compute the **auto-merge preconditions** in this exact order. All must hold:

1. §4a full toolchain (`pnpm lint && pnpm typecheck && pnpm test && pnpm knip && pnpm lint:clones`) passed in §4, with no new findings from knip or lint:clones.
2. §5c post-commit hygiene landed clean (exit of the loop at `git status --porcelain` shows no dirty touched files).
3. `git status --porcelain` in the main workspace shows only expected, allowed files (gitignored paths: `documentation/tasks/`, `aic-progress.md`, `.aic/`). Anything else is a stop.
4. The feature branch diff (`git diff main...HEAD --stat`) touches only files in the touched-files list built in §2 plus the narrow §5c Step 2 whitelist (lint-staged reformatting of already-listed files, task-declared auto-ratcheting benchmark artifacts, task-declared generated artifacts, and strict-decrease benchmark baseline ratchets). Any other file on the `--stat` output is a HARD RULE 9 violation — stop, do not merge, follow §Blocked Handling.
5. The task file has no unresolved ambiguity, blocker, or follow-up flagged during §3/§4.

**Auto-merge path (all preconditions hold):** print a one-line summary — `Merging <branch> → main (N files, +X/-Y). Commit: "<message>"` — and proceed straight to §6b Step 1. Do not ask.

**Stop-and-ask path (any precondition fails):** do not merge. Present:

- branch name, worktree path, files changed (`--stat`), commit message,
- a one-line summary of which precondition failed (e.g. `knip reported 2 new unused exports`, `git status shows stray file X outside task surface`, `task step 4 had an ambiguity that was worked around`),
- the minimal next action you recommend.

Then ask: **"Issue detected: <summary>. Proceed with merge, adjust, or discard?"** and WAIT for response.

**6b — On auto-merge or explicit user approval, merge and clean up:**

The main workspace is already on `main` — no checkout needed.

**HARD RULE — Never `git stash` before merging.** Let `git merge --squash` handle dirty trees natively.

**Step 1 — Squash merge:** `git merge --squash <branch>`

- **Success (exit 0):** `git commit -m "feat(<scope>): <what was built>"` (same message from 5c or user's adjusted version).

  **HARD RULE — no post-merge toolchain re-runs.** After `git commit` lands on `main`, do NOT run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm lint:clones`, or the full §4a parallel batch. The §4a run captured in Phase 4 is the authoritative signal; the squash merge is a strict subset of that tree and cannot regress it. If you need to cite a test count or pass/fail summary in §5a or in the final user-facing message, **reuse the §4a output** captured earlier — do not re-run to extract it. Exceptions (narrow): (1) a content conflict required you to hand-edit files during resolution below, in which case re-run only the affected test files, not the full suite; (2) the user explicitly asks for a post-merge re-run.

- **Fails "local changes would be overwritten":**
  1. Read the git error output — it lists the conflicting files.
  2. Ask the user: "These files have uncommitted local changes that conflict with the merge: [list]. Are any of these being actively edited by another agent right now?"
  3. If YES: respond "OK — let me know when I can proceed with the merge." Then STOP and wait.
  4. If NO: discard local changes on only those conflicting files (`git checkout -- <conflicting files>`) and retry merge. This is safe because the feature branch contains the correct final content. Non-conflicting dirty files remain untouched.
- **Content conflicts:** List with `git diff --name-only --diff-filter=U`. Resolve (prefer feature branch). Stage. Grep for `<<<<<<<` (expect 0). Commit. If unresolvable → ask user.

**Step 2 — Archive the task file on the main workspace filesystem.** Task files are gitignored — this is a filesystem-only operation. Run from the **main workspace root**:

```
mkdir -p documentation/tasks/done && mv documentation/tasks/NNN-name.md documentation/tasks/done/
```

Edit the status at the NEW path (`documentation/tasks/done/NNN-name.md`): change `> **Status:** In Progress` to `> **Status:** Done`.

Verify the move — old path is gone and new path has the correct status:

```
test ! -f documentation/tasks/NNN-name.md && head -3 documentation/tasks/done/NNN-name.md
```

If a `> **Research:**` line was present in the task file, delete the referenced research file from the main workspace.

**Step 3 — Remove worktree and branch via the shared script (MANDATORY — non-negotiable).** Run from the **main workspace root**:

```
bash .claude/skills/shared/scripts/cleanup-worktree.sh remove <worktree-dir> <branch>
```

The script removes the directory, prunes `git worktree` metadata, deletes the branch, removes the parent `.git-worktrees/` if empty, and **verifies all three are gone**. It exits 0 on success and 1 if any residue remains — treat exit 1 as a HARD STOP and report the script's stderr to the user. Do NOT replace it with your own `rm -rf` / `git worktree prune` / `git branch -D` sequence; previous runs have skipped steps or forgotten verification and left orphans in `.git-worktrees/`.

**Step 4 — Final sweep (MANDATORY — last shell command in the session).** Editors may recreate directory stubs for files they were tracking, and concurrent or interrupted agents may still have orphans elsewhere in `.git-worktrees/`. Run the idempotent sweep after any announcement or user-facing output:

```
bash .claude/skills/shared/scripts/cleanup-worktree.sh sweep
```

Script exit 0 means no orphan directories remain under `.git-worktrees/`. Exit 1 means a residue is still present — stop and report, do not claim the task is finalized.

**6c — If the user says "discard":**

The task file was NOT archived in §5c (moved to §6b Step 2 after merge), so no filesystem rollback is needed — the task file is still at `documentation/tasks/NNN-name.md`. Reset its status back to its pre-execution state (`Pending` for a planner-authored task, or leave it absent for an ad-hoc request).

Then run the same mandatory cleanup via the shared script:

```
bash .claude/skills/shared/scripts/cleanup-worktree.sh remove <worktree-dir> <branch>
bash .claude/skills/shared/scripts/cleanup-worktree.sh sweep
```

Both invocations must exit 0. Exit 1 from either → stop and report the script's stderr. Report to the user that the worktree and branch were deleted, the task file is back at its original path, and no changes were merged.

---

**Emit the terminal checkpoint now.** This is the final checkpoint line of the run — it closes out `.aic/skill-log.jsonl` for this task. Run exactly one of the following based on how the run ended:

- **Clean merge (§6b completed):** status `complete`.

  ```
  echo "CHECKPOINT: aic-task-executor/finalized — complete"
  bash .claude/skills/shared/scripts/checkpoint-log.sh \
    aic-task-executor finalized "<merge-commit-and-task-note>"
  ```

- **Discard (§6c) or Blocked at §6a:** status `blocked` — the fourth positional argument is the status override, and the artifact note must carry the reason so operators can reconstruct why the run stopped.

  ```
  echo "CHECKPOINT: aic-task-executor/finalized — blocked"
  bash .claude/skills/shared/scripts/checkpoint-log.sh \
    aic-task-executor finalized "<reason-for-discard-or-block>" blocked
  ```

Do not end the session before this command exits 0. A missing terminal checkpoint is how "finished" runs end up looking unfinished in `show aic last`.
