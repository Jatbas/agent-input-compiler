# Task 091: Adaptive scoring weights per task class

> **Status:** Pending
> **Phase:** Phase P — Context Quality & Token Efficiency
> **Layer:** pipeline
> **Depends on:** —

## Goal

Use task-class-specific default scoring weights in HeuristicSelector so REFACTOR favors import proximity, BUGFIX favors recency and import proximity, and DOCS favors path relevance; explicit config.weights still overrides for all tasks.

## Architecture Notes

- ADR-010: TaskClass from core/types/enums (as const). No new interfaces; extend HeuristicSelectorConfig with ScoringWeights type.
- Pipeline: no new class; modify HeuristicSelector.selectContext to resolve weights from config.weights ?? DEFAULT_WEIGHTS_BY_TASK_CLASS[task.taskClass].
- Chosen approach: ScoringWeights type in core/interfaces; DEFAULT_WEIGHTS_BY_TASK_CLASS in selector; direct Record lookup (no 3+ branch dispatch).

## Files

| Action | Path                                                                | Notes                                                                |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Modify | `shared/src/core/interfaces/heuristic-selector-config.interface.ts` | Add ScoringWeights type; weights?: ScoringWeights                    |
| Modify | `shared/src/pipeline/heuristic-selector.ts`                         | Add DEFAULT_WEIGHTS_BY_TASK_CLASS; resolve weights by task.taskClass |
| Modify | `shared/src/pipeline/__tests__/heuristic-selector.test.ts`          | Add four test cases for task-class weights and config override       |

## Interface / Signature

```typescript
// HeuristicSelectorConfig (existing; add ScoringWeights type)
export type ScoringWeights = {
  readonly pathRelevance: number;
  readonly importProximity: number;
  readonly recency: number;
  readonly sizePenalty: number;
};

export interface HeuristicSelectorConfig {
  readonly maxFiles: number;
  readonly weights?: ScoringWeights;
}
```

```typescript
// HeuristicSelector — constructor unchanged; selectContext resolves weights
constructor(
  private readonly languageProviders: readonly LanguageProvider[],
  private readonly config: HeuristicSelectorConfig,
  private readonly importProximityScorer: ImportProximityScorer,
) {}

async selectContext(
  task: TaskClassification,
  repo: RepoMap,
  budget: TokenCount,
  rulePack: RulePack,
): Promise<ContextResult>
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// TaskClassification — component reads task.taskClass
import type { TaskClass } from "#core/types/enums.js";
import type { Confidence } from "#core/types/scores.js";

export interface TaskClassification {
  readonly taskClass: TaskClass;
  readonly confidence: Confidence;
  readonly matchedKeywords: readonly string[];
}
```

### Tier 2 — path-only

| Type           | Path                             | Factory / usage     |
| -------------- | -------------------------------- | ------------------- |
| `TaskClass`    | `shared/src/core/types/enums.js` | TASK_CLASS.\* keys  |
| `TokenCount`   | `shared/src/core/types/units.js` | `toTokenCount(n)`   |
| `RelativePath` | `shared/src/core/types/paths.js` | `toRelativePath(s)` |

## Config Changes

- **shared/package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1a: Add ScoringWeights type to heuristic-selector-config

In `shared/src/core/interfaces/heuristic-selector-config.interface.ts`, add a type alias `ScoringWeights` with readonly fields pathRelevance, importProximity, recency, sizePenalty (all number). Change `weights?:` to use `ScoringWeights` instead of the inline object type.

**Verify:** `pnpm typecheck` passes; no other file needs change for the type yet.

### Step 1b: Add DEFAULT_WEIGHTS_BY_TASK_CLASS in heuristic-selector

In `shared/src/pipeline/heuristic-selector.ts`, import `TASK_CLASS` and type `TaskClass` from `#core/types/enums.js` and type `ScoringWeights` from the heuristic-selector-config interface. Define `DEFAULT_WEIGHTS_BY_TASK_CLASS: Record<TaskClass, ScoringWeights>` with six entries: REFACTOR (importProximity 0.45, pathRelevance 0.25, recency 0.2, sizePenalty 0.1), BUGFIX (recency 0.3, importProximity 0.35, pathRelevance 0.25, sizePenalty 0.1), DOCS (pathRelevance 0.5, importProximity 0.2, recency 0.2, sizePenalty 0.1), FEATURE TEST GENERAL each (pathRelevance 0.4, importProximity 0.3, recency 0.2, sizePenalty 0.1). Remove the old `DEFAULT_WEIGHTS` constant. Update `scoreCandidate` to accept `weights: ScoringWeights` instead of `typeof DEFAULT_WEIGHTS`.

**Verify:** `pnpm typecheck` passes.

### Step 2: Resolve weights by task class in selectContext

In `selectContext`, set `const weights = this.config.weights ?? DEFAULT_WEIGHTS_BY_TASK_CLASS[task.taskClass]`. Pass `weights` into the existing scoreCandidate and sort/fitToBudget flow. Use optional chaining for config.weights: when absent, use the lookup.

**Verify:** `pnpm test shared/src/pipeline/__tests__/heuristic-selector.test.ts` — existing tests pass.

### Step 3: Add tests for task-class weights and config override

In `shared/src/pipeline/__tests__/heuristic-selector.test.ts`, add four test cases:

- **refactor_uses_higher_import_proximity_weight:** Build a repo with two files; give one a higher import proximity score via a stub scorer that returns a non-zero score for that path. Call selectContext with taskClass REFACTOR and with taskClass GENERAL. Assert that under REFACTOR the file with higher import score is ranked first (or has higher relevanceScore), and under GENERAL the order can differ when path/recency/size would otherwise dominate.
- **bugfix_uses_higher_recency_and_import_weights:** Two files: one newer lastModified, one with higher import score. Task BUGFIX vs GENERAL. Assert selection order or first-selected file differs when task is BUGFIX vs GENERAL in a way consistent with higher recency/import weight.
- **docs_uses_higher_path_relevance_weight:** Two files: one path "readme.md", one path "src/util.ts". Use DOCS task with matchedKeywords ["readme"]. Assert DOCS task ranks readme.md first; with GENERAL task assert the first-selected file or order differs (path relevance weighted higher for DOCS).
- **config_weights_override_per_task_defaults:** Create selector with config `{ maxFiles: 20, weights: { pathRelevance: 0.1, importProximity: 0.1, recency: 0.7, sizePenalty: 0.1 } }`. Call selectContext with task REFACTOR. Assert that selection order reflects the custom weights (recency-dominated) rather than REFACTOR defaults (import-dominated).

**Verify:** All four new tests and existing tests pass.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                     | Description                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| refactor_uses_higher_import_proximity_weight  | REFACTOR task favors file with higher import score vs GENERAL.             |
| bugfix_uses_higher_recency_and_import_weights | BUGFIX task selection order reflects recency/import more than GENERAL.     |
| docs_uses_higher_path_relevance_weight        | DOCS task ranks path-relevant file higher than GENERAL.                    |
| config_weights_override_per_task_defaults     | Explicit config.weights is used for REFACTOR instead of REFACTOR defaults. |

## Acceptance Criteria

- [ ] HeuristicSelectorConfig exports ScoringWeights; weights?: ScoringWeights
- [ ] DEFAULT_WEIGHTS_BY_TASK_CLASS has six entries; REFACTOR/BUGFIX/DOCS use specified weights; FEATURE/TEST/GENERAL use 0.4/0.3/0.2/0.1
- [ ] selectContext uses config.weights ?? DEFAULT_WEIGHTS_BY_TASK_CLASS[task.taskClass]
- [ ] All four new test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in changed code
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
