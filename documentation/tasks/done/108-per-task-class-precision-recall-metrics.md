# Task 108: Per-task-class precision/recall metrics in benchmarks

> **Status:** Done
> **Phase:** Q (Research-Backed Quality & Security)
> **Layer:** test/benchmarks
> **Depends on:** Block/line-level gold annotations in benchmark suite

## Goal

Add file-level precision and recall to the selection-quality benchmark, computed per gold case and grouped by task class, so we can track context retrieval quality by task type. Block/line granularity is out of scope until PipelineTrace exposes chunk/line selection.

## Architecture Notes

- Benchmark recipe: metric evolution only; no pipeline or production code changes. Single file modify: selection-quality-benchmark.test.ts.
- Task class comes from the pipeline: use trace.taskClass.taskClass to group metrics. Gold JSON is unchanged (no taskClass field in gold).
- File-level only: PipelineTrace.selectedFiles has no chunk/line data; block/line P/R is future work.
- Precision = TP/(TP+FP), recall = TP/(TP+FN) with TP = |selected ∩ gold|, FP = |selected \ gold|, FN = |gold \ selected|. When denominator is 0, use 0.

## Files

| Action | Path                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| Modify | `shared/src/integration/__tests__/selection-quality-benchmark.test.ts` (add P/R helper, add precision_recall test) |

## Gold Data Schema

Existing shape (unchanged). Test reads expected-selection/N.json and uses selectedPaths for file-level comparison.

**Field mapping for file-level P/R:**

| Gold field      | Pipeline output            |
| --------------- | -------------------------- |
| `selectedPaths` | Gold set of relevant paths |
| —               | trace.selectedFiles[].path |
| —               | trace.taskClass.taskClass  |

Gold files: expected-selection/1.json (task id 1). Use the list of task ids [1] to drive the test; read each as expected-selection/${id}.json.

## Dependent Types

Benchmark test uses existing types. Trace: PipelineTrace (intent, taskClass: TaskClassification, selectedFiles: readonly SelectedFile[]). Gold: parsed JSON with intent, selectedPaths: string[], optional blocks.

### Tier 2 — path-only (test already uses these)

| Type           | Path                   | Factory / usage          |
| -------------- | ---------------------- | ------------------------ |
| `AbsolutePath` | `#core/types/paths.js` | `toAbsolutePath(string)` |
| `FilePath`     | `#core/types/paths.js` | `toFilePath(string)`     |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add file-level precision/recall helper and per-task-class aggregation

In `shared/src/integration/__tests__/selection-quality-benchmark.test.ts`, add a helper that takes (actualPaths: string[], expectedPaths: string[]) and returns { precision, recall } where: expectedSet = new Set(expectedPaths), actualSet = new Set(actualPaths), TP = number of elements in actualSet that are in expectedSet, FP = actualSet.size - TP, FN = expectedSet.size - TP, precision = (TP+FP)>0 ? TP/(TP+FP) : 0, recall = (TP+FN)>0 ? TP/(TP+FN) : 0. Add a type for per-task-class metrics: Record<string, { precision: number; recall: number }>. The test will aggregate results by trace.taskClass.taskClass into this shape.

**Verify:** File still passes `pnpm test shared/src/integration/__tests__/selection-quality-benchmark.test.ts` (existing tests unchanged).

### Step 2: Add test precision_recall_file_level_per_task_class

In the same describe block, add a new test `precision_recall_file_level_per_task_class`. For each task id in [1]: resolve fixture root to test/benchmarks/repos/${id}, create scope and deps using the same wiring as selection_quality_task1_matches_baseline (createProjectScope, LoadConfigFromFile, applyConfigResult, createFullPipelineDeps, InspectRunner). Read expected-selection/${id}.json, parse to get intent and selectedPaths. Build InspectRequest with that intent, projectRoot = fixture root, configPath null, dbPath toFilePath(path.join(fixtureRoot, ".aic", "aic.sqlite")). Run trace = await runner.inspect(request). Compute actualPaths = trace.selectedFiles.map((f) => f.path as string). Call the P/R helper with (actualPaths, baseline.selectedPaths). Accumulate metrics by task class: for trace.taskClass.taskClass, set { precision, recall } for that key in a Record<string, { precision: number; recall: number }>. After processing task 1, assert that the metrics record has at least one entry (the refactor class). Assert that for that class, precision >= 0 and recall >= 0 and precision <= 1 and recall <= 1. Use it(..., 30_000) for timeout.

**Verify:** `pnpm test shared/src/integration/__tests__/selection-quality-benchmark.test.ts` runs all three tests; all pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                  | Description                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| selection_quality_task1_matches_baseline   | File-level selection still matches gold selectedPaths (unchanged)              |
| gold_task1_includes_blocks                 | Gold file parses and has blocks array of length 3 (unchanged)                  |
| precision_recall_file_level_per_task_class | File-level P/R computed per gold case, grouped by task class; metrics in [0,1] |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] Helper computes file-level precision and recall with 0/0 handled as 0
- [ ] precision_recall_file_level_per_task_class runs pipeline for task id 1, groups by trace.taskClass.taskClass, asserts metrics in valid range
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test shared/src/integration/__tests__/selection-quality-benchmark.test.ts` — all three tests pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
