# Task FIX-011: OCP-01 trigger

Status: fixture — OCP-01 must fire (pipeline Modify + non-Add Goal); bullet absent; gate must fail.

## Goal

Fix a rounding defect in the budget allocator.

## Files

| File                                      | Change | Description   |
| ----------------------------------------- | ------ | ------------- |
| `shared/src/pipeline/budget-allocator.ts` | Modify | Rounding fix. |

## Steps

1. Replace Math.floor with Math.round in the allocation loop.
