# AR-04: hero-line subject/object mismatch (pre-audit draft)

Status: audit-replay — reconstructs the "X% excluded" clause that referred to
tokens while reading as a percentage of files. The gate must fire LABEL-01
(formatter Modify + user-visible string fragment with `%`), forcing the
planner to write the [label | formula | denominator | unit] mapping table
before the wording ships.

## Goal

Rewrite the aic last hero line to surface excluded files.

## Files

| File                                  | Change | Description         |
| ------------------------------------- | ------ | ------------------- |
| `mcp/src/format-diagnostic-output.ts` | Modify | Hero-line template. |

## Steps

1. Change the template to `"%d of %d files forwarded (%d%% of budget, %d%% excluded)"`.
2. Compute the excluded clause by subtracting forwarded from total.
