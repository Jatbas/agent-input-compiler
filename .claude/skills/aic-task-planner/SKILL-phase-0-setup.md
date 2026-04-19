# Phase 0: Worktree Setup

Run after §0b confirms task planning. **Skip** if §0b classified as analysis-only (#2). Create worktree only when task planning is confirmed (#1 or post-research #6). The worktree enables parallel operation — planner, executors, and main workspace stay independent.

1. **Sweep orphaned worktrees first (MANDATORY).** Earlier interrupted runs may have left stale `.git-worktrees/plan-*` directories or `plan/*` branches on disk. Clean them before adding a new one so `git worktree add` cannot collide with a zombie. From the main workspace root:

   ```
   bash .claude/skills/shared/scripts/cleanup-worktree.sh sweep
   ```

   This removes every `.git-worktrees/<dir>` not in `git worktree list`, prunes stale git metadata, deletes any orphan `plan/<epoch>` / `feat/<epoch>` / `feat/task-<NNN>-<epoch>` branch whose worktree dir is gone, and is idempotent. Exit 0 is required before proceeding. Exit 1 means an orphan could not be removed — stop and tell the user, do not continue.

2. **Optionally update main.** From the main workspace root:

   ```
   git pull --ff-only
   ```

   If this fails: `git status --porcelain` non-empty → skip pull, tell user, proceed. Clean but fails → tell user "Cannot fast-forward main. Resolve manually." Do not proceed.

3. Generate a unique worktree name using the Unix epoch:

   ```
   EPOCH=$(date +%s)
   git worktree add -b plan/$EPOCH .git-worktrees/plan-$EPOCH main
   ```

   **Store the epoch value** — used in branch/directory names throughout. If worktree creation fails because the path or branch already exists despite the sweep (e.g. racing against another agent), remove that one worktree explicitly and retry:

   ```
   bash .claude/skills/shared/scripts/cleanup-worktree.sh remove .git-worktrees/plan-$EPOCH
   git worktree add -b plan/$EPOCH .git-worktrees/plan-$EPOCH main
   ```

4. Install dependencies in the worktree (needed for `.d.ts` reads during exploration):

   ```
   source .claude/skills/shared/scripts/ensure-node24.sh && pnpm install
   ```

   Run with `working_directory` set to the worktree absolute path.

   **Node 24 shim — prefix every `pnpm` or `node` invocation.** Cursor ships a bundled Node 22 on `PATH` that triggers `ERR_PNPM_UNSUPPORTED_ENGINE` under this repo's pinned Node 24.x + `engine-strict=true`. Each agent `Shell` call spawns a fresh shell — env vars do **not** persist — so prefix every subsequent pnpm/node invocation in later phases with `source .claude/skills/shared/scripts/ensure-node24.sh && ...`.

5. **All planning work happens in the worktree.** Use worktree paths for all tools. Task files use `$EPOCH` as temporary identifier — final NNN assigned in §6. Task files are gitignored — §6 copies to main workspace.

6. After verification, assign final task number, copy to main workspace, clean up worktree. See §6.

---

**Phase complete.** Read `SKILL-phase-1-recommend.md` and execute it immediately.
