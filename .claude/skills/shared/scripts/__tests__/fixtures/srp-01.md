# Task FIX-007: SRP-01 trigger

Status: fixture — SRP-01 must fire (formatter + arithmetic verb); bullet absent; gate must fail.

## Goal

Fix the budget percentage display.

## Files

| File                                  | Change | Description               |
| ------------------------------------- | ------ | ------------------------- |
| `mcp/src/format-diagnostic-output.ts` | Modify | Budget ratio computation. |

## Steps

1. Divide tokensCompiled by the total budget.
2. Multiply the result by 100 for display.
