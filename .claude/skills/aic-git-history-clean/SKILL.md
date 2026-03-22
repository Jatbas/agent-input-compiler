---
name: aic-git-history-clean
description: Squashes dev-noise commits in unpushed or published history with date preservation. Two modes: unpushed-only (default) and full rewrite (explicit).
---

> **Audience: Internal — developer workflow only. Do not invoke via agent delegation.**

# Git History Clean

## Purpose

Squash dev-noise commits — `wip`, `fixup!`, `squash!`, duplicate-scope pairs, and short throwaway subjects — into clean commits that match the project's commit format. Preserves original author dates so no commit appears to have landed today. Two modes: Mode A (unpushed commits only, safe) and Mode B (explicit rewrite of pushed history, destructive).

## Editors

- **Claude Code:** Invoke with `/aic-git-history-clean`. All rebase planning and execution happens inline — no subagent dispatch needed.
- **Cursor:** Attach the skill with `@` or invoke via `/`.

## When to Use

- Before releasing: when `aic-release` Phase 3 reports noisy commits since the last tag.
- Ad-hoc: when you want to clean up a run of dev commits before they become permanent public history.
- Before the first public push: to produce a clean initial commit history.

Do **not** run after a version tag has been pushed to a public remote that collaborators have already cloned — use Mode B only when you are the sole person with access to the branch, or before first public release.

## Steps

### Determine scope

1. Run `git tag -l "v*" --sort=-v:refname | head -1` to get the latest version tag. Store as `LAST_TAG`.
2. Run `git log $LAST_TAG..HEAD --oneline` to list all commits since the last tag.
3. If no tag exists, run `git log --oneline` to list all commits.
4. If the commit list is empty (zero commits since `$LAST_TAG`), stop: "No commits since `$LAST_TAG` — nothing to clean."
5. Present the full commit list to the user with a count: "Found N commits since `$LAST_TAG`."

### Mode A — unpushed commits only (default)

**Use this mode when the user does not specify a rewrite range.**

1. **Identify unpushed commits.** First verify an upstream branch is configured: run `git rev-parse --abbrev-ref @{u} 2>/dev/null`. If this returns an error (non-zero exit or empty output), stop: "No upstream tracking branch configured. Set one with `git branch --set-upstream-to=origin/<branch>`, or use Mode B with an explicit range." Otherwise, run `git log @{u}..HEAD --oneline`. If this returns empty output, all commits are already pushed. Stop: "All commits since `$LAST_TAG` are already pushed to `origin`. Use Mode B to rewrite published history."
2. **Identify noise commits** in the unpushed set. A commit is noise if any of these match:
   - Subject length < 30 characters (excluding type prefix and scope)
   - Subject contains `wip` (case-insensitive) anywhere
   - Subject starts with `fixup!` or `squash!`
   - Scope is identical to the immediately preceding commit's scope (duplicate-scope pair)
   - Subject is blank, only whitespace, or only punctuation
3. **Build squash groups.** Group rules:
   - A `fixup!` or `squash!` commit joins the nearest preceding non-noise commit with the matching subject.
   - Consecutive commits with identical scope (and at least one is noise) are grouped together.
   - Isolated `wip` commits with no obvious grouping target are grouped with their nearest non-noise predecessor.
   - Non-noise commits with no noise neighbors remain ungrouped (kept as-is).
   - If a group contains only noise commits (no non-noise anchor), use the longest subject in the group as the proposed message and mark the row in the plan table with `[REVIEW]` so the user knows it needs manual approval.
4. **Present the plan.** Show a table with three columns: `Group`, `Before (commits being squashed)`, `After (proposed message)`. For each kept non-noise commit, show it unchanged in its own row. For each squash group, show all constituent commit subjects in "Before" and the proposed clean message in "After". The proposed clean message uses the non-noise commit's message from the group (not a generated one). Example:

   | Group  | Before                                         | After                                         |
   | ------ | ---------------------------------------------- | --------------------------------------------- |
   | Keep   | `feat(pipeline): add session tracker`          | `feat(pipeline): add session tracker`         |
   | Squash | `fix(auth): token check` + `wip` + `fix: typo` | `fix(auth): token check`                      |
   | Keep   | `chore(deps): update better-sqlite3 to 9.4.0`  | `chore(deps): update better-sqlite3 to 9.4.0` |

