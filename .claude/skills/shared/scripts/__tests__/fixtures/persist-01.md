# Task FIX-013: PERSIST-01 trigger

Status: fixture — PERSIST-01 must fire (formatter + storage together); bullets absent; gate must fail.

## Goal

Store and display a new metric.

## Files

| File                                           | Change | Description     |
| ---------------------------------------------- | ------ | --------------- |
| `mcp/src/format-diagnostic-output.ts`          | Modify | Display metric. |
| `shared/src/storage/metrics-snapshot-store.ts` | Modify | Persist metric. |

## Steps

1. Write the metric value to the snapshot table on each compile.
2. Read the stored value in the formatter path for downstream emission.
