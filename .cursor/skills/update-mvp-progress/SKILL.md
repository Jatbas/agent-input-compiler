# Update MVP Progress

## Purpose

After completing a coding task, update the `documentation/mvp-progress.md` file to reflect the latest progress.

## When to Use

- After completing implementation tasks
- When the user says "update progress"
- Proactively suggest updating progress after major milestones (Phase completions, multiple components done)

## Steps

1. **Read** `documentation/mvp-progress.md` to get the current state.

2. **Update the component table:**
   - Find the component(s) you worked on in the phase tables.
   - Change the Status column from `Not started` to `In progress` or `Done`.
   - Use exactly these values: `Not started`, `In progress`, `Done`.

3. **Update the header metrics:**
   - Recalculate the overall percentage: count `Done` components / total components.
   - Update `**Phase:**` if you've moved to a new implementation phase.
   - Update `**Status:**` with a brief description of current state.

4. **Append a daily log entry** (or update today's entry if one exists):
   - Use today's date as `### YYYY-MM-DD`.
   - If today's entry already exists, append to the `**Completed:**` list.
   - If it's a new day, add a new entry at the top of the Daily Log section (reverse chronological).
   - Follow this template:

```
### YYYY-MM-DD
**Components:** <comma-separated component names>
**Completed:**
- <what was implemented, one bullet per item>
```

5. **Do not change** any other part of the file (phase descriptions, table structure).

## Conventions

- Status values are exactly: `Not started`, `In progress`, `Done`
- Daily log is reverse chronological (newest first)
- Percentage is rounded to nearest integer
