# Task 040: Import graph signal (TS/JS)

> **Status:** Done
> **Phase:** J — Intent & Selection Quality
> **Layer:** pipeline
> **Depends on:** Intent-aware file discovery, HeuristicSelector, TypeScriptProvider, LanguageProvider interface

## Goal

Wire the import-proximity scoring signal into the HeuristicSelector so that TS/JS files are scored by BFS depth from task-relevant seed files (depth 0 = 1.0, 1 = 0.6, 2 = 0.3, 3+ = 0.1). Files with no LanguageProvider keep import proximity 0.

## Architecture Notes

- Project Plan §8: import proximity weight 0.3; BFS from seed set; depth-to-score mapping. MVP Spec Step 4: import-graph walking delegates to LanguageProvider.
- New core interface ImportProximityScorer; pipeline implementation ImportGraphProximityScorer uses FileContentReader and LanguageProvider[] to build graph and compute scores. HeuristicSelector receives scorer via constructor and uses map in scoreCandidate instead of hardcoded 0.
- Path resolution is pure (no node:path) in core/types/paths.ts. Resolved import spec is matched to repo paths by trying resolved base plus .ts, .js, .tsx, .jsx and index.\*.

## Files

| Action | Path                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/import-proximity-scorer.interface.ts`                                                             |
| Create | `shared/src/pipeline/import-graph-proximity-scorer.ts`                                                                        |
| Create | `shared/src/pipeline/__tests__/import-graph-proximity-scorer.test.ts`                                                         |
| Create | `shared/src/core/types/__tests__/paths.test.ts`                                                                               |
| Modify | `shared/src/core/types/paths.ts` (add resolveImportSpec)                                                                      |
| Modify | `shared/src/pipeline/heuristic-selector.ts` (add importProximityScorer param, use getScores map in scoreCandidate)            |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (create scorer, pass to HeuristicSelector)                                     |
| Modify | `shared/src/pipeline/__tests__/heuristic-selector.test.ts` (inject scorer stub; add test that import proximity affects score) |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (pass scorer stub)                                                 |
| Modify | `shared/src/integration/__tests__/full-pipeline.test.ts` (pass scorer stub)                                                   |
| Modify | `shared/src/integration/__tests__/golden-snapshot.test.ts` (pass scorer stub)                                                 |

## Interface / Signature

```typescript
// Interface — shared/src/core/interfaces/import-proximity-scorer.interface.ts
import type { RepoMap } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RelativePath } from "#core/types/paths.js";

export interface ImportProximityScorer {
  getScores(repo: RepoMap, task: TaskClassification): ReadonlyMap<RelativePath, number>;
}
```

```typescript
// ImportGraphProximityScorer — shared/src/pipeline/import-graph-proximity-scorer.ts
import type { ImportProximityScorer } from "#core/interfaces/import-proximity-scorer.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RelativePath } from "#core/types/paths.js";

