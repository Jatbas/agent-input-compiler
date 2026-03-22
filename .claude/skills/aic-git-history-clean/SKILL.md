---
name: aic-git-history-clean
description: Squashes dev-noise and internal-workflow commits in unpushed or published history. Sanitizes internal references from commit messages, preserves author dates, creates backup branches, and re-applies version tags after rewrite. Includes automated plan validation.
---

> **Audience: Internal — developer workflow only. Do not invoke via agent delegation.**

# Git History Clean

## Purpose

Squash dev-noise and internal-workflow commits into clean commits that match the project's conventional commit format and look natural to an experienced developer reviewing `git log`. Removes internal task numbers, phase codes, and planning artifacts from commit messages. Preserves original author dates so no commit appears to have landed on the cleanup date. Creates a backup branch before any rebase for safe rollback. Validates every proposed message before presenting the plan.

Two modes: Mode A (unpushed commits only, safe default) and Mode B (explicit rewrite of pushed history, destructive).

## Editors

- **Claude Code:** Invoke with `/aic-git-history-clean`. All rebase planning and execution happens inline — no subagent dispatch needed.
- **Cursor:** Attach the skill with `@` or invoke via `/`.

## When to Use

- Before pushing: clean up local dev commits so pushed history reads naturally.
- Before releasing: when `aic-release` Phase 3 reports noisy commits since the last tag.
- Before the first public push: to produce a clean initial commit history.

Do **not** run after a version tag has been pushed to a public remote that collaborators have already cloned — use Mode B only when you are the sole person with access to the branch, or before first public release.

## Noise criteria

Apply these rules in both Mode A and Mode B to classify each commit.

### Squashable commits (absorbed into an adjacent commit)

A commit is **squashable** if any of the following match:

1. Subject starts with `fixup!` or `squash!`.
2. Subject contains `wip` as a standalone word or word-prefix (case-insensitive). Examples: `wip`, `wip:`, `WIP fix`.
3. Subject is blank, only whitespace, or only punctuation.
4. Subject matches `docs(tasks): plan task` followed by anything — task planning file commits.
5. Subject matches `chore(tasks): remove` followed by anything — task file cleanup commits.
6. Subject matches scope `tasks/progress` or `progress` (e.g., `docs(tasks/progress): ...`, `docs(progress): ...`) — progress tracking updates.
7. Full subject after stripping the conventional prefix is a bare version string matching `^v?\d+\.\d+\.\d+$` (e.g., `0.6.5`, `v0.7.0`).
8. Description (after stripping `type(scope): ` prefix) is shorter than 12 characters.
9. Subject matches `docs(tasks):` with any suffix not already caught by rules 4–6.
10. Subject is a merge commit (`^Merge branch`) whose branch name contains `task-\d+` — strip the task number from the branch name during sanitization.

**Exception — release commits.** A `chore(release): ...` commit is squashable (absorbed into the preceding implementation commit) UNLESS it is the only commit that a version tag can land on. If removing it would leave its version tag with no target commit, keep it standalone. Back-to-back `chore(release):` commits: absorb the first into its predecessor, keep the second standalone.

### Soft noise (squashed only when grouped with squashable neighbors)

A commit is **soft noise** if it is not squashable but:

11. Scope is identical to the immediately preceding commit's scope, AND that preceding commit is squashable.

Soft-noise commits are only squashed when adjacent to a squashable commit with matching scope. A standalone soft-noise commit with no squashable neighbors is kept as-is.

### Sanitizable commits (kept, but message cleaned)

A commit is **sanitizable** if its description (after stripping prefix) contains any internal reference pattern. See "Message sanitization" below for the full pattern list. A sanitizable commit that is not squashable and not soft-noise remains a standalone commit — only its message is rewritten.

## Squash grouping rules

After classifying all commits, build squash groups using these rules in priority order:

