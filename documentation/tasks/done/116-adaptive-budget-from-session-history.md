# Task 116: Adaptive budget from session history (wire derivation)

> **Status:** Done
> **Phase:** O — Agentic Session Tracking (completion)
> **Layer:** core
> **Depends on:** Adaptive budget allocation (session history), Session tracking storage (migration)

## Goal

When `conversationTokens` is not provided on the request, derive it from the current session's prior steps (sum of `tokensCompiled` from `agenticSessionState.getSteps(sessionId)`) and pass that as `sessionContext` to `BudgetAllocator.allocate`, so adaptive budget caps apply in multi-step sessions without the client sending a value.

## Architecture Notes

- Task 090 added `SessionBudgetContext` and `allocate(rulePack, taskClass, sessionContext?)`; run-pipeline-steps already passes `request.conversationTokens` when defined. This task adds the derivation path when it is undefined.
- Project Plan §2.7: session-aware budget uses prior token usage to cap allocation. We use AIC-recorded steps only (no client-supplied conversation length).
- No new interface or pipeline class — single orchestration change in `runPipelineSteps`. Explicit `request.conversationTokens` continues to override when present.

## Files

| Action | Path                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| Modify | `shared/src/core/run-pipeline-steps.ts` (derive sessionContext from getSteps when conversationTokens undefined) |
| Create | `shared/src/core/__tests__/run-pipeline-steps.test.ts`                                                          |

## Interface / Signature

No new interface. We extend the existing `runPipelineSteps(deps, request)` behavior. Existing types:

- `PipelineStepsRequest` has optional `conversationTokens?: TokenCount` and `sessionId?: SessionId`.
- `PipelineStepsDeps` has optional `agenticSessionState?: AgenticSessionState | null`.
- `AgenticSessionState.getSteps(sessionId: SessionId): readonly SessionStep[]`.
- `SessionStep` has `tokensCompiled: TokenCount`.
- `SessionBudgetContext` has `conversationTokens?: TokenCount`.

## Dependent Types

### Tier 2 — path-only

| Type         | Path                             | Factory           |
| ------------ | -------------------------------- | ----------------- |
| `TokenCount` | `shared/src/core/types/units.js` | `toTokenCount(n)` |

We only sum `Number(step.tokensCompiled)` and pass the result through `toTokenCount(sum)`.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Derive sessionContext from session steps in run-pipeline-steps

In `shared/src/core/run-pipeline-steps.ts`, replace the logic that sets `sessionContext` (currently: when `request.conversationTokens !== undefined` set `sessionContext = { conversationTokens: request.conversationTokens }`, else `undefined`).

New behavior:

- If `request.conversationTokens !== undefined`: set `sessionContext = { conversationTokens: request.conversationTokens }` (unchanged).
- Else if `request.sessionId !== undefined` and `deps.agenticSessionState` is truthy: call `deps.agenticSessionState.getSteps(request.sessionId)`, sum `Number(step.tokensCompiled)` for each step (use reduce; no mutation), then set `sessionContext = { conversationTokens: toTokenCount(sum) }`. If the sum is 0, still pass `toTokenCount(0)`.
- Else: set `sessionContext = undefined`.

Use a single expression or a small helper so the logic stays readable. Do not mutate any array; use reduce or a for-loop that accumulates a number.

**Verify:** Grep for `sessionContext` in `run-pipeline-steps.ts` and confirm the three branches (explicit, derived, absent) are implemented.

### Step 2: Add run-pipeline-steps unit tests

Create `shared/src/core/__tests__/run-pipeline-steps.test.ts`. Test the orchestration behavior with mocks:

- **session_context_derived_from_steps_when_conversationTokens_absent:** Build minimal `deps` with a mock `budgetAllocator` (spy on `allocate`) and mock `agenticSessionState` whose `getSteps(sessionId)` returns a non-empty array of steps with known `tokensCompiled` values. Call `runPipelineSteps(deps, request)` with `request.sessionId` set, `request.conversationTokens` undefined. Assert `allocate` was called with third argument `sessionContext` such that `sessionContext.conversationTokens` equals `toTokenCount(sum of step.tokensCompiled)`.
- **session_context_unchanged_when_conversationTokens_provided:** Same deps/request shape but set `request.conversationTokens` to a known `TokenCount`. Assert `allocate` was called with `sessionContext.conversationTokens` equal to that value (regression: explicit value wins).
- **session_context_undefined_when_no_session:** Call with `request.sessionId` undefined (or `deps.agenticSessionState` null/undefined) and `request.conversationTokens` undefined. Assert `allocate` was called with third argument `undefined` (or no sessionContext).

Use the same pattern as existing pipeline tests: full deps object with mocks; no real pipeline steps. You may need to stub other deps (intentClassifier, rulePackResolver, repoMapSupplier, etc.) so `runPipelineSteps` runs up to the allocate call. If the function is async and runs past allocate, assert on the first allocate call only or structure the mocks so the pipeline completes without throwing.

**Verify:** `pnpm test -- run-pipeline-steps` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                         | Description                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| session_context_derived_from_steps_when_conversationTokens_absent | When conversationTokens is undefined and sessionId + agenticSessionState present, allocate receives sum of step.tokensCompiled. |
| session_context_unchanged_when_conversationTokens_provided        | When conversationTokens is set on request, allocate receives that value.                                                        |
| session_context_undefined_when_no_session                         | When no sessionId or agenticSessionState and no conversationTokens, allocate receives undefined.                                |

## Acceptance Criteria

- [ ] run-pipeline-steps.ts derives sessionContext from getSteps when conversationTokens is undefined and session is present
- [ ] run-pipeline-steps.test.ts created with three test cases above
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in new code
- [ ] No `let` in production code (only `const`)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
