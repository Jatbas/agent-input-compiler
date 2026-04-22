# CV-SRP-01: computation source names a non-existent module

Status: critic-validation — Check 5 (SRP-01) Step 3 should emit HARD because the `**Computation source:**` bullet names a module that does not export the claimed field (the file does not exist).

## Goal

Display a new budget ratio in the hero line.

## Files

| File                                  | Change | Description     |
| ------------------------------------- | ------ | --------------- |
| `mcp/src/format-diagnostic-output.ts` | Modify | Read the ratio. |

## Steps

1. Compute the ratio by dividing tokensCompiled by totalBudget.
2. Emit the ratio in the formatter output path.

## Architecture Notes

- **Computation source:** `shared/src/fake/nonexistent-budget-ratio.ts` exports `budgetRatio`. The formatter reads it verbatim with no further arithmetic.
