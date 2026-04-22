# Task FIX-001: DRY-01 underscore literal

Status: fixture — DRY-01 must fire; bullet absent; gate must fail.

## Goal

Set the default budget.

## Files

| File                                  | Change | Description    |
| ------------------------------------- | ------ | -------------- |
| `mcp/src/handlers/compile-handler.ts` | Modify | Pass constant. |

## Steps

1. Replace the existing budget default with 128_000.