5. **Show author dates.** Below the table, show the date range of the squash: "Commits span [earliest author date] → [latest author date]. Squashed commits will use the earliest date in each group."
6. **Ask for approval.** Say: "Proceed with this squash plan? (yes / edit / cancel)". Wait for explicit response.
   - `yes` → proceed to execution.
   - `edit` → ask which group to change and what the new commit message should be. Re-present the updated plan.
   - `cancel` → stop, no changes made.
7. **Execute.** Write the approved squash plan as a git rebase todo file to `/tmp/aic-rebase-todo`. One line per commit: `pick <hash> <subject>` for the anchor of each squash group, `fixup <hash> <subject>` for each noise commit in the group, `pick <hash> <subject>` for ungrouped kept commits. For commits whose message was changed during step 6 `edit`, write `pick <hash> <old-subject>` followed by `exec git commit --amend -m '<approved-message>' --no-edit` on the next line. Then run: `GIT_SEQUENCE_EDITOR='cp /tmp/aic-rebase-todo' git rebase -i --committer-date-is-author-date $LAST_TAG`. If the rebase fails (conflict, detached HEAD, or other error), stop immediately, show the full error output and `git status`, and tell the user to run `git rebase --abort` to restore the pre-rebase state.
8. **Confirm.** Run `git log $LAST_TAG..HEAD --oneline` and show the result: "History cleaned. New commit list:". Show the new commit log.

### Mode B — full rewrite (explicit)

**Use this mode only when the user explicitly specifies a rewrite range (e.g. "from v0.6.0", "from the beginning", "from commit abc1234").**

1. **Determine the base ref.** Parse the user's range specification:
   - "from vX.Y.Z" or "from tag vX.Y.Z" → base ref is `vX.Y.Z`
   - "from the beginning" or "from the start" → base ref is the root commit (`git rev-list --max-parents=0 HEAD`)
   - "from commit <hash>" → base ref is that commit hash
     After resolving the ref, verify it exists: run `git rev-parse --verify <base-ref> 2>/dev/null`. If this returns an error or empty output, stop: "Ref `<base-ref>` not found. Verify the tag or commit hash and try again."
2. **Check for other authors.** Run `git log <base-ref>..HEAD --format="%ae"` and compare each email against `git config user.email`. If any differ, show a warning: "WARNING: This range contains commits by other authors: [list of emails]. Rewriting will reassign their authorship or alter their commit history. Proceed?" Wait for confirmation. If the user says no, stop.
3. **Show the full commit range.** Run `git log <base-ref>..HEAD --oneline` and show the full list with count.
4. **Check if commits are already pushed.** Run `git log @{u}..<base-ref> --oneline 2>/dev/null`. If this shows that the base ref is reachable from `@{u}`, the commits in range are pushed. Show: "These commits are already on `origin`. This operation will rewrite published history and require a force push."
5. **Run noise detection and squash planning.** Follow Mode A steps 2–5 but over the full range `<base-ref>..HEAD`.
6. **Require double confirmation.** Show: "This will rewrite published history on `$(git branch --show-current)` and force-push to `origin`. This cannot be undone. Type **yes, rewrite** to confirm or anything else to cancel." Wait for exact string `yes, rewrite`. Any other response → stop, no changes.
7. **Execute.** Run `git rebase -i --committer-date-is-author-date <base-ref>` applying the squash plan.
8. **Force push.** Run `git push --force-with-lease origin $(git branch --show-current)`. If this is rejected (exit code non-zero with "rejected" or "stale" in output), stop: "Force push rejected — the remote has commits not present locally. Run `git fetch origin` to inspect what changed, then re-run aic-git-history-clean."
9. **Post-rewrite instructions.** Show: "History rewritten and pushed. If anyone else has cloned this repository, they must run: `git fetch --all && git reset --hard origin/$(git branch --show-current)`"
10. **Confirm.** Show the new `git log --oneline` since `<base-ref>`.

### After-public-release note

After the first public release (`v1.0.0` or equivalent) is pushed and the repository has public collaborators: Mode B must not be used on `main`. It remains available for feature branches that have not yet been merged. The skill does not enforce this automatically — it is the user's responsibility to judge whether the repository has collaborators.

## Conventions

- Always present the squash plan before executing — never squash silently.
- Proposed commit messages always come from the existing non-noise commits, not from generated text.
- Date preservation is non-negotiable. Every squashed commit inherits the earliest author date in its group.
- Mode A is the default. Invoke Mode B only on explicit user instruction with an explicit range.
- If `git rebase` fails (conflicts, detached HEAD, or other error), stop immediately, report the error and the current rebase state (`git status`, `git rebase --show-current-patch`), and tell the user to run `git rebase --abort` to return to the pre-rebase state.
