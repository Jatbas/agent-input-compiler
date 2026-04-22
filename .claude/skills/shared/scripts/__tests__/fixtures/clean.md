# Task FIX-000: Clean baseline

Status: fixture — trips zero triggers; gate must pass with `triggers_fired: []`.

## Goal

Add a CLI flag to the compile handler.

## Files

| File                                  | Change | Description      |
| ------------------------------------- | ------ | ---------------- |
| `mcp/src/handlers/compile-handler.ts` | Modify | Accept new flag. |

## Steps

1. Add the flag to the handler signature.
2. Thread the flag through to the downstream call.

## Architecture Notes

- Flag defaults to false for backward compatibility.
