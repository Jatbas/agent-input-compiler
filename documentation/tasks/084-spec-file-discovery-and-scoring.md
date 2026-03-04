# Task 084: Spec file discovery and scoring

> **Status:** Pending
> **Phase:** N (Specification Compiler)
> **Layer:** pipeline
> **Depends on:** (none — first in Phase N)

## Goal

Implement a pipeline step that, given a RepoMap of spec files (documentation, ADRs, rules, skills), filters by rulePack and task keywords, scores each file by spec path tier, keyword relevance, recency, and size, and returns a ContextResult for downstream spec summarisation and prompt assembly.

## Architecture Notes

- Pipeline step: one class, one public method, sync, no I/O. Caller supplies spec RepoMap (future SpecRepoMapSupplier or getSpecRepoMap); this task implements scoring only.
- Reuse ContextResult so "Spec-aware summarisation tier" and "Spec injection in prompt assembler" consume the same shape as code context.
- Reuse matchesGlob (glob-match.js), pathRelevance (path-relevance.js), and filter rules from IntentAwareFileDiscoverer; scoring pattern from HeuristicSelector (no import proximity for spec files).
- Dispatch pattern: specPathTier uses a handler array with `.find()` for ordered path-prefix matching (most specific prefix first, default 0.5). This avoids a 5-branch if/else-if chain banned by ESLint.
- RulePack.heuristic is optional (`heuristic?:`); access via optional chaining and default to 0 (same pattern as HeuristicSelector lines 82-86).

## Files

| Action | Path                                                           |
| ------ | -------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/spec-file-discoverer.interface.ts` |
| Create | `shared/src/pipeline/spec-file-discoverer.ts`                  |
| Create | `shared/src/pipeline/__tests__/spec-file-discoverer.test.ts`   |

## Interface / Signature

```typescript
import type { RepoMap } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { ContextResult } from "#core/types/selected-file.js";

export interface SpecFileDiscoverer {
  discover(
    specRepoMap: RepoMap,
    task: TaskClassification,
    rulePack: RulePack,
  ): ContextResult;
}
```

```typescript
import type { SpecFileDiscoverer as ISpecFileDiscoverer } from "#core/interfaces/spec-file-discoverer.interface.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { ContextResult } from "#core/types/selected-file.js";

export class SpecFileDiscoverer implements ISpecFileDiscoverer {
  constructor() {}

