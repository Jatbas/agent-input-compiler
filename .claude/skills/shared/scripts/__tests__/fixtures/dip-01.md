# Task FIX-010: DIP-01 trigger

Status: fixture — DIP-01 must fire (new X() outside server.ts); bullet absent; gate must fail.

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
