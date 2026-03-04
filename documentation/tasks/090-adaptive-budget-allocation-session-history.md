# Task 090: Adaptive budget allocation (session history)

> **Status:** Pending
> **Phase:** O — Agentic Session Tracking (from mvp-progress.md)
> **Layer:** pipeline
> **Depends on:** Session-level compilation deduplication

## Goal

Extend the Budget Allocator (Step 3) so that when `conversationTokens` is provided on the request, the allocated budget is capped by the session-aware available context window, preventing context overflow in multi-step agentic workflows.

## Architecture Notes

- Project Plan §2.7 Agentic Workflow Support: conversation-length adaptation uses `availableBudget = modelContextWindow - reservedResponse - conversationTokens - templateOverhead`.
- Pipeline step: one public method, constructor receives only interfaces (BudgetConfig). No new pipeline class — extend existing BudgetAllocator.
- Session context passed as optional third parameter to `allocate()`; when absent, behavior unchanged (backward compatible). Phase 1 uses constants (128000, 4000, 500) for context window, reserved response, and template overhead; model-specific values deferred.

## Files

| Action | Path                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/types/session-budget-context.ts`                                                                    |
| Modify | `shared/src/core/interfaces/budget-allocator.interface.ts` (add optional `SessionBudgetContext` param to `allocate`) |
| Modify | `shared/src/pipeline/budget-allocator.ts` (implement session cap with constants)                                     |
| Modify | `shared/src/core/run-pipeline-steps.ts` (add `conversationTokens` to request, pass sessionContext to allocate)       |
| Modify | `shared/src/pipeline/compilation-runner.ts` (pass `request.conversationTokens` into pipelineRequest)                 |
| Modify | `shared/src/pipeline/__tests__/budget-allocator.test.ts` (add session-cap test cases)                                |

## Interface / Signature

```typescript
import type { RulePack } from "#core/types/rule-pack.js";
import type { TaskClass } from "#core/types/enums.js";
import type { TokenCount } from "#core/types/units.js";
import type { SessionBudgetContext } from "#core/types/session-budget-context.js";

export interface BudgetAllocator {
  allocate(
    rulePack: RulePack,
    taskClass: TaskClass,
    sessionContext?: SessionBudgetContext,
  ): TokenCount;
}
```

```typescript
import type { BudgetAllocator as IBudgetAllocator } from "#core/interfaces/budget-allocator.interface.js";
import type { BudgetConfig } from "#core/interfaces/budget-config.interface.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { TaskClass } from "#core/types/enums.js";
import type { TokenCount } from "#core/types/units.js";
import type { SessionBudgetContext } from "#core/types/session-budget-context.js";
import { toTokenCount } from "#core/types/units.js";

export class BudgetAllocator implements IBudgetAllocator {
  constructor(private readonly config: BudgetConfig) {}

