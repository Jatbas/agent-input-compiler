# Task FIX-002: DRY-01 bare-digit literal

Status: fixture — DRY-01 must fire on bare 6+ digit literal; bullet absent; gate must fail.

## Goal

Set the default budget.

## Files

| File                                  | Change | Description    |
| ------------------------------------- | ------ | -------------- |
| `mcp/src/handlers/compile-handler.ts` | Modify | Pass constant. |

## Steps

1. Replace the existing budget default with 128000.
