# Task 003: Phase C — IntentClassifier, RulePackResolver, BudgetAllocator

> **Status:** Pending
> **Phase:** C (Pipeline Steps 1–8)
> **Layer:** pipeline
> **Depends on:** Phase B (all Done), Task 002 (core pipeline types)

## Goal

Implement the first three pipeline steps — classify intent, resolve rule packs, allocate token budget — so downstream steps have a TaskClassification, merged RulePack, and TokenCount budget to work with.

## Architecture Notes

- Pipeline layer may import from `#core/` only — no adapters, storage, Node, or external packages
- Constructor injection for all dependencies (RulePackProvider, BudgetConfig)
- No `Date.now()`, `Math.random()`, or mutating array methods
- One class per file; classes implement the corresponding core port interface

## Files

| Action | Path                                             |
| ------ | ------------------------------------------------ |
| Create | `shared/src/pipeline/intent-classifier.ts`       |
| Create | `shared/src/pipeline/intent-classifier.test.ts`  |
| Create | `shared/src/pipeline/rule-pack-resolver.ts`      |
| Create | `shared/src/pipeline/rule-pack-resolver.test.ts` |
| Create | `shared/src/pipeline/budget-allocator.ts`        |
| Create | `shared/src/pipeline/budget-allocator.test.ts`   |

## Interface / Signature

```typescript
// shared/src/pipeline/intent-classifier.ts
import type { IntentClassifier as IIntentClassifier } from "#core/interfaces/intent-classifier.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";

export class IntentClassifier implements IIntentClassifier {
  classify(intent: string): TaskClassification;
}
```

Keyword table (from MVP spec §4 Step 1):

| Task Class | Keywords                                              |
| ---------- | ----------------------------------------------------- |
| `refactor` | refactor, restructure, reorganize, clean up, simplify |
| `bugfix`   | fix, bug, broken, error, crash, issue, repair         |
| `feature`  | add, create, implement, build, new, introduce         |
| `docs`     | document, readme, jsdoc, comment, explain, describe   |
| `test`     | test, spec, coverage, assert, mock, unit test         |
| `general`  | _(fallback when no keywords match)_                   |

Edge cases: multiple classes match → highest keyword-count wins; ties → alphabetical first. No match → `general` with confidence `0.0`.

```typescript
// shared/src/pipeline/rule-pack-resolver.ts
import type { RulePackResolver as IRulePackResolver } from "#core/interfaces/rule-pack-resolver.interface.js";
import type { RulePackProvider } from "#core/interfaces/rule-pack-provider.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { AbsolutePath } from "#core/types/paths.js";

export class RulePackResolver implements IRulePackResolver {
  constructor(private readonly rulePackProvider: RulePackProvider) {}

  resolve(task: TaskClassification, projectRoot: AbsolutePath): RulePack;
}
```

Merge order (from MVP spec §4 Step 2):

1. Load `built-in:default` (always)
2. Load task-class-specific built-in (e.g. `built-in:refactor`)
3. Load project-level pack from provider
4. Merge: project > task-specific > default. Arrays concatenated + deduplicated; scalars (`budgetOverride`) last-wins.

```typescript
// shared/src/pipeline/budget-allocator.ts
import type { BudgetAllocator as IBudgetAllocator } from "#core/interfaces/budget-allocator.interface.js";
import type { BudgetConfig } from "#core/interfaces/budget-config.interface.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { TaskClass } from "#core/types/enums.js";
import type { TokenCount } from "#core/types/units.js";
import { toTokenCount } from "#core/types/units.js";

export class BudgetAllocator implements IBudgetAllocator {
  constructor(private readonly config: BudgetConfig) {}

  allocate(rulePack: RulePack, taskClass: TaskClass): TokenCount;
}
```

Resolution order (from MVP spec §4 Step 3, within the allocator's scope — CLI flag is applied upstream by composition root):

1. `rulePack.budgetOverride` (if present)
2. `config.getBudgetForTaskClass(taskClass)` (if non-null)
3. `config.getMaxTokens()`
4. Hard-coded default: `toTokenCount(8000)`

## Steps

### Step 1: IntentClassifier implementation

Create `shared/src/pipeline/intent-classifier.ts`. Implement keyword matching: lowercase the intent, count keyword hits per task class, return highest-count class. Tie-break: alphabetical first. No match: `general` with confidence `0.0`. Confidence when matched: `matchedCount / totalKeywordsInClass` (clamped to 1.0).

**Verify:** `pnpm typecheck` passes.

### Step 2: IntentClassifier tests

Create `shared/src/pipeline/intent-classifier.test.ts` with cases:

- Each keyword set returns correct task class
- `general` fallback when no keywords match (confidence 0.0)
- Tie-breaking: multiple classes match same count → alphabetical first
- Multi-keyword intent → highest count wins
- Case insensitivity

**Verify:** `pnpm test -- intent-classifier` passes.

### Step 3: RulePackResolver implementation

Create `shared/src/pipeline/rule-pack-resolver.ts`. Load default + task-specific + project packs from provider. Merge arrays (concat + deduplicate); scalars last-wins. Missing project pack → use built-ins only.

**Verify:** `pnpm typecheck` passes.

### Step 4: RulePackResolver tests

Create `shared/src/pipeline/rule-pack-resolver.test.ts` with cases:

- Built-in packs load and merge correctly
- Project pack overrides built-ins (arrays merged, scalars overridden)
- Missing project pack → falls back to built-ins only
- Merge deduplicates array entries

**Verify:** `pnpm test -- rule-pack-resolver` passes.

### Step 5: BudgetAllocator implementation

Create `shared/src/pipeline/budget-allocator.ts`. Implement resolution order: rulePack.budgetOverride → config perTaskClass → config maxTokens → default 8000.

**Verify:** `pnpm typecheck` passes.

### Step 6: BudgetAllocator tests

Create `shared/src/pipeline/budget-allocator.test.ts` with cases:

- `rulePack.budgetOverride` takes precedence
- Falls to `config.getBudgetForTaskClass` when no override
- Falls to `config.getMaxTokens` when perTaskClass returns null
- Falls to 8000 default when config returns base value

**Verify:** `pnpm test -- budget-allocator` passes.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

| Test case                           | Description                                         |
| ----------------------------------- | --------------------------------------------------- |
| intent-classifier: correct class    | Each keyword set maps to correct TaskClass          |
| intent-classifier: general fallback | No-match returns general with confidence 0.0        |
| intent-classifier: tie-break        | Equal counts → alphabetical first                   |
| rule-pack-resolver: merge order     | Project > task-specific > default                   |
| rule-pack-resolver: missing project | Falls back to built-ins                             |
| budget-allocator: resolution order  | rulePack override > perTaskClass > maxTokens > 8000 |

## Acceptance Criteria

- [ ] All 6 files created per Files table
- [ ] IntentClassifier matches keyword table from MVP spec exactly
- [ ] RulePackResolver merge order matches spec
- [ ] BudgetAllocator resolution order matches spec (within allocator scope)
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] No imports from adapters, storage, Node, or external packages

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section to this file with:
   - What you tried
   - What went wrong
   - What decision you need from the user
3. Report to the user and wait for guidance
