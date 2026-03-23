---
name: aic-git-history-clean
description: Produces feature-centric git history by grouping related commits (feat + follow-up fixes = one unit). Absorbs dev-noise, sanitizes internal references, places version tags on significant feature commits, preserves author dates, and validates every message before rewrite.
---

> **Audience: Internal — developer workflow only. Do not invoke via agent delegation.**

# Git History Clean

## Purpose

Produce feature-centric git history where each commit tells a story: "we added X", "we fixed Y." Groups related commits by feature — a `feat:` and the `fix:` that follows it are one unit, not two entries. Absorbs dev-noise, task planning, and release artifacts into the features they belong to. Removes internal task numbers, phase codes, and planning artifacts from commit messages. Places version tags on the most significant commit in each release range so `git log v0.6.3` shows the feature that shipped, not a version bump. Preserves original author dates. Creates a backup branch before any rebase for safe rollback. Validates every proposed message before presenting the plan.

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

**Release commits** are squashable with one exception. A `chore(release): ...` commit is absorbed into the preceding implementation commit UNLESS it is a **narrative release** — its description (after stripping leading `v?\d+\.\d+\.\d+[-\s]*` prefix and punctuation) is ≥ 20 characters and contains an action verb (add, rename, drop, fix, migrate, rewrite, overhaul, redesign, introduce, remove, implement, refactor, move, upgrade, support, merge, split, unify, replace). A narrative release is kept standalone and retyped to match its content: `feat:` if it adds/renames/introduces, `refactor:` if it restructures, `fix:` if it corrects. Example: `chore(release): rename packages to @jatbas/aic and @jatbas/aic-core` → kept standalone as `refactor(release): rename packages to @jatbas/aic and @jatbas/aic-core`. Non-narrative releases (bare version bumps like `chore(release): 0.6.3`) are absorbed normally. Back-to-back `chore(release):` commits: each evaluated independently.

### Soft noise (squashed only when grouped with squashable neighbors)

A commit is **soft noise** if it is not squashable but:

11. Scope is identical to the immediately preceding commit's scope, AND that preceding commit is squashable.

Soft-noise commits are only squashed when adjacent to a squashable commit with matching scope. A standalone soft-noise commit with no squashable neighbors is kept as-is.

### Sanitizable commits (kept, but message cleaned)

A commit is **sanitizable** if its description (after stripping prefix) contains any internal reference pattern. See "Message sanitization" below for the full pattern list. A sanitizable commit that is not squashable and not soft-noise remains a standalone commit — only its message is rewritten.

## Squash grouping rules

The goal is feature-centric history: each commit in the final log represents one logical feature or fix as a developer would describe it. "We added language provider support" — not 6 separate provider commits. Features are the organizing principle; commit types, scopes, and version tags are secondary artifacts.

### Phase 0 — Feature context (primary grouping signal)

When a **feature context file** is available, use it as the primary grouping signal. This produces dramatically better results than commit-level heuristics because it knows what features were actually built.

**Specifying the file.** The user names the file in the prompt (e.g., "using `documentation/tasks/progress/mvp-progress.md` for context"). If not specified, check for common progress files: `CHANGELOG.md`, `documentation/tasks/progress/*.md`, `docs/progress.md`. If nothing is found, skip Phase 0 and go straight to Phase 1.

**Parsing the file.** Read the file and extract dated entries. The expected structure is dated sections (e.g., `### YYYY-MM-DD`) each containing:

- A **Components** or **Features** line listing the feature groups for that day (comma-separated or parenthesized).
- A **Completed** section listing specific items, optionally with task numbers.

Example from a progress file:

```
### 2026-03-01
**Components:** Language providers (Go, Rust, Java, Ruby, PHP), model detection, editor detection
**Completed:**
- GoProvider (task 043): tree-sitter parsing for .go
- RustProvider (task 044): tree-sitter for .rs
- ModelDetectorDispatch (task 048): dispatch table per editor/env
```

This gives 3 feature groups for 2026-03-01: "Language providers", "model detection", "editor detection."

**Grouping commits by feature context.**

1. For each commit in the range, determine its author date (`%aI` truncated to `YYYY-MM-DD`).
2. Find the matching daily entry in the context file for that date.
3. Match the commit to a feature group by checking (in order):
   a. **Task number match.** If the commit description or any absorbed constituent references `task N` and the context file's Completed section mentions that task number under a specific component group → that group.
   b. **Keyword match.** Extract keywords from each component group label (e.g., "Language providers" → ["language", "provider"]). If the commit's scope or description shares 2+ keywords with a component group → that group.
   c. **Scope match.** If a component group label mentions a scope-like word (e.g., "model detection" → `model`, "session management" → `session`/`storage`) and the commit scope contains it → that group.