1. **Fixup/squash targets.** A `fixup!` or `squash!` commit joins the nearest preceding non-squashable commit whose subject matches the text after the `fixup! ` or `squash! ` prefix.
2. **Workflow-pair absorption.** A squashable Category 4/5/6/9 commit (task planning, removal, progress, or generic `docs(tasks)`) is absorbed into the nearest non-squashable commit within a window of 5 commits in either direction that shares the same scope or has overlapping keywords in its description. If no match is found within the window, absorb into the nearest non-squashable predecessor.
3. **Version-bump absorption.** A Category 7 commit (bare version string) is absorbed into the immediately preceding non-squashable commit.
4. **Release-commit absorption.** A `chore(release):` commit is absorbed into the immediately preceding non-squashable commit (i-1 only, not a wider search). Exception: if the commit carries the only version tag for that release, keep it standalone.
5. **Short-subject absorption.** A Category 8 commit (description < 12 chars) is absorbed into the nearest non-squashable commit with matching scope, or if no scope match, into the nearest non-squashable predecessor.
6. **Scope-duplicate grouping.** Consecutive commits with identical scope where at least one is squashable are grouped together. The first non-squashable commit in the run is the anchor. Exception: do not merge runs that are exclusively `chore(release):` commits.
7. **Isolated wip.** A `wip` commit with no match from rules 1–6 is grouped with its nearest non-squashable predecessor.
8. **Non-squashable commits** with no squashable neighbors remain ungrouped (kept as-is).
9. **All-squashable groups.** If a group formed by rules 1–7 contains no non-squashable anchor, use the commit with the longest description as the proposed anchor and mark the row `[REVIEW]` in the plan table.

The anchor commit of each group provides the proposed message. Absorbed commits disappear.

## Message sanitization

After determining each group's proposed message, sanitize it. Apply the transforms below **in the exact order listed**. The order matters — earlier steps remove content that later steps clean up.

### Step 1 — Strip internal content from the description

Starting with the description (the text after `type(scope): ` or `type: `), apply these regex replacements in order:

```
a. Em-dash tails:         s/\s*—\s+.+$//
b. Parenthesized codes:   s/\s*\([^)]*(?:[A-Z]{1,2}\d{2,3}|[Tt]ask\s*\d+|\d{2,4})[^)]*\)//g
c. Standalone codes:      s/\b[A-Z]{1,2}\d{2,3}\b//g
d. Dash codes:            s/\b[A-Z]{2,4}-\d{2,4}\b//g
e. Phase references:      s/\b[Pp]hase\s+[A-Za-z]{1,2}\b//g
f. Task references:       s/\b[Tt]ask\s+\d+\b//g
g. Task-file ranges:      s/\b[Tt]asks?\s+\d+[-–]\d+\b//g
h. Slash-phase refs:      s/\/[A-Z]{2}\b//g  (e.g. /AC, /AB)
i. Empty parentheses:     s/\s*\(\s*[,;\s]*\s*\)//g
j. Trailing fragments:    s/[,;]\s*(?:and\s+)?$//
k. Trailing prepositions: s/\s+(?:for|and|or|with|to|from|in|on|at)\s*$//
l. Trailing dashes:       s/\s*[—–-]\s*$//
m. Trailing "and remove completed": s/\s+and\s+remove\s+completed\s*$//i
n. Stale conjunctions:    s/\bwith\s+and\b/with/g  and  s/\band\s+and\b/and/g
o. Collapse whitespace:   s/\s+/ /g  then trim
```

### Step 2 — Remap internal scopes

If the commit scope matches a key in this table, replace it with the mapped value. A `null` value means drop the scope entirely (use `type: description` format).

| Internal scope                                                            | Public scope                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `skills`                                                                  | `tooling`                                                                                |
| `skill`                                                                   | `tooling`                                                                                |
| `mvp-progress`                                                            | `documentation`                                                                          |
| `mvp`                                                                     | `documentation`                                                                          |
| `tasks/progress`                                                          | `documentation`                                                                          |
| `tasks`                                                                   | (see below)                                                                              |
| `progress`                                                                | `documentation`                                                                          |
| `phase-w`                                                                 | `storage`                                                                                |
| `phase-*` (any `phase-X` pattern)                                         | Infer from group — use the dominant non-phase scope among constituent commits, or `null` |
| `ae`                                                                      | `storage`                                                                                |
| `ae04`                                                                    | `storage`                                                                                |
| `af04`                                                                    | `integrations`                                                                           |
| `af01`                                                                    | `integrations`                                                                           |
| `cl`                                                                      | `mcp`                                                                                    |
| Any 1–2 letter scope matching `^[a-z]{1,2}$` that looks like a phase code | Infer from group, or `null`                                                              |

For the `tasks` scope: if the group contains a non-squashable commit with a different scope, use that scope. If the `tasks` commit was kept standalone (not absorbed), check what the commit actually changes — if it modifies documentation, use `docs`; if it's a chore, use `chore` with no scope; otherwise drop the scope.

### Step 3 — Handle merge commits

