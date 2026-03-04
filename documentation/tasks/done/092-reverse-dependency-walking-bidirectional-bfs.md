# Task 092: Reverse dependency walking (bidirectional BFS)

> **Status:** Done
> **Phase:** Phase R — OSS Release Prep (Project Plan Phase 1.0)
> **Layer:** pipeline
> **Depends on:** Import graph signal (TS/JS)

## Goal

Extend ImportGraphProximityScorer so import proximity uses bidirectional BFS: from seed files, expand along both forward edges (files the seed imports) and reverse edges (files that import the seed). Same depth-to-score mapping; callers of seed files receive depth-1 score (0.6).

## Architecture Notes

- No new interface; ImportProximityScorer.getScores contract unchanged.
- Pipeline: add pure helper buildReverseEdges(edges); extend bfsScores to accept forward and reverse edge maps and expand both directions in one BFS; getScores builds reverse edges and passes both to bfsScores.
- Immutability: buildReverseEdges uses reduce, no .push(). depthToScore unchanged (0→1.0, 1→0.6, 2→0.3, 3+→0.1).

## Files

| Action | Path                                                                  |
| ------ | --------------------------------------------------------------------- |
| Modify | `shared/src/pipeline/import-graph-proximity-scorer.ts`                |
| Modify | `shared/src/pipeline/__tests__/import-graph-proximity-scorer.test.ts` |

## Interface / Signature

```typescript
// ImportProximityScorer — unchanged
import type { RepoMap } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RelativePath } from "#core/types/paths.js";

export interface ImportProximityScorer {
  getScores(
    repo: RepoMap,
    task: TaskClassification,
  ): Promise<ReadonlyMap<RelativePath, number>>;
}
```

```typescript
// ImportGraphProximityScorer — constructor unchanged; getScores implements bidirectional BFS
constructor(
  private readonly fileContentReader: FileContentReader,
  private readonly languageProviders: readonly LanguageProvider[],
) {}

async getScores(
  repo: RepoMap,
  task: TaskClassification,
): Promise<ReadonlyMap<RelativePath, number>>
```

## Dependent Types

### Tier 2 — path-only

| Type           | Path                             | Factory             |
| -------------- | -------------------------------- | ------------------- |
| `RelativePath` | `shared/src/core/types/paths.js` | `toRelativePath(s)` |

## Config Changes

- **shared/package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Bidirectional BFS in import-graph-proximity-scorer

In `shared/src/pipeline/import-graph-proximity-scorer.ts`:

1. Add a pure function `buildReverseEdges(edges: ReadonlyMap<RelativePath, readonly RelativePath[]>): ReadonlyMap<RelativePath, readonly RelativePath[]>`. For each entry (from, toList) in edges, for each `to` in toList, add `from` to the reverse map at key `to`. Build the reverse map immutably (reduce over entries; for each to, accumulate [...(existing at to), from] without mutating arrays).

2. Change `bfsScores` to accept two arguments: `edges` and `reverseEdges` (both `ReadonlyMap<RelativePath, readonly RelativePath[]>`). When expanding a node, set `nexts` to the concatenation of (edges.get(path) ?? []) and (reverseEdges.get(path) ?? []), then filter by !visited.has(to) and map to { path, depth: head.depth + 1 }. All other BFS logic unchanged (visited set, depthToScore, initial scoreMap zeros).

3. In `getScores`, after `const edges = await buildEdges(...)`, compute `const reverseEdges = buildReverseEdges(edges)` and call `return bfsScores(seeds, edges, reverseEdges, allPaths)`. Update the `bfsScores` signature to accept `allPaths` as the fourth parameter (unchanged type).

**Verify:** `pnpm typecheck` passes. `pnpm test shared/src/pipeline/__tests__/import-graph-proximity-scorer.test.ts` passes (existing tests).

### Step 2: Add test reverse_dependency_scores_importer_of_seed

In `shared/src/pipeline/__tests__/import-graph-proximity-scorer.test.ts`, add a test case `reverse_dependency_scores_importer_of_seed`: build a repo with two files, `seed.ts` (task-relevant via matchedKeywords) and `caller.ts`. Stub the provider so `caller.ts` parses to an import of `./seed` (relative) and `seed.ts` has no imports. Stub fileContentReader to return the corresponding content. Call scorer.getScores(repo, makeTask(["seed"])). Assert scores.get(callerPath) === 0.6 (depth 1 from seed via reverse edge).

**Verify:** All tests in import-graph-proximity-scorer.test.ts pass, including the new one.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                  | Description                                        |
| ------------------------------------------ | -------------------------------------------------- |
| reverse_dependency_scores_importer_of_seed | File that imports a seed gets depth-1 score (0.6). |

## Acceptance Criteria

- [ ] buildReverseEdges(edges) returns map: for each (from, toList), each to maps to importers including from
- [ ] bfsScores(seeds, edges, reverseEdges, allPaths) expands along both forward and reverse edges; depthToScore unchanged
- [ ] getScores builds reverseEdges from edges and passes both to bfsScores
- [ ] reverse_dependency_scores_importer_of_seed test passes
- [ ] Existing import-graph-proximity-scorer tests pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in changed code
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