  discover(
    specRepoMap: RepoMap,
    task: TaskClassification,
    rulePack: RulePack,
  ): ContextResult {
    // Filter by exclude/include/keywords; score by spec path tier, pathRelevance, recency, size; sort desc; map to SelectedFile[]; return ContextResult.
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
import type { RelevanceScore } from "#core/types/scores.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface SelectedFile {
  readonly path: RelativePath;
  readonly language: string;
  readonly estimatedTokens: TokenCount;
  readonly relevanceScore: RelevanceScore;
  readonly tier: InclusionTier;
}

export interface ContextResult {
  readonly files: readonly SelectedFile[];
  readonly totalTokens: TokenCount;
  readonly truncated: boolean;
}
```

Source: shared/src/core/types/selected-file.ts

### Tier 1 — signature + path

| Type                 | Path                                         | Members                                                  | Purpose                     |
| -------------------- | -------------------------------------------- | -------------------------------------------------------- | --------------------------- |
| `RepoMap`            | shared/src/core/types/repo-map.ts            | root, files, totalFiles, totalTokens                     | discover input              |
| `TaskClassification` | shared/src/core/types/task-classification.ts | taskClass, confidence, matchedKeywords                   | discover input              |
| `RulePack`           | shared/src/core/types/rule-pack.ts           | constraints, includePatterns, excludePatterns, heuristic | discover input              |
| `FileEntry`          | shared/src/core/types/repo-map.ts            | path, language, sizeBytes, estimatedTokens, lastModified | read from specRepoMap.files |

### Tier 2 — path-only

| Type             | Path                            | Factory             |
| ---------------- | ------------------------------- | ------------------- |
| `RelativePath`   | shared/src/core/types/paths.js  | toRelativePath(raw) |
| `TokenCount`     | shared/src/core/types/units.js  | toTokenCount(n)     |
| `RelevanceScore` | shared/src/core/types/scores.js | toRelevanceScore(n) |
| `InclusionTier`  | shared/src/core/types/enums.js  | INCLUSION_TIER.L0   |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create SpecFileDiscoverer interface

Create `shared/src/core/interfaces/spec-file-discoverer.interface.ts` with the SpecFileDiscoverer interface and the exact import block and method signature from the Interface / Signature section above.

**Verify:** Run `pnpm typecheck` from repo root. Expected: clean.

### Step 2: Implement SpecFileDiscoverer.discover

Create `shared/src/pipeline/spec-file-discoverer.ts`. Implement the SpecFileDiscoverer interface with a parameterless constructor.

Define a module-level handler array for spec path tier scoring:

```typescript
const SPEC_PATH_TIERS: readonly {
  readonly matches: (p: string) => boolean;
  readonly score: number;
}[] = [
  {
    matches: (p) => p.startsWith("documentation/adr") || p.startsWith("adr-"),
    score: 1.0,
  },
  { matches: (p) => p.startsWith("documentation/"), score: 0.8 },
  { matches: (p) => p.startsWith(".cursor/rules/"), score: 0.7 },
  { matches: (p) => p.startsWith(".cursor/skills/"), score: 0.6 },
];
```

Default score when no entry matches: 0.5.

In discover: (1) Filter specRepoMap.files: exclude any file matching rulePack.excludePatterns (use matchesGlob from ./glob-match.js). If rulePack.includePatterns.length > 0, keep only files matching at least one include pattern. If includePatterns is empty and task.matchedKeywords.length > 0, keep only files whose path (case-insensitive) contains at least one matched keyword. If both are empty, keep all non-excluded files. (2) Score each candidate: spec path tier via `SPEC_PATH_TIERS.find(t => t.matches(path))?.score ?? 0.5`; keyword relevance via pathRelevance(path, task.matchedKeywords) from ./path-relevance.js; recency via min-max normalisation over lastModified (newest => 1); size penalty 1 - minMaxNorm(token counts) so smaller files score higher. Weights: pathTier 0.4, keyword 0.3, recency 0.2, sizePenalty 0.1. Boost and penalize via optional chaining: `rulePack.heuristic?.boostPatterns.filter(pat => matchesGlob(entry.path, pat)).length ?? 0` for boost count, same pattern for penalize count. Add +0.2 per boost match, -0.2 per penalize match; clamp final score to [0,1]. (3) Sort by score descending. (4) Map each FileEntry to SelectedFile: path, language (from entry.language), estimatedTokens, relevanceScore from toRelevanceScore(score), tier INCLUSION_TIER.L0. (5) Return ContextResult with files as the mapped array, totalTokens as toTokenCount(sum of estimatedTokens), truncated false. Do not mutate specRepoMap or any input.

**Verify:** Run `pnpm typecheck`. Expected: clean.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/spec-file-discoverer.test.ts`. Use a single describe("SpecFileDiscoverer"). Build RepoMap with toAbsolutePath for root and FileEntry[] (path via toRelativePath, language, sizeBytes via toBytes from #core/types/units.js, estimatedTokens via toTokenCount, lastModified via toISOTimestamp). Build TaskClassification and RulePack to match each scenario. Implement: empty_spec_repo_returns_empty_result (specRepoMap.files = [], expect files.length 0, totalTokens 0, truncated false); exclude_patterns_filter_spec_files (3 files, excludePatterns match one, expect 2 files); include_patterns_filter_spec_files (3 files, includePatterns match 2, expect 2 files); keyword_match_filters_when_no_include (paths doc/a.md and doc/plan.md, matchedKeywords ["plan"], includePatterns [], expect only plan file); spec_path_tier_orders_adr_above_doc (documentation/adr-001.md and documentation/other.md, expect first file has higher relevanceScore); recency_and_size_affect_score (two files same path tier and keyword, different lastModified and estimatedTokens, expect order by combined score); boost_and_penalize_patterns_affect_score (heuristic.boostPatterns and penalizePatterns, expect boosted higher and penalized lower); no_mutation_of_inputs (call discover twice with same specRepoMap, assert both results equal and specRepoMap.files reference unchanged).

**Verify:** Run `pnpm test -- shared/src/pipeline/__tests__/spec-file-discoverer.test.ts`. Expected: all eight tests pass.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                | Description                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| empty_spec_repo_returns_empty_result     | specRepoMap.files empty yields ContextResult with files.length 0, totalTokens 0, truncated false                       |
| exclude_patterns_filter_spec_files       | rulePack.excludePatterns matching one of three files yields two files in result                                        |
| include_patterns_filter_spec_files       | rulePack.includePatterns matching two of three files yields two files in result                                        |
| keyword_match_filters_when_no_include    | matchedKeywords ["plan"], includePatterns [], paths doc/a.md and doc/plan.md yield only doc/plan.md                    |
| spec_path_tier_orders_adr_above_doc      | documentation/adr-001.md and documentation/other.md yield adr file with higher relevanceScore                          |
| recency_and_size_affect_score            | Two files same path tier and keyword; different lastModified and estimatedTokens; result order reflects combined score |
| boost_and_penalize_patterns_affect_score | heuristic.boostPatterns raises score, penalizePatterns lowers score                                                    |
| no_mutation_of_inputs                    | Two discover calls with same specRepoMap yield equal results; specRepoMap.files unchanged                              |

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
