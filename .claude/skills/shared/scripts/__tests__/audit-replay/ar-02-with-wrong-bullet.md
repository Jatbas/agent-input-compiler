# AR-02-wrong-bullet: critic prompt validation target

Status: audit-replay — task has all required bullets so the script passes, BUT
the `**Brand invariant cite:**` bullet paraphrases the invariant AND the Steps
push a 0-100 value into a `Percentage` field. The measurement-consistency
critic must flag both defects (Check 3 HARD on paraphrase, Check 3 HARD on
domain violation).

## Goal

Expose the budget utilisation as a Percentage on the diagnostic payload.

## Files

| File                             | Change | Description           |
| -------------------------------- | ------ | --------------------- |
| `mcp/src/diagnostic-payloads.ts` | Modify | Add Percentage field. |

## Steps

1. Add a `budgetUtilizationPct: Percentage` field to the payload type.
2. Populate the field by multiplying the ratio by 100 before returning the payload.

## Architecture Notes

- **Brand invariant cite:** Percentage is a decimal between 0 and 100 representing a percentage value used for display purposes.
