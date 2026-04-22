# CV-DRY-01: wrong source-of-truth owner

Status: critic-validation — Check 2 (DRY-01) Step 4 should emit HARD because the `**Source-of-truth probe:**` bullet names a module that does not contain the literal `128_000`.

## Goal

Use the shared context-window constant.

## Files

| File                                  | Change | Description      |
| ------------------------------------- | ------ | ---------------- |
| `mcp/src/handlers/compile-handler.ts` | Modify | Import constant. |

## Steps

1. Replace the inline 128_000 with an import of CONTEXT_WINDOW.

## Architecture Notes

- **Source-of-truth probe:** `shared/src/fake/nonexistent-window.ts` owns `CONTEXT_WINDOW = 128_000`. All callers import.