If the subject starts with `Merge branch '`, strip task numbers from the branch name: replace `task-\d+-` with empty string. Example: `Merge branch 'feat/task-042-python-provider'` → `Merge branch 'feat/python-provider'`.

### Step 4 — Final validation of each message

After sanitization, verify:

- The description is at least 12 characters long after the prefix.
- If too short, fall back to the longest description among the group's constituent commits (sanitize that one too with steps 1–3).
- The result follows conventional commit format: `type(scope): description` or `type: description`.
- If the message cannot be salvaged, mark it `[NEEDS-FIX]`.

Mark any message that was changed from the original with `[SANITIZED]` in the plan table.

## Plan validation

**This step is mandatory.** Before presenting the plan to the user (both modes), run every proposed message through these automated checks. Fix violations automatically where possible. Any violation that cannot be auto-fixed must be marked `[NEEDS-FIX]` in the plan table.

### Checks

1. **No empty parentheses.** Message must not contain `()`, `( )`, or `(, )`. Auto-fix: remove them.
2. **No trailing prepositions.** Description must not end with a space followed by: `for`, `and`, `or`, `with`, `to`, `from`, `in`, `on`, `at`. Auto-fix: trim the trailing word.
3. **No trailing punctuation fragments.** Description must not end with `, `, `; `, `—`, or `-`. Auto-fix: trim.
4. **No internal codes remaining.** Description must not match any of: `\b[A-Z]{1,2}\d{2,3}\b`, `\b[A-Z]{2,4}-\d{2,4}\b`, `\b[Pp]hase\s+[A-Za-z]{1,2}\b`, `\b[Tt]ask\s+\d+\b`, `\/[A-Z]{2}\b`. Auto-fix: re-run sanitization step 1.
5. **No internal scopes remaining.** Scope must not be in the remap table (step 2) or match `^[a-z]{1,2}$` when it looks like a phase code. Auto-fix: re-run scope remap.
6. **Minimum description length.** Description must be at least 12 characters. Auto-fix: fall back to longest constituent description.
7. **No merge task numbers.** Merge commit branch names must not contain `task-\d+`. Auto-fix: strip.
8. **Version tag sanity.** If a version tag lands on a `docs:` commit (any scope), warn: this looks unusual. Prefer keeping the `chore(release):` as a standalone commit for that tag instead. Auto-fix: un-absorb the release commit and keep it standalone for the tag.
9. **Conventional format.** Message must match `^[a-z]+(\([a-z0-9/-]+\))?: .{12,}$` (allowing for scoped or unscoped). Mark `[NEEDS-FIX]` if not.

### Reporting

After running all checks, report:

- "Validation passed: all N messages are clean." (if no issues), or
- "Validation: N auto-fixed, M need manual review." followed by a list of `[NEEDS-FIX]` items.

The plan must have **zero `[NEEDS-FIX]`** items before the user is asked to approve. If any exist, present them and ask the user to provide replacement messages.

## Steps

### Determine scope

1. Run `git tag -l "v*" --sort=-v:refname | head -1` to get the latest version tag. Store as `LAST_TAG`.
2. Run `git log $LAST_TAG..HEAD --oneline` to list all commits since the last tag.
3. If no tag exists, run `git log --oneline` to list all commits.
4. If the commit list is empty (zero commits since `$LAST_TAG`), stop: "No commits since `$LAST_TAG` — nothing to clean."
5. Present the full commit list to the user with a count: "Found N commits since `$LAST_TAG`."

### Mode A — unpushed commits only (default)

**Use this mode when the user does not specify a rewrite range.**

1. **Backup.** Run `git branch backup/$(git branch --show-current)-$(date +%Y%m%d-%H%M%S)`. Print: "Backup created: `backup/<branch>-<timestamp>`. To restore: `git reset --hard backup/<branch>-<timestamp>`."

2. **Identify unpushed commits.** Verify upstream: `git rev-parse --abbrev-ref @{u} 2>/dev/null`. On error or empty output, stop: "No upstream tracking branch configured. Set one with `git branch --set-upstream-to=origin/<branch>`, or use Mode B with an explicit range." Otherwise run `git log @{u}..HEAD --oneline`. If empty, stop: "All commits since `$LAST_TAG` are already pushed. Use Mode B to rewrite published history."

3. **Classify commits** in the unpushed set using the noise criteria above.

4. **Build squash groups** using the squash grouping rules above.

