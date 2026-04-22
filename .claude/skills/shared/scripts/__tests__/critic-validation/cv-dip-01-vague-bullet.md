# CV-DIP-01: vague DIP exception without server.ts reference

Status: critic-validation — Check 8 (DIP-01) Step 4 should emit HARD because the bullet does not name the `server.ts` call site by line number or exported function name.

## Goal

Wire a new metrics store.

## Files

| File                                  | Change | Description          |
| ------------------------------------- | ------ | -------------------- |
| `mcp/src/handlers/compile-handler.ts` | Modify | Construct the store. |

## Steps

1. In the handler, construct the store.

```typescript
const store = new MetricsStore(db);
```

## Architecture Notes

- **DIP exception:** This is a small refactor that does not need to live in the composition root right now.
