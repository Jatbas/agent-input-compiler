# Task FIX-012: SCOPE-01 trigger

Status: fixture — SCOPE-01 must fire (storage Modify + SQL); bullet absent; gate must fail.

## Goal

Add a new stored query for metric lookups.

## Files

| File                                  | Change | Description       |
| ------------------------------------- | ------ | ----------------- |
| `shared/src/storage/metrics-store.ts` | Modify | New query method. |

## Steps

1. Add a SELECT statement that returns the latest metric row.