  allocate(
    rulePack: RulePack,
    taskClass: TaskClass,
    sessionContext?: SessionBudgetContext,
  ): TokenCount {
    // base budget via existing resolution order; then cap by session when conversationTokens provided
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// SessionBudgetContext — new type in shared/src/core/types/session-budget-context.ts
import type { TokenCount } from "#core/types/units.js";

export interface SessionBudgetContext {
  readonly conversationTokens?: TokenCount;
}
```

### Tier 1 — signature + path

| Type           | Path                                                    | Members                                                       | Purpose                             |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------- |
| `BudgetConfig` | `shared/src/core/interfaces/budget-config.interface.ts` | 2                                                             | getMaxTokens, getBudgetForTaskClass |
| `RulePack`     | `shared/src/core/types/rule-pack.ts`                    | constraints, includePatterns, excludePatterns, budgetOverride | passed to allocate                  |

### Tier 2 — path-only

| Type         | Path                             | Factory             |
| ------------ | -------------------------------- | ------------------- |
| `TokenCount` | `shared/src/core/types/units.js` | `toTokenCount(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add SessionBudgetContext type

Create `shared/src/core/types/session-budget-context.ts` with interface `SessionBudgetContext` containing optional `conversationTokens?: TokenCount`. Use `import type { TokenCount } from "#core/types/units.js"`.

**Verify:** File exists; `SessionBudgetContext` is exported and has the correct shape.

### Step 2: Extend BudgetAllocator interface

In `shared/src/core/interfaces/budget-allocator.interface.ts`, add import for `SessionBudgetContext` from `#core/types/session-budget-context.js`. Add optional third parameter `sessionContext?: SessionBudgetContext` to `allocate(rulePack, taskClass, sessionContext?): TokenCount`.

**Verify:** Interface compiles; parameter is optional.

### Step 3: Implement session cap in BudgetAllocator

In `shared/src/pipeline/budget-allocator.ts`, add import for `SessionBudgetContext` and `toTokenCount`. Define constants: `CONTEXT_WINDOW_DEFAULT = 128_000`, `RESERVED_RESPONSE_DEFAULT = 4_000`, `TEMPLATE_OVERHEAD_DEFAULT = 500`. In `allocate`, compute base budget using existing resolution order (rulePack.budgetOverride, then config.getBudgetForTaskClass, then config.getMaxTokens). If `sessionContext?.conversationTokens` is defined, set `availableBudget = CONTEXT_WINDOW_DEFAULT - RESERVED_RESPONSE_DEFAULT - Number(sessionContext.conversationTokens) - TEMPLATE_OVERHEAD_DEFAULT`, clamp to non-negative with `Math.max(0, availableBudget)`, then return `toTokenCount(Math.min(Number(baseBudget), availableBudget))`. Otherwise return base budget unchanged.

**Verify:** `pnpm typecheck` passes. Existing tests still pass (allocate with two args unchanged).

### Step 4a: Add conversationTokens to PipelineStepsRequest and pass sessionContext in runPipelineSteps

In `shared/src/core/run-pipeline-steps.ts`, add `conversationTokens?: TokenCount` to `PipelineStepsRequest`. Where `budget = deps.budgetAllocator.allocate(rulePack, task.taskClass)` is called, build sessionContext: when `request.conversationTokens !== undefined`, pass `{ conversationTokens: request.conversationTokens }` as the third argument; otherwise pass `undefined` or omit. Ensure `TokenCount` is imported if not already.

**Verify:** `pnpm typecheck` passes.

### Step 4b: Pass request.conversationTokens into pipelineRequest in compilation-runner

In `shared/src/pipeline/compilation-runner.ts`, in the object passed to `runPipelineSteps` (the `pipelineRequest` in `runFreshPath`), add `...(request.conversationTokens !== undefined ? { conversationTokens: request.conversationTokens } : {})` so that when the compile request includes conversationTokens it is forwarded to the pipeline.

**Verify:** `pnpm typecheck` passes.

### Step 5: Add session-cap tests

In `shared/src/pipeline/__tests__/budget-allocator.test.ts`, add test cases:

- **session_cap_applied_when_conversation_tokens_provided:** Config returning 10000; call `allocate(rulePack, taskClass, { conversationTokens: toTokenCount(115_000) })`. Available = 128_000 - 4_000 - 115_000 - 500 = 8500. Assert result equals 8500 (cap applied, below base 10000).
- **cap_does_not_exceed_base_budget:** When conversationTokens is 1000, availableBudget (123500) exceeds base 10000; call allocate with sessionContext `{ conversationTokens: toTokenCount(1000) }` and assert result equals base budget.
- **available_budget_clamped_non_negative:** When conversationTokens is 200_000, availableBudget is negative; assert result equals toTokenCount(0).

Keep all existing tests unchanged (they call allocate with two arguments).

**Verify:** `pnpm test shared/src/pipeline/__tests__/budget-allocator.test.ts` passes.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                      | Description                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| uses rulePack.budgetOverride when present                      | (existing) Resolution order: override wins                   |
| falls to config.getBudgetForTaskClass when no override         | (existing) Per-task budget used                              |
| falls to config.getMaxTokens when perTaskClass returns null    | (existing) Max tokens fallback                               |
| returns config base value when getMaxTokens is the only source | (existing) Two-arg backward compat                           |
| session_cap_applied_when_conversation_tokens_provided          | With conversationTokens, result is capped to availableBudget |
| cap_does_not_exceed_base_budget                                | When available > base, result equals base                    |
| available_budget_clamped_non_negative                          | Very large conversationTokens yields 0 budget                |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
