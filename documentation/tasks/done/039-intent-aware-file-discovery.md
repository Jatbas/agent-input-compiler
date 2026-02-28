# Task 039: Intent-aware file discovery

> **Status:** Done
> **Phase:** Phase J — Intent & Selection Quality
> **Layer:** pipeline
> **Depends on:** Richer intent keyword extraction (Done)

## Goal

Add a pipeline step that narrows the RepoMap to intent-relevant files before context selection, so the selector scores a smaller candidate set and selection quality improves.

## Architecture Notes

- OCP: New step implements new interface; HeuristicSelector unchanged. Pipeline step in shared/src/pipeline; interface in core/interfaces.
- Hexagonal: No adapters, no storage, no Node APIs. Uses only matchesGlob from pipeline and core types.
- Design: discover(repo, task, rulePack) returns new RepoMap; empty filter returns repo unchanged so pipeline never fails at discovery.

## Files

| Action | Path                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/intent-aware-file-discoverer.interface.ts`                                                                        |
| Create | `shared/src/pipeline/intent-aware-file-discoverer.ts`                                                                                         |
| Create | `shared/src/pipeline/__tests__/intent-aware-file-discoverer.test.ts`                                                                          |
| Modify | `shared/src/core/run-pipeline-steps.ts` (add intentAwareFileDiscoverer to deps, call discover after getRepoMap, pass result to selectContext) |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate IntentAwareFileDiscoverer, add to returned deps)                                  |

## Interface / Signature

```typescript
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { RulePack } from "#core/types/rule-pack.js";

export interface IntentAwareFileDiscoverer {
  discover(repo: RepoMap, task: TaskClassification, rulePack: RulePack): RepoMap;
}
```

```typescript
export class IntentAwareFileDiscoverer implements IntentAwareFileDiscoverer {
  constructor() {}