export class ImportGraphProximityScorer implements ImportProximityScorer {
  constructor(
    private readonly fileContentReader: FileContentReader,
    private readonly languageProviders: readonly LanguageProvider[],
  ) {}
  getScores(repo: RepoMap, task: TaskClassification): ReadonlyMap<RelativePath, number> {
    // Build graph from repo.files (only files with provider); resolve relative imports via resolveImportSpec; seeds = pathRelevance(path, task.matchedKeywords) > 0; BFS; depth 0→1.0, 1→0.6, 2→0.3, 3+→0.1.
  }
}
```

```typescript
// HeuristicSelector (modified) — constructor and selectContext unchanged contract; scoreCandidate receives importProximityScores map
constructor(
  private readonly languageProviders: readonly LanguageProvider[],
  private readonly config: HeuristicSelectorConfig,
  private readonly importProximityScorer: ImportProximityScorer,
) {}
// In selectContext: const importProximityScores = this.importProximityScorer.getScores(repo, task); pass to scoreCandidate. In scoreCandidate: use importProximityScores.get(entry.path) ?? 0 instead of 0 for the importProximity term.
```

```typescript
// resolveImportSpec — shared/src/core/types/paths.ts
export function resolveImportSpec(
  importerPath: RelativePath,
  spec: string,
): RelativePath | null {
  // Split importerPath by "/"; dir = segments.slice(0, -1). Split spec by "/"; for each segment: ".." pop from dir, "." skip, else push. Join dir; return null if dir length < 0 (escape root), else toRelativePath(result).
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
// ImportRef — shared/src/core/types/import-ref.ts
export interface ImportRef {
  readonly source: string;
  readonly symbols: readonly string[];
  readonly isRelative: boolean;
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

### Tier 1 — signature + path

| Type                | Path                                                          | Members | Purpose                                                                                              |
| ------------------- | ------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `LanguageProvider`  | `shared/src/core/interfaces/language-provider.interface.ts`   | 5       | parseImports, extractSignaturesWithDocs, extractSignaturesOnly, extractNames + props: id, extensions |
| `FileContentReader` | `shared/src/core/interfaces/file-content-reader.interface.ts` | 1       | getContent(path): string                                                                             |

### Tier 2 — path-only

| Type           | Path                             | Factory               |
| -------------- | -------------------------------- | --------------------- |
| `RelativePath` | `shared/src/core/types/paths.ts` | `toRelativePath(raw)` |
| `TokenCount`   | `shared/src/core/types/units.ts` | `toTokenCount(n)`     |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add resolveImportSpec to paths.ts

In `shared/src/core/types/paths.ts`, add `resolveImportSpec(importerPath: RelativePath, spec: string): RelativePath | null`. Implementation: split `importerPath` by `"/"`, take dir = segments.slice(0, -1). Split `spec` by `"/"`; for each segment: if `".."` pop one from dir, if `"."` skip, else push segment. Join dir with `"/"`. If dir length becomes negative, return null (escape root). Otherwise return `toRelativePath(dir.join("/"))`. Do not use node:path or any external API.

**Verify:** Run `pnpm typecheck` — paths.ts compiles.

### Step 2: Create ImportProximityScorer interface

Create `shared/src/core/interfaces/import-proximity-scorer.interface.ts` with the interface block from the Interface / Signature section (ImportProximityScorer with getScores).

**Verify:** Run `pnpm typecheck` — new file compiles.

### Step 3: Implement ImportGraphProximityScorer

Create `shared/src/pipeline/import-graph-proximity-scorer.ts`. Implement getScores: (1) Get provider by path using first provider whose extensions include the file extension (same pattern as summarisation-ladder getProvider). (2) For each file in repo.files that has a provider, call fileContentReader.getContent(entry.path) and provider.parseImports(content, entry.path). (3) For each relative ImportRef, call resolveImportSpec(entry.path, ref.source); if non-null, find repo file path that matches resolved base (path === base or path === base + ".ts" | ".js" | ".tsx" | ".jsx" or path === base + "/index." + ext). Build directed edges (importer -> target). (4) Seeds = repo.files where pathRelevance(entry.path, task.matchedKeywords) > 0 and file has a provider. (5) BFS from seeds; depth 0 = 1.0, 1 = 0.6, 2 = 0.3, 3+ = 0.1. (6) Return ReadonlyMap<RelativePath, number> (all repo file paths get an entry; unreachable or no provider = 0). Use immutable patterns (no .push; use spread/reduce). Max 60 lines per function; extract helpers if needed.

**Verify:** Run `pnpm typecheck` and `pnpm lint` — pipeline file passes.

### Step 4: Modify HeuristicSelector

In `shared/src/pipeline/heuristic-selector.ts`: Add `importProximityScorer: ImportProximityScorer` to the constructor (third param). In selectContext, before mapping candidates to scores, call `const importProximityScores = this.importProximityScorer.getScores(repo, task)`. Add a parameter to scoreCandidate for `importProximityScores: ReadonlyMap<RelativePath, number>`. In scoreCandidate, replace `0 * weights.importProximity` with `(importProximityScores.get(entry.path) ?? 0) * weights.importProximity`. Pass importProximityScores into every scoreCandidate call.

**Verify:** Run `pnpm typecheck` — HeuristicSelector and its call sites fail until call sites are updated (expected).

### Step 5: Wire scorer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`, instantiate `new ImportGraphProximityScorer(fileContentReader, languageProviders)` and pass it as the third argument to `new HeuristicSelector(languageProviders, heuristicSelectorConfig ?? { maxFiles: 20 }, scorer)`.

**Verify:** Run `pnpm typecheck` — create-pipeline-deps and mcp/cli that use it compile.

### Step 6: Add tests for resolveImportSpec

Create `shared/src/core/types/__tests__/paths.test.ts`. Add tests named per the Tests table: resolveImportSpec ./b from src/a.ts (returns toRelativePath("src/b")); resolveImportSpec ../b from src/a.ts (returns toRelativePath("b")); resolveImportSpec ../../c from src/dir/a.ts (returns toRelativePath("c")); resolveImportSpec ../.. from src/a.ts (returns null, escape root); resolveImportSpec ./b from a.ts (returns toRelativePath("b")).

**Verify:** Run `pnpm test shared/src/core/types/__tests__/paths.test.ts` — all pass.

### Step 7: Add tests for ImportGraphProximityScorer

Create `shared/src/pipeline/__tests__/import-graph-proximity-scorer.test.ts`. Add tests named: import_graph_empty_repo (empty repo returns empty map); import_graph_no_keywords_all_zero (repo with one file and task.matchedKeywords empty: getScores returns map with that path -> 0); import_graph_seed_imports_other (two files: seed path contains keyword, other; mock FileContentReader.getContent and LanguageProvider.parseImports so seed imports other; assert other has score 0.6); import_graph_no_provider_score_zero (file with extension that has no LanguageProvider (.md): that path has score 0); import_graph_bfs_depth_two (three files seed -> A -> B: mock content so edges seed->A, A->B; assert B has score 0.3). Use toRelativePath, toAbsolutePath, toTokenCount, toISOTimestamp, toBytes from core types; build RepoMap and TaskClassification inline.

**Verify:** Run `pnpm test shared/src/pipeline/__tests__/import-graph-proximity-scorer.test.ts` — all pass.

### Step 8: Update heuristic-selector.test.ts

In `shared/src/pipeline/__tests__/heuristic-selector.test.ts`, add a stub: `const stubScorer: ImportProximityScorer = { getScores: () => new Map() };`. Pass `stubScorer` as the third argument to every `new HeuristicSelector(...)` call (7 places). Add one new test: "import_proximity_increases_score_when_scorer_returns_non_zero": create a repo with two files; task with matchedKeywords so one file is seed; stub scorer that returns a Map with the other file's path -> 0.6; assert that the other file appears in result and has a higher relevanceScore than when scorer returns all zeros (or assert it is selected when budget allows).

**Verify:** Run `pnpm test shared/src/pipeline/__tests__/heuristic-selector.test.ts` — all pass.

### Step 9: Update compilation-runner.test.ts

In `shared/src/pipeline/__tests__/compilation-runner.test.ts`, find where HeuristicSelector is constructed and add the third argument: a stub object `{ getScores: () => new Map() }`.

**Verify:** Run `pnpm test shared/src/pipeline/__tests__/compilation-runner.test.ts` — all pass.

### Step 10: Update full-pipeline.test.ts

In `shared/src/integration/__tests__/full-pipeline.test.ts`, find where HeuristicSelector is constructed and add the third argument: a stub `{ getScores: () => new Map() }`.

**Verify:** Run `pnpm test shared/src/integration/__tests__/full-pipeline.test.ts` — all pass.

### Step 11: Update golden-snapshot.test.ts

In `shared/src/integration/__tests__/golden-snapshot.test.ts`, find where HeuristicSelector is constructed and add the third argument: a stub `{ getScores: () => new Map() }`.

**Verify:** Run `pnpm test shared/src/integration/__tests__/golden-snapshot.test.ts` — all pass.

### Step 12: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                     | Description                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| resolveImportSpec ./b from src/a.ts                           | Returns src/b                                              |
| resolveImportSpec ../b from src/a.ts                          | Returns b                                                  |
| resolveImportSpec ../../c from src/dir/a.ts                   | Returns c                                                  |
| resolveImportSpec ../.. from src/a.ts                         | Returns null (escape root)                                 |
| resolveImportSpec ./b from a.ts                               | Returns b                                                  |
| import_graph_empty_repo                                       | getScores returns empty map                                |
| import_graph_no_keywords_all_zero                             | One file, no keywords; path has score 0                    |
| import_graph_seed_imports_other                               | Two files, seed imports other; other has 0.6               |
| import_graph_no_provider_score_zero                           | File with no LanguageProvider has score 0                  |
| import_graph_bfs_depth_two                                    | Seed->A->B; B has score 0.3                                |
| import_proximity_increases_score_when_scorer_returns_non_zero | Stub returns 0.6 for one file; that file's score increases |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] ImportProximityScorer interface and ImportGraphProximityScorer implementation match signatures exactly
- [ ] resolveImportSpec is pure (no node:path); HeuristicSelector uses getScores map in scoreCandidate
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries (core/pipeline no adapters, no node:path in core)
- [ ] No Date.now(), Math.random(); no let in production code; single-line comments only

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. List the adaptations, report to the user, and re-evaluate before continuing.
