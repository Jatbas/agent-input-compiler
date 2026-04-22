# AR-01: budget-percentage hero-line fix (pre-audit draft)

Status: audit-replay — reconstructs a task that would have introduced the
`123_500` denominator duplication across 4 sites. The gate must fire DRY-01
(the underscore literal appears) AND SRP-01 (formatter + arithmetic verbs),
forcing the planner to name the single constant owner and the upstream
computation site before the task can ship.

## Goal

Fix the budget-percentage clause in the aic last hero line.

## Files

| File                                  | Change | Description          |
| ------------------------------------- | ------ | -------------------- |
| `mcp/src/format-diagnostic-output.ts` | Modify | Correct denominator. |
| `mcp/src/diagnostic-payloads.ts`      | Modify | Align payload value. |

## Steps

1. Divide tokensCompiled by 123_500 in the payload builder.
2. Multiply by 100 to derive the percentage shown in the hero line.
