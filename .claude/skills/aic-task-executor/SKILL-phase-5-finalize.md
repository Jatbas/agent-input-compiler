# Phase 5: Finalize and Merge

### 5. Finalize

When all dimensions are confirmed clean, complete these three sub-steps in order.

**5a — Report to the user:**

- What was implemented (files created/modified)
- Test results (pass count, confirming no regressions) — for code tasks and mixed tasks. For pure documentation tasks: subagent verification results instead.
- **First-pass quality: N/M** (from §4c or §4-doc-d or §4-mixed-d, where M = applicable dimensions) — list any dimensions that needed fixing and what was fixed. For mixed tasks, report code and documentation dimensions separately: "Code: N/M first-pass clean. Docs: N/M first-pass clean."
- **Benchmark impact** (transformer tasks only): "Token reduction: baseline X → actual Y (delta: -Z%). Baseline auto-ratcheted / unchanged." Include this only when dimension 16 applied
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

   Before committing, run `git status --porcelain` and compare against the touched-files list. Legitimate side-effects (auto-formatted, auto-ratcheted) → add to list and stage. Unrelated files → leave unstaged. Accidentally staged → `git reset HEAD <path>`.

   Conventional commit format: `type(scope): description`, max 72 chars, imperative, no period.

3. **Post-commit hygiene check.** Lint-staged may auto-format, leaving dirty files.

   a. `git status --porcelain` — filter against touched-files list. No dirty touched files → skip to (e).
   b. Stage dirty touched files and amend: `git add <files> && git commit --amend --no-edit`.
   c. `pnpm lint && pnpm typecheck && pnpm test`. Fail → fix, stage, amend. Max 2 fix attempts → **Blocked diagnostic**.
   d. Re-check `git status --porcelain`. Still dirty → repeat from (b). Max 3 outer iterations → **Blocked diagnostic**.
   e. `git diff main...HEAD --stat` for merge proposal. Verify branch name matches.

---

### 6. Merge and Clean Up (MANDATORY — never skip)

All commands in §6 run from the **main workspace root**.

**6a — Auto-merge or stop.** Auto-merge runs when every finalize signal is clean. Stop and ask the user only when something is off.

Compute the **auto-merge preconditions** in this exact order. All must hold:

1. §4a full toolchain (`pnpm lint && pnpm typecheck && pnpm test && pnpm knip && pnpm lint:clones`) passed in §4, with no new findings from knip or lint:clones.
2. §5c post-commit hygiene landed clean (exit of the loop at `git status --porcelain` shows no dirty touched files).
3. `git status --porcelain` in the main workspace shows only expected, allowed files (gitignored paths: `documentation/tasks/`, `aic-progress.md`, `.aic/`). Anything else is a stop.
4. The feature branch diff (`git diff main...HEAD --stat`) touches only files in the touched-files list built in §2 (plus legitimate side-effects already accounted for in §5c).
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

**Step 3 — Remove worktree and branch.**

```
rm -rf <worktree-dir>
git worktree prune
git branch -D <branch>
```

Verify: `git worktree list` must not show the worktree and `ls <worktree-dir>` must fail.

**Step 4 — Final sweep (MANDATORY — last shell command in the session).** Editors may recreate directory stubs for files they were tracking. Run this idempotent cleanup after any announcement or user-facing output:

```
rm -rf <worktree-dir> 2>/dev/null; rmdir <main-workspace>/.git-worktrees 2>/dev/null || true
```

Verify: `ls <worktree-dir> 2>&1` must report "No such file or directory". If `.git-worktrees` is empty it is removed; if other worktrees exist the `rmdir` is a harmless no-op.

**6c — If the user says "discard":**

The task file was NOT archived in §5c (moved to §6b Step 2 after merge), so no filesystem rollback is needed — the task file is still at `documentation/tasks/NNN-name.md`. Reset its status back to its pre-execution state (`Pending` for a planner-authored task, or leave it absent for an ad-hoc request).

```
rm -rf <worktree-dir>
git worktree prune
git branch -D <branch>
```

Verify: `git worktree list` must not show the worktree and `ls <worktree-dir>` must fail.

**Final sweep (same as 6b Step 4):**

```
rm -rf <worktree-dir> 2>/dev/null; rmdir <main-workspace>/.git-worktrees 2>/dev/null || true
```

Report that the worktree and branch were deleted, the task file is back at its original path, and no changes were merged.