5. **Sanitize proposed messages** using the message sanitization rules above (steps 1–4).

6. **Validate the plan** using the plan validation checks above. Auto-fix what can be fixed, mark remainder `[NEEDS-FIX]`.

7. **Present the plan.** Show a table with columns: `Group`, `Before (commits being squashed)`, `After (proposed message)`. Mark `[REVIEW]`, `[SANITIZED]`, and `[NEEDS-FIX]` flags. For kept commits, show them in their own row. Example:

   | Group  | Before                                                                                                    | After                                                    |
   | ------ | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
   | Keep   | `feat(pipeline): add session tracker`                                                                     | `feat(pipeline): add session tracker`                    |
   | Squash | `docs(tasks): plan task 232 — AK01 re-exports` + `feat(claude): unify plugin scripts as hooks re-exports` | `feat(claude): unify plugin scripts as hooks re-exports` |
   | Keep   | `fix(storage): move DB to ~/.aic/ (W08)`                                                                  | `fix(storage): move DB to ~/.aic/` [SANITIZED]           |

8. **Show validation summary.** "Validation: N messages auto-fixed. 0 need manual review." If any `[NEEDS-FIX]`, present them and ask for replacement messages before proceeding.

9. **Show author dates.** "Commits span [earliest] → [latest]. Squashed commits use the earliest date in each group."

10. **Ask for approval.** "Proceed with this squash plan? (yes / edit / cancel)". Wait for explicit response.
    - `yes` → proceed.
    - `edit` → ask which group to change and what the new message should be. Re-validate the edited messages. Re-present the updated plan.
    - `cancel` → stop, no changes.

11. **Execute.** Write the squash plan as a git rebase todo to a temp file (`mktemp /tmp/aic-rebase-todo-XXXXXX`). For each commit in chronological order:
    - Anchor of a squash group: `pick <hash> <subject>`
    - Absorbed commit in a group: `fixup <hash> <subject>`
    - Ungrouped kept commit: `pick <hash> <subject>`
    - After any `pick` whose message was sanitized or edited, add on the next line: `exec git commit --amend -m '<sanitized-message>' --date='<original-author-date>'`

    Run: `GIT_SEQUENCE_EDITOR='cp <temp-path>' git rebase -i --committer-date-is-author-date @{u}`. Remove the temp file after completion or abort. If the rebase fails (conflict, detached HEAD, or other error), stop immediately, show full error output and `git status`, tell the user to run `git rebase --abort`.

12. **Confirm.** Run `git log @{u}..HEAD --oneline` and show: "History cleaned. New commit list:".

### Mode B — full rewrite (explicit)

**Use this mode only when the user explicitly specifies a rewrite range (e.g. "from v0.6.0", "from the beginning", "from commit abc1234").**

1. **Determine the base ref.** Parse the user's range:
   - "from vX.Y.Z" or "from tag vX.Y.Z" → base ref is `vX.Y.Z`
   - "from the beginning" or "from the start" → base ref is the root commit (`git rev-list --max-parents=0 HEAD`)
   - "from commit <hash>" → base ref is that hash
     Verify: `git rev-parse --verify <base-ref> 2>/dev/null`. On error, stop: "Ref `<base-ref>` not found."

2. **Backup.** Run `git branch backup/$(git branch --show-current)-$(date +%Y%m%d-%H%M%S)`. Print: "Backup created: `backup/<branch>-<timestamp>`. To restore: `git reset --hard backup/<branch>-<timestamp>`."

3. **Check for other authors.** Run `git log <base-ref>..HEAD --format="%ae"` and compare each email against `git config user.email`. If any differ: "WARNING: This range contains commits by other authors: [list]. Rewriting will alter their history. Proceed?" Wait for confirmation.

4. **Record version tags.** Run `git log <base-ref>..HEAD --format="%H %D" --decorate=short`. For each line containing a tag reference (pattern `tag: vX.Y.Z`), record `(tag_name, commit_hash)`. Also record each tag's commit subject via `git log -1 --format="%s" <commit_hash>`. Present: "Found N version tags in range: [list of tag names]."

5. **Show the full commit range.** Run `git log <base-ref>..HEAD --oneline` and show with count.

6. **Check if commits are already pushed.** Run `git merge-base --is-ancestor <base-ref> @{u} 2>/dev/null`. If exit 0: "These commits are already on `origin`. This will rewrite published history and require a force push."

7. **Classify commits** in the full range using the noise criteria above.