4. All commits matching the same (date, component group) become one squash group. The `feat:` with the longest description is the anchor. If no `feat:`, the commit with the longest description is the anchor.
5. Commits that match no component group, or whose date has no entry in the context file, fall through to Phase 1.

This typically produces **2-5 commits per development day** instead of 10-20. A day that added 6 language providers + model detection + editor fixes becomes 3 commits, each representing a coherent feature.

### Phase 1 — Heuristic feature grouping (fallback)

For commits not grouped by Phase 0, build groups using commit-level heuristics. A **feature anchor** is a `feat:` commit, or a significant `fix:`/`refactor:`/`perf:` commit (description > 20 chars) that is not itself a follow-up to a preceding feature.

1. **Same-scope continuation.** After each feature anchor, scan forward within a window of 20 commits. Absorb any commit with the **same scope** that is a `fix:`, `refactor:`, `test:`, `style:`, or `docs:` — these are follow-ups to the feature. The `feat:` is the anchor. Stop absorbing if you hit another `feat:` with the same scope (that starts a new feature). Version tag boundaries do **not** block this.

2. **Cross-scope continuation.** After same-scope grouping, scan forward within the same 20-commit window. Absorb any commit whose description shares **2+ significant keywords** with the anchor's description, regardless of scope. Significant keywords = nouns and verbs after removing stop words. Do not absorb another `feat:` via keyword matching.

3. **Fixup/squash targets.** A `fixup!` or `squash!` commit joins the nearest preceding commit whose subject matches the text after the prefix.

### Phase 2 — Artifact absorption

After feature groups are built (from Phase 0 and/or Phase 1), absorb remaining noise into the nearest group.

4. **Workflow artifacts.** Squashable commits (task planning, removal, progress, generic `docs(tasks)`, bare version strings, wip, short-subject — categories 2–9 from noise criteria) are absorbed into the nearest feature anchor within a window of 10 commits in either direction, preferring scope match. If no scope match, absorb into the nearest preceding anchor.

5. **Release-commit absorption.** A non-narrative `chore(release):` is absorbed into the immediately preceding anchor (i-1 only). A **narrative release** (see noise criteria) is kept standalone and retyped. If no preceding anchor exists, keep standalone.

6. **Scope-duplicate grouping.** Consecutive commits with identical scope where at least one is squashable and not yet grouped are merged. The first non-squashable commit is the anchor.

### Phase 3 — Standalone commits

7. **Ungrouped commits** remain standalone — their messages are sanitized but they stay as individual commits.

8. **Anchor-less groups.** If a group from phases 0–2 contains no non-squashable anchor, use the commit with the longest description as the proposed anchor and mark the row `[REVIEW]`.

The anchor of each group provides the proposed message. Absorbed commits disappear.

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

## Tag anchor selection

After building groups and sanitizing messages, assign each version tag to the group anchor that best tells the story of that release. This step is separate from group absorption — it decides WHERE a tag lands, not whether a commit is squashed.

For each version tag (in chronological order):

1. **Define the release range.** All group anchors (and standalone commits) between the previous version tag (exclusive) and this tag's original position (inclusive). If this is the first tag, the range starts at the base ref.

2. **Score every group anchor in the range.** Use the highest-matching signal:

| Priority | Signal                                                                                                                    | Score |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1        | `feat:` with description > 30 chars                                                                                       | 90    |
| 2        | `fix:` or `perf:` with description > 30 chars                                                                             | 80    |
| 3        | `refactor:` with impact keywords (overhaul, rewrite, migrate, drop, redesign, rename, restructure, unify, replace, split) | 75    |
| 4        | Narrative release commit (retyped — see grouping rule 4)                                                                  | 70    |
| 5        | `feat:` with any description length                                                                                       | 60    |
| 6        | `fix:` or `perf:` with any description length                                                                             | 50    |
| 7        | `refactor:` or `build:`                                                                                                   | 40    |
| 8        | Any other implementation type (`test:`, `ci:`, `chore:` non-release)                                                      | 30    |
| 9        | `docs:` (discouraged — validation check 8 warns)                                                                          | 10    |
| 10       | `chore(release):` standalone, bare bump (last resort)                                                                     | 5     |

