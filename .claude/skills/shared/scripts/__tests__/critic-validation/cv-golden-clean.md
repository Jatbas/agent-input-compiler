# CV-GOLDEN: clean BRAND-01 task with correct invariant cite

Status: critic-validation — all required bullets are present and factually correct; the critic must emit zero HARD findings and zero SOFT findings, and must write the agreement statement verbatim.

## Goal

Return a Percentage value from a new helper.

## Files

| File                                  | Change | Description        |
| ------------------------------------- | ------ | ------------------ |
| `mcp/src/handlers/metrics-handler.ts` | Modify | Return Percentage. |

## Steps

1. Add a helper that returns a Percentage value inside the declared domain.

## Architecture Notes

- **Brand invariant cite:** Percentage as a decimal in the range [0, 1]. 0.825 = 82.5%.
