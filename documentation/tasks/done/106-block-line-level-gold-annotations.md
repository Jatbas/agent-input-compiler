# Task 106: Block/line-level gold annotations in benchmark suite

> **Status:** Done
> **Phase:** Q (Research-Backed Quality & Security)
> **Layer:** test/benchmarks
> **Depends on:** —

## Goal

Enrich the benchmark gold set from path-only to block/line ranges per file so the expected-selection format supports ContextBench-style evaluation; the next task (per-task-class precision/recall metrics) will consume this gold data. Existing file-level comparison remains backward-compatible.

## Architecture Notes

- Benchmark recipe: gold data enrichment only; no pipeline or production code changes.
- Backward compatibility: existing field `selectedPaths` unchanged; new field `blocks` is additive. `selection_quality_task1_matches_baseline` continues to compare only `selectedPaths`.
- Gold annotations are verified against fixture repo line numbers (see Steps). Line numbers in gold data are 1-based, inclusive (startLine, endLine).
- ADR-010: gold data uses plain JSON; no branded types in the file. The benchmark test parses JSON and compares to pipeline output.

## Files

| Action | Path                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| Modify | `test/benchmarks/expected-selection/1.json` (add `blocks` array)                                      |
| Modify | `shared/src/integration/__tests__/selection-quality-benchmark.test.ts` (add gold structure assertion) |

## Gold Data Schema

**TypeScript shape (contract for gold JSON and test parsing):**

```typescript
interface GoldBlock {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
}

interface ExpectedSelectionGold {
  readonly intent: string;
  readonly selectedPaths: readonly string[];
  readonly blocks?: readonly GoldBlock[];
}
```

**Field mapping to pipeline output:**

| Gold field           | Pipeline / fixture meaning                          |
| -------------------- | --------------------------------------------------- |
| `selectedPaths`      | `trace.selectedFiles[].path` — file-level selection |
| `blocks[].filePath`  | Relative path; must match a path in `selectedPaths` |
| `blocks[].startLine` | First line of relevant block (1-based, inclusive)   |
| `blocks[].endLine`   | Last line of relevant block (1-based, inclusive)    |

**Example JSON for task 1 (after enrichment):**

```json
{
  "intent": "refactor auth module to use middleware pattern",
  "selectedPaths": [
    "package-lock.json",
    "package.json",
    "src/auth/config.json",
    "src/auth/service.ts",
    "src/index.ts",
    "src/styles.css"
  ],
  "blocks": [
    { "filePath": "src/auth/service.ts", "startLine": 15, "endLine": 30 },
    { "filePath": "src/auth/service.ts", "startLine": 37, "endLine": 56 },
    { "filePath": "src/index.ts", "startLine": 6, "endLine": 12 }
  ]
}
```

## Dependent Types

Benchmark test reads gold JSON and compares to `PipelineTrace`. No new production types.

### Tier 2 — path-only (test already uses these)

| Type           | Path                   | Factory / usage          |
| -------------- | ---------------------- | ------------------------ |
| `AbsolutePath` | `#core/types/paths.js` | `toAbsolutePath(string)` |
| `FilePath`     | `#core/types/paths.js` | `toFilePath(string)`     |

The test does not require Tier 0 verbatim types in the task file; it uses existing `InspectRunner.inspect()` and `trace.selectedFiles`. Gold schema is defined above.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Enrich expected-selection gold with block/line ranges

Open `test/benchmarks/expected-selection/1.json`. Keep `intent` and `selectedPaths` exactly as they are. Add a top-level key `"blocks"` with an array of objects. Each object has `filePath`, `startLine`, `endLine` (all strings/numbers as in the example below).

Populate `blocks` from the fixture repo so each entry is verifiable:

- **src/auth/service.ts:** Two blocks: (1) `validateToken` at lines 15–30, (2) `createAuthMiddleware` at lines 37–56. Use `{ "filePath": "src/auth/service.ts", "startLine": 15, "endLine": 30 }` and `{ "filePath": "src/auth/service.ts", "startLine": 37, "endLine": 56 }`.
- **src/index.ts:** One block for auth-related lines (import and re-export): lines 6–12. Use `{ "filePath": "src/index.ts", "startLine": 6, "endLine": 12 }`.

Do not add blocks for selected files that have no intent-relevant code blocks; for task 1, package.json, package-lock.json, src/auth/config.json, and src/styles.css remain without block entries.

**Verify:** File exists; `JSON.parse` of the file yields an object with `intent`, `selectedPaths`, and `blocks`; `blocks` has exactly three entries as above.

### Step 2: Add gold structure assertion to selection-quality benchmark

In `shared/src/integration/__tests__/selection-quality-benchmark.test.ts`, add a second test in the same `describe` block: `gold_task1_includes_blocks`. In that test: read `test/benchmarks/expected-selection/1.json` with `fs.readFileSync`, `JSON.parse` the content, then `expect(parsed).toHaveProperty("blocks")` and `expect(Array.isArray(parsed.blocks)).toBe(true)` and `expect(parsed.blocks).toHaveLength(3)`. Use the same `baselinePath` construction as in `selection_quality_task1_matches_baseline` so the path is consistent.

**Verify:** `pnpm test shared/src/integration/__tests__/selection-quality-benchmark.test.ts` runs both tests; both pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                | Description                                           |
| ---------------------------------------- | ----------------------------------------------------- |
| selection_quality_task1_matches_baseline | File-level selection still matches gold selectedPaths |
| gold_task1_includes_blocks               | Gold file parses and has `blocks` array of length 3   |

## Acceptance Criteria

- [ ] `test/benchmarks/expected-selection/1.json` contains `blocks` with three entries as specified
- [ ] `selectedPaths` and `intent` unchanged from current content
- [ ] `pnpm test shared/src/integration/__tests__/selection-quality-benchmark.test.ts` passes
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