  discover(repo: RepoMap, task: TaskClassification, rulePack: RulePack): RepoMap {
    // Filter repo.files by excludePatterns, then includePatterns or keyword match; recompute totalFiles/totalTokens; if filtered empty return repo.
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// RepoMap, FileEntry — shared/src/core/types/repo-map.ts
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";
import type { Bytes, TokenCount } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface FileEntry {
  readonly path: RelativePath;
  readonly language: string;
  readonly sizeBytes: Bytes;
  readonly estimatedTokens: TokenCount;
  readonly lastModified: ISOTimestamp;
}

export interface RepoMap {
  readonly root: AbsolutePath;
  readonly files: readonly FileEntry[];
  readonly totalFiles: number;
  readonly totalTokens: TokenCount;
}
```

```typescript
// TaskClassification — shared/src/core/types/task-classification.ts
import type { TaskClass } from "#core/types/enums.js";
import type { Confidence } from "#core/types/scores.js";

export interface TaskClassification {
  readonly taskClass: TaskClass;
  readonly confidence: Confidence;
  readonly matchedKeywords: readonly string[];
}
```

```typescript
// RulePack — shared/src/core/types/rule-pack.ts
import type { GlobPattern } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";

export interface RulePack {
  readonly name?: string;
  readonly version?: number;
  readonly description?: string;
  readonly constraints: readonly string[];
  readonly includePatterns: readonly GlobPattern[];
  readonly excludePatterns: readonly GlobPattern[];
  readonly budgetOverride?: TokenCount;
  readonly heuristic?: {
    readonly boostPatterns: readonly GlobPattern[];
    readonly penalizePatterns: readonly GlobPattern[];
  };
}
```

### Tier 1 — signature + path

None.

### Tier 2 — path-only

| Type         | Path                             | Factory             |
| ------------ | -------------------------------- | ------------------- |
| `TokenCount` | `shared/src/core/types/units.ts` | `toTokenCount(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create interface

Create `shared/src/core/interfaces/intent-aware-file-discoverer.interface.ts` with the IntentAwareFileDiscoverer interface and the exact import block and method signature from the Interface / Signature section above.

**Verify:** File exists; `pnpm typecheck` passes from repo root.

### Step 2: Implement discoverer

Create `shared/src/pipeline/intent-aware-file-discoverer.ts`. Implement IntentAwareFileDiscoverer with a parameterless constructor. In discover: filter repo.files so a file is included iff (1) it does not match any rulePack.excludePatterns (use matchesGlob from ./glob-match.js); (2) if rulePack.includePatterns.length > 0, it matches at least one include pattern; (3) if rulePack.includePatterns.length === 0 and task.matchedKeywords.length > 0, its path (case-insensitive) contains at least one matched keyword; (4) if rulePack.includePatterns.length === 0 and task.matchedKeywords.length === 0, include all non-excluded files. If the filtered array is empty, return the original repo unchanged. Otherwise return a new RepoMap with repo.root, files set to the filtered array, totalFiles set to filtered length, totalTokens set to toTokenCount(sum of file.estimatedTokens over filtered files). Do not mutate repo.

**Verify:** `pnpm typecheck` passes; no imports from adapters, storage, or Node.

### Step 3: Wire discoverer in runPipelineSteps

In `shared/src/core/run-pipeline-steps.ts`: add `readonly intentAwareFileDiscoverer: IntentAwareFileDiscoverer` to PipelineStepsDeps (import the interface from core/interfaces). After the line that assigns repoMap from getRepoMap (or repoMapOverride), set a local variable discoveredRepoMap = deps.intentAwareFileDiscoverer.discover(repoMap, task, rulePack). Pass discoveredRepoMap (not repoMap) as the second argument to deps.contextSelector.selectContext. Keep the rest of the function unchanged; the repoMap field in the returned result remains the full repoMap (before discovery) for cache/trace consistency.

**Verify:** `pnpm typecheck` passes; runPipelineSteps still returns PipelineStepsResult.

### Step 4: Wire discoverer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`: import IntentAwareFileDiscoverer from the pipeline implementation. In createPipelineDeps, before the return statement, create const intentAwareFileDiscoverer = new IntentAwareFileDiscoverer(). Add intentAwareFileDiscoverer to the returned object. In createFullPipelineDeps, the spread of partial already includes intentAwareFileDiscoverer; no extra change there.

**Verify:** `pnpm typecheck` passes; createFullPipelineDeps return type still satisfies PipelineStepsDeps.

### Step 5: Add tests

Create `shared/src/pipeline/__tests__/intent-aware-file-discoverer.test.ts`. Use a single describe("IntentAwareFileDiscoverer") and the following test cases. Build RepoMap and TaskClassification using toAbsolutePath, toRelativePath, toTokenCount, toISOTimestamp, and task classification shapes that match each test scenario.

- **keyword_filter_narrows_files:** RepoMap with five FileEntry paths: src/auth/service.ts, src/index.ts, src/other.ts, docs/readme.md, src/auth/helper.ts. Task with matchedKeywords ["auth"]. RulePack with empty includePatterns and excludePatterns. Assert discover returns a RepoMap whose files array has length 2 and both paths include "auth".
- **include_patterns_restrict_candidates:** RepoMap with files including src/foo.ts and docs/readme.md. Task with matchedKeywords []. RulePack with includePatterns ["src/**/*.ts"] and empty excludePatterns. Assert discover returns only files under src/.
- **exclude_patterns_applied:** RepoMap with files including src/foo.ts and node_modules/pkg/index.js. RulePack with empty includePatterns and excludePatterns ["**/node_modules/**"]. Assert discover result has no node_modules path.
- **general_task_no_keyword_filter:** RepoMap with multiple files. Task with matchedKeywords [] (general). RulePack with empty include and exclude. Assert discover returns a RepoMap with the same files length as repo.files.
- **empty_filter_returns_original_repo:** RepoMap with files whose paths do not contain "xyznone". Task with matchedKeywords ["xyznone"]. RulePack with empty include and exclude. Assert discover returns a RepoMap with the same root and the same files length as the input repo so the selector still receives a valid repo.

**Verify:** `pnpm test -- shared/src/pipeline/__tests__/intent-aware-file-discoverer.test.ts` — all five tests pass.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                            | Description                                                |
| ------------------------------------ | ---------------------------------------------------------- |
| keyword_filter_narrows_files         | Paths containing "auth" only when matchedKeywords ["auth"] |
| include_patterns_restrict_candidates | Only src/\*_/_.ts when includePatterns set                 |
| exclude_patterns_applied             | No node_modules when excludePatterns set                   |
| general_task_no_keyword_filter       | All non-excluded files when matchedKeywords empty          |
| empty_filter_returns_original_repo   | Original repo returned when filter would be empty          |

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
