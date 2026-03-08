# Update MVP Progress

## Purpose

After completing a coding task, update the `documentation/mvp-progress.md` file to reflect the latest progress.

## When to Use

- After completing implementation tasks
- When the user says "update progress"
- Proactively suggest updating progress after major milestones (Phase completions, multiple components done)

## Steps

1. **Read** `documentation/mvp-progress.md` to get the current state.

2. **Determine today's date.** Use the actual current date, not the date of the most recent log entry. The system provides today's date in the user info — use that.

3. **Update the component table:**
   - Find the component(s) you worked on in the phase tables.
   - Change the Status column from `Not started` to `In progress` or `Done`.
   - Use exactly these values: `Not started`, `In progress`, `Done`.

4. **Update the header metrics:**
   - Recalculate the overall percentage: count `Done` components / total components. Round to nearest integer.
   - Update `**Phase:**` if you've moved to a new implementation phase.
   - Update `**Status:**` with a brief description of current state.

5. **Update the daily log:**
   - Check whether an entry for today's date (`### YYYY-MM-DD`) already exists.
   - **If today's entry exists:** append new items to the end of its `**Completed:**` list. Update the `**Components:**` line to include any new component names.
   - **If today's entry does NOT exist:** create a new entry at the top of the Daily Log section (above all existing entries — reverse chronological order).
   - Follow this template for new entries:

```
### YYYY-MM-DD
**Components:** <comma-separated component names>
**Completed:**
- <what was implemented, one bullet per item>
```

6. **Do not change** any other part of the file (phase descriptions, table structure, other daily log entries).

7. **Changelog hint:** After completing the progress update, evaluate whether the completed work includes a user-facing change (new feature, bug fix, security fix, breaking change, or public API change). If yes, suggest to the user: _"This looks changelog-worthy — want me to update the changelog?"_ Do not run the changelog skill automatically — let the user decide.

## Conventions

- Status values are exactly: `Not started`, `In progress`, `Done`
- Daily log is reverse chronological (newest first)
- Within a single day's entry, items are in chronological order (oldest first, newest appended at end)
- Percentage is rounded to nearest integer
- Always use the actual current date — never reuse a previous entry's date for new work
