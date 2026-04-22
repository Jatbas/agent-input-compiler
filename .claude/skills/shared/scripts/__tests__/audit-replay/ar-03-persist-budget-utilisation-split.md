# AR-03: budget_utilisation persisted and displayed separately (pre-audit draft)

Status: audit-replay — reconstructs the `quality_snapshots.budget_utilisation`
split where the formatter was "fixed" while the persisted column carried the
old defect. The gate must fire PERSIST-01 (formatter + storage Modify in the
same Files table) AND BRAND-01 (Percentage mention), forcing the planner to
either name a single computation site or register a recompute-from-log note.

## Goal

Expose the stored budget utilisation on the aic last hero line.

## Files

| File                                           | Change | Description        |
| ---------------------------------------------- | ------ | ------------------ |
| `mcp/src/format-diagnostic-output.ts`          | Modify | Read stored value. |
| `shared/src/storage/quality-snapshot-store.ts` | Modify | Persist value.     |

## Steps

1. Write the Percentage value to the quality_snapshot row on compile.
2. Read the stored value in the formatter path for downstream emission.
