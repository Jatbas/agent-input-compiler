# CV-PERSIST-01: parity bullet names a non-existent function

Status: critic-validation — Check 4 (PERSIST-01) Step 4 should emit HARD because the `**Persistence-display parity:**` bullet names a function at a file:line that does not exist.

## Goal

Store and display a new metric.

## Files

| File                                           | Change | Description   |
| ---------------------------------------------- | ------ | ------------- |
| `mcp/src/format-diagnostic-output.ts`          | Modify | Show metric.  |
| `shared/src/storage/metrics-snapshot-store.ts` | Modify | Store metric. |

## Steps

1. Persist the metric value on every compile.
2. Read the stored value in the formatter path for downstream emission.

## Architecture Notes

- **Persistence-display parity:** `computeMetricValue()` at `shared/src/fake/nonexistent-metric-calc.ts:10`. Both the formatter and the snapshot store import from this module.