3. **Tiebreaker.** When multiple anchors share the same score, prefer the one closest to the tag's original chronological position (the commit the tag was on before rewrite).

4. **Place the tag.** The tag lands on the highest-scoring anchor in the range.

This scoring naturally produces storytelling tags: `v0.6.3` → `fix(perf): prevent OOM on large projects` (score 80) rather than a bare release bump (score 5). A narrative release like `refactor(release): rename packages to @jatbas/aic` (score 70) wins over a nearby minor fix (score 50) but yields to a major feature (score 90) if one exists in the same range.

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
8. **Version tag storytelling.** Verify the tag anchor selection scoring was applied correctly. Tags should land on the highest-scoring anchor in their release range (see § Tag anchor selection). A tag on `docs:` (score 10) or bare `chore(release):` (score 5) triggers a warning — re-run scoring for that range. A tag on `chore(release):` is acceptable only as a last resort when no implementation commit exists in the range.
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

10. **Select tag anchors.** Apply the tag anchor selection scoring (see § Tag anchor selection). For each tag, score all group anchors in the release range and place the tag on the highest-scoring one. The tag does NOT automatically follow absorption — it is placed independently based on which commit best tells the release story. Validation check 8 will verify scoring was applied.

11. **Validate the plan** using the plan validation checks above. Auto-fix what can be fixed, mark remainder `[NEEDS-FIX]`.

12. **Present the plan.** Show a table with columns: `Group`, `Before (commits being squashed)`, `After (proposed message)`, `Tags`. Mark `[REVIEW]`, `[SANITIZED]`, and `[NEEDS-FIX]` as applicable. Show tags in the rightmost column for groups/commits that carry a version tag.

13. **Show validation summary and tag assignments.** Report auto-fixes and `[NEEDS-FIX]` items. Show the tag → anchor message mapping table with the score for each placement. Most tags should land on `feat:` (score 60–90) or `fix:`/`perf:` (score 50–80) commits. If any tag scores below 40, flag it for user review. Show commit count before → after and date range.

14. **Resolve all `[NEEDS-FIX]` items.** If any exist, present them and ask the user for replacement messages. Do not proceed until zero `[NEEDS-FIX]` remain.

15. **Require double confirmation.** "This will rewrite published history on `$(git branch --show-current)` and force-push to `origin`. Backup branch: `backup/<name>`. Type **yes, rewrite** to confirm or anything else to cancel." Wait for exact string `yes, rewrite`. Any other response → stop.

16. **Execute rebase.** Write the todo file (same format as Mode A step 11) and run: `GIT_SEQUENCE_EDITOR='cp <temp-path>' git rebase -i --committer-date-is-author-date <base-ref>`. Remove temp file after. On failure, stop immediately, show full error and `git status`, tell user to run `git rebase --abort`.

17. **Re-apply version tags.** For each recorded tag in chronological order:
    a. Delete old tag: `git tag -d <tag_name>`
    b. Find the new commit: search `git log --oneline <base-ref>..HEAD` for the commit whose subject matches the **selected tag anchor message** (from step 10 scoring — not necessarily the group that originally contained the release commit). Use the first match.
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

- **Feature-centric thinking.** The guiding question is "what features were built and what problems were solved?" — not "what commit types exist?" Each group in the final history should read like a changelog entry: "added X", "fixed Y", "refactored Z." Follow-up fixes to a feature are part of the feature, not separate entries.
- Always present the squash plan before executing — never squash silently.
- Proposed commit messages come from existing non-squashable commits in the group, not from generated text. Sanitization modifies existing messages (removing internal references) but does not invent new descriptions.
- Date preservation is non-negotiable. Every squashed commit inherits the earliest author date in its group. The `--committer-date-is-author-date` flag ensures committer dates match.
- Mode A is the default. Mode B requires explicit user instruction with an explicit range.
- Backup branches are created before every rebase (both modes) and are never deleted automatically. The user prunes them when satisfied.
- If `git rebase` fails (conflicts, detached HEAD, or other error), stop immediately, show the error and `git status`, and tell the user to run `git rebase --abort`.
- `--committer-date-is-author-date` requires git 2.29+. If the rebase fails with an unrecognized option error, tell the user to upgrade git.
- The result must look natural: no traces of internal task numbering, no AI-workflow artifacts, no phase codes, no empty parentheses, no broken trailing sentences. An experienced developer reading `git log` should see a normal conventional-commit history.
- Validation is not optional. Every plan must pass all 9 validation checks with zero `[NEEDS-FIX]` before the user is asked to approve.
