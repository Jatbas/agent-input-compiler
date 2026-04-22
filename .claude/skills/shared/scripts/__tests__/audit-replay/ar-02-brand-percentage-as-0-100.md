# AR-02: budget utilisation as Percentage (pre-audit draft)

Status: audit-replay — reconstructs a task that would have stored values
outside the declared `[0, 1]` domain of the `Percentage` brand. The gate
must fire BRAND-01, forcing the planner to quote the brand invariant
byte-for-byte before a value of that type is created.

## Goal

Expose the budget utilisation as a Percentage on the diagnostic payload.

## Files

| File                             | Change | Description           |
| -------------------------------- | ------ | --------------------- |
| `mcp/src/diagnostic-payloads.ts` | Modify | Add Percentage field. |

## Steps

1. Add a `budgetUtilizationPct: Percentage` field to the payload type.
2. Populate the field by multiplying the ratio by 100 before returning.
