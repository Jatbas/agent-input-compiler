# Phase 0: Worktree Setup

Run after §0b confirms task planning. **Skip** if §0b classified as analysis-only (#2). Create worktree only when task planning is confirmed (#1 or post-research #6). The worktree enables parallel operation — planner, executors, and main workspace stay independent.

1. **Optionally update main.** From the main workspace root:

   ```
   git pull --ff-only
   ```

   If this fails: `git status --porcelain` non-empty → skip pull, tell user, proceed. Clean but fails → tell user "Cannot fast-forward main. Resolve manually." Do not proceed.

2. Generate a unique worktree name using the Unix epoch:

   ```
   EPOCH=$(date +%s)
   git worktree add -b plan/$EPOCH .git-worktrees/plan-$EPOCH main
   ```

   **Store the epoch value** — used in branch/directory names throughout. If worktree creation fails because the path or branch already exists (stale), remove it fully: `rm -rf .git-worktrees/plan-$EPOCH && git worktree prune && git branch -D plan/$EPOCH 2>/dev/null` then retry.

3. Install dependencies in the worktree (needed for `.d.ts` reads during exploration):

   ```
   pnpm install
   ```

   Run with `working_directory` set to the worktree absolute path.

4. **All planning work happens in the worktree.** Use worktree paths for all tools. Task files use `$EPOCH` as temporary identifier — final NNN assigned in §6. Task files are gitignored — §6 copies to main workspace.

5. After verification, assign final task number, copy to main workspace, clean up worktree. See §6.

---

**Phase complete.** Read `SKILL-phase-1-recommend.md` and execute it immediately.
