---
name: aic-update-mvp-progress
description: Updates documentation/tasks/progress/mvp-progress.md after tasks—component tables, daily log, and phase header metrics.
---

# Update MVP Progress

## Purpose

After completing a coding task, update the `documentation/tasks/progress/mvp-progress.md` file to reflect the latest progress.

**Main workspace only:** This file is under `documentation/tasks/` which is gitignored. Always read and edit it in the **main workspace**, never in a worktree. Do NOT stage or commit this file.

## Editors

- In Cursor, attach the skill with `@` or invoke via `/`; where the skill names the Task tool with `subagent_type` or subagents, use those Cursor mechanisms.
- In Claude Code, invoke with `/` plus the skill `name`; where the skill references multi-agent work, follow Claude Code subagent or parallel-session patterns.

## When to Use

- After completing implementation tasks
- When the user says "update progress"
- Proactively suggest updating progress after major milestones (Phase completions, multiple components done)

## Steps

1. **Establish what was done.** Before reading the file, identify from the current session context:
   - **Component names** exactly as they appear in the phase tables (e.g. `Compilation timeout enforcement`)
   - **Which phase** those components belong to (e.g. `Phase R`)
   - **A brief technical description** of what was implemented — one sentence per component, at technical detail level (not user-facing prose; the changelog skill handles curation)
   - **If invoked from task-executor:** derive from the task file and the executor's §5a report.
   - **If invoked standalone:** derive from the user's description of what they just built.

2. **Read** `documentation/tasks/progress/mvp-progress.md` to get the current state.

3. **Determine today's date.** Use the actual current date, not the date of the most recent log entry. The system provides today's date in the user info — use that.

4. **Update the component table:**
   - Find the component(s) from Step 1 in the phase tables.
   - Set the Status column to the appropriate value. Valid transitions:
     - `Not started` or `Pending` → `In progress` (partially done)
     - `Not started`, `Pending`, or `In progress` → `Done` (fully complete)
   - Use exactly these status values: `Not started`, `Pending`, `In progress`, `Done`.
   - Note: some phase tables have a `Deps` column — leave it unchanged.

5. **Update the header metrics.** The header has these exact fields — update only the ones that changed:
   - `**Phase 1.0:** N/M done` — recount `Done` rows across all Phase 1.0 tables; update N.
   - `**Phase 1.5:** N/M done` — recount `Done` rows across all Phase 1.5 tables; update N.
   - `**Current phase:**` — update only if the active phase letter has advanced (e.g. Phase R → Phase S).
   - `**Status:**` — one or two sentences describing current progress state (technical, not user-facing).
   - Do **not** touch `**Version target:**` or `**Previous:**` unless explicitly asked.

6. **Update the daily log:**
   - **Mandatory existence check (tool call required):** Use Grep to search the file for the exact heading `### YYYY-MM-DD` substituting today's date. This MUST be a tool-based search — do NOT rely on visual scanning or memory of the file contents.
   - **If grep finds 1+ matches (entry exists):** Do NOT create a new `### YYYY-MM-DD` heading. Instead, locate the existing entry and:
     - Append new bullet items to the END of its `**Completed:**` list (after the last existing bullet, before the next `###` heading or end of section).
     - Update the `**Components:**` line to include any new component names (merge with existing names, do not replace).
   - **If grep finds 0 matches (no entry for today):** Create a new entry at the TOP of the Daily Log section — immediately after the `## Daily Log` heading and any blank lines, above all existing `### YYYY-MM-DD` entries.
   - **Anti-duplication guard:** After making the edit, grep the file again for `### YYYY-MM-DD` with today's date. If the count is greater than 1, use a targeted Edit to remove the duplicate heading line and move its bullet items to the end of the first occurrence's `**Completed:**` list.
   - Follow this template for new entries (the blank lines shown are required):

```
### YYYY-MM-DD

**Components:** <comma-separated component names>
**Completed:**

- <what was implemented — technical detail, one bullet per component>
```

7. **Do not change** any other part of the file (phase descriptions, table structure, other daily log entries, `**Version target:**`, `**Previous:**`).

8. **Display the changes.** After all edits, read back and show the user:
   - The updated header block (`**Phase 1.0:**`, `**Phase 1.5:**`, `**Status:**`)
   - The updated or newly created daily log entry

   This lets the user confirm correctness before you proceed to the next step.

9. **Changelog hint:** After the user has reviewed the update, evaluate whether the completed work includes a user-facing change (new feature, bug fix, security fix, breaking change, or public API change). If yes, suggest: _"This looks changelog-worthy — want me to update the changelog?"_ Do not run the changelog skill automatically — let the user decide.

## Conventions

- Status values are exactly: `Not started`, `Pending`, `In progress`, `Done`
- Daily log is reverse chronological (newest first)
- Within a single day's entry, items are in chronological order (oldest first, newest appended at end)
- Phase counts (`**Phase 1.0:** N/M done`) are whole numbers — count actual `Done` table rows; do not round
- Always use the actual current date — never reuse a previous entry's date for new work
- Daily log bullets are technical (what was implemented); user-facing curation happens in the changelog skill
