# Task FIX-003: DRY-01 satisfied by bullet

Status: fixture — DRY-01 must fire AND bullet present; gate must pass.

## Goal

Import the context-window constant.

## Files

| File                                  | Change | Description             |
| ------------------------------------- | ------ | ----------------------- |
| `mcp/src/handlers/compile-handler.ts` | Modify | Import shared constant. |

## Steps

1. Import CONTEXT_WINDOW from the shared constants module.
2. Replace inline 128_000 with the import.

## Architecture Notes

- **Source-of-truth probe:** `shared/src/core/constants.ts` owns `CONTEXT_WINDOW = 128_000`. All callers import.
