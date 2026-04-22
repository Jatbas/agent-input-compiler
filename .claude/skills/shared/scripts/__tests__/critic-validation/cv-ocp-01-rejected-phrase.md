# CV-OCP-01: rejected justification phrases in OCP exception

Status: critic-validation — Check 7 (OCP-01) Step 2 should emit HARD because the bullet contains rejected phrases (`simpler`, `cleaner`, `less code`); Step 3 should emit HARD because no justification marker is present.

## Goal

Fix a rounding defect in the budget allocator.

## Files

| File                                      | Change | Description   |
| ----------------------------------------- | ------ | ------------- |
| `shared/src/pipeline/budget-allocator.ts` | Modify | Rounding fix. |

## Steps

1. Replace Math.floor with Math.round in the allocation loop.

## Architecture Notes

- **OCP exception:** This is a simpler, cleaner fix with less code than introducing a new rounding strategy class.