8. **Build squash groups** using the squash grouping rules above.

9. **Sanitize proposed messages** using the message sanitization rules above (steps 1–4).

10. **Assign tags to groups.** For each recorded tag, find which group (or kept commit) contains the tag's original commit. Record the mapping. If a tag's commit was absorbed into a group, the tag will be re-applied to the group's anchor commit after rebase. **Version tag sanity check:** if a tag would land on a `docs:` commit, check whether the absorbed `chore(release):` can be kept standalone instead (see validation check 8).

11. **Validate the plan** using the plan validation checks above. Auto-fix what can be fixed, mark remainder `[NEEDS-FIX]`.

12. **Present the plan.** Show a table with columns: `Group`, `Before (commits being squashed)`, `After (proposed message)`, `Tags`. Mark `[REVIEW]`, `[SANITIZED]`, and `[NEEDS-FIX]` as applicable. Show tags in the rightmost column for groups/commits that carry a version tag.

13. **Show validation summary and tag assignments.** Report auto-fixes and `[NEEDS-FIX]` items. Show the tag → anchor message mapping table. Show commit count before → after and date range.

14. **Resolve all `[NEEDS-FIX]` items.** If any exist, present them and ask the user for replacement messages. Do not proceed until zero `[NEEDS-FIX]` remain.

15. **Require double confirmation.** "This will rewrite published history on `$(git branch --show-current)` and force-push to `origin`. Backup branch: `backup/<name>`. Type **yes, rewrite** to confirm or anything else to cancel." Wait for exact string `yes, rewrite`. Any other response → stop.

16. **Execute rebase.** Write the todo file (same format as Mode A step 11) and run: `GIT_SEQUENCE_EDITOR='cp <temp-path>' git rebase -i --committer-date-is-author-date <base-ref>`. Remove temp file after. On failure, stop immediately, show full error and `git status`, tell user to run `git rebase --abort`.

17. **Re-apply version tags.** For each recorded tag in chronological order:
    a. Delete old tag: `git tag -d <tag_name>`
    b. Find the new commit: search `git log --oneline <base-ref>..HEAD` for the commit whose subject matches the group's proposed (sanitized) message for the group that contained the tag. Use the first match.
    c. Re-create: `git tag <tag_name> <new_commit_hash>`
    d. If a match cannot be found, warn: "Could not find target commit for tag `<tag_name>`. Skipping — re-apply manually."

18. **Force push branch.** Run `git push --force-with-lease origin $(git branch --show-current)`. If rejected, stop: "Force push rejected — remote has newer commits. Run `git fetch origin` and re-run."

19. **Push tags.** Run `git push --force origin --tags` to update remote tags.

20. **Post-rewrite summary.** Show:
    - "History rewritten and pushed."
    - "Backup branch: `backup/<name>`"
    - "Tags re-applied: [list]"
    - "If anyone else has a local clone: `git fetch --all && git reset --hard origin/$(git branch --show-current)`"

21. **Confirm.** Run `git log --oneline <base-ref>..HEAD` and show the new commit list.

### After-public-release note

After the first public release (`v1.0.0` or equivalent) is pushed and the repository has public collaborators: Mode B must not be used on `main`. It remains available for feature branches that have not yet been merged. The skill does not enforce this automatically — it is the user's responsibility.

## Conventions

- Always present the squash plan before executing — never squash silently.
- Proposed commit messages come from existing non-squashable commits in the group, not from generated text. Sanitization modifies existing messages (removing internal references) but does not invent new descriptions.
- Date preservation is non-negotiable. Every squashed commit inherits the earliest author date in its group. The `--committer-date-is-author-date` flag ensures committer dates match.
- Mode A is the default. Mode B requires explicit user instruction with an explicit range.
- Backup branches are created before every rebase (both modes) and are never deleted automatically. The user prunes them when satisfied.
- If `git rebase` fails (conflicts, detached HEAD, or other error), stop immediately, show the error and `git status`, and tell the user to run `git rebase --abort`.
- `--committer-date-is-author-date` requires git 2.29+. If the rebase fails with an unrecognized option error, tell the user to upgrade git.
- The result must look natural: no traces of internal task numbering, no AI-workflow artifacts, no phase codes, no empty parentheses, no broken trailing sentences. An experienced developer reading `git log` should see a normal conventional-commit history.
- Validation is not optional. Every plan must pass all 9 validation checks with zero `[NEEDS-FIX]` before the user is asked to approve.
