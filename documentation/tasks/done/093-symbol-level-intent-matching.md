# Task 093: Symbol-level intent matching

> **Status:** Done
> **Phase:** Phase P — Context Quality & Token Efficiency
> **Layer:** pipeline + core types
> **Depends on:** —

## Goal

Add a scoring signal that matches intent _subject tokens_ against exported symbol names. The IntentClassifier extracts `subjectTokens` (domain terms like "auth", "payment", "user") from the intent, separate from `matchedKeywords` (classifier dictionary hits like "fix", "add"). A new `SymbolRelevanceScorer` matches `subjectTokens` against `LanguageProvider.extractNames()` to boost files whose exported symbols relate to the user's intent.

## Design Decision: subjectTokens vs matchedKeywords

`matchedKeywords` contains classifier dictionary hits ("fix", "bug", "refactor", "add"). These are task-class indicators, not domain terms. Matching "fix" or "bug" against symbol names like `AuthService` would score 0 for every file — the feature would silently do nothing in production.

**Fix:** `IntentClassifier` extracts a new `subjectTokens` field: the remaining intent tokens after removing classifier keywords and common stopwords. Example: "fix the auth module login bug" → `matchedKeywords: ["fix", "bug"]`, `subjectTokens: ["auth", "module", "login"]`. The `SymbolRelevanceScorer` matches against `subjectTokens`, not `matchedKeywords`.

## Architecture Notes

- Reuse ImportProximityScorer interface; no new scorer interface. SymbolRelevanceScorer is a second implementation (same constructor shape as ImportGraphProximityScorer: FileContentReader, languageProviders).
- ADR-010: branded types for paths. HeuristicSelector gains a second scorer parameter and a new weight symbolRelevance; DEFAULT_WEIGHTS rebalanced to sum 1.0.
- Match semantics: subjectToken matches symbol when symbol.name.toLowerCase().includes(subjectToken.toLowerCase()). Score = 0 when subjectTokens.length === 0; else Math.min(1, matchCount / subjectTokens.length). On getContent or extractNames error for a file, score that file 0.
- TaskClassification gains `readonly subjectTokens: readonly string[]`. IntentClassifier extracts them: tokenize intent by whitespace/punctuation, remove classifier keywords (all task classes), remove stopwords, remove tokens < 2 chars, deduplicate.

## Files

| Action | Path                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------ |
| Modify | `shared/src/core/types/task-classification.ts` (add subjectTokens field)                         |
| Modify | `shared/src/pipeline/intent-classifier.ts` (extract subjectTokens)                               |
| Create | `shared/src/pipeline/symbol-relevance-scorer.ts`                                                 |
| Create | `shared/src/pipeline/__tests__/symbol-relevance-scorer.test.ts`                                  |
| Modify | `shared/src/core/interfaces/heuristic-selector-config.interface.ts` (add symbolRelevance weight) |
| Modify | `shared/src/pipeline/heuristic-selector.ts` (constructor, scoreCandidate, DEFAULT_WEIGHTS)       |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (wire SymbolRelevanceScorer)                      |
| Modify | `shared/src/pipeline/__tests__/intent-classifier.test.ts` (test subjectTokens extraction)        |
| Modify | `shared/src/pipeline/__tests__/heuristic-selector.test.ts` (pass second scorer)                  |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (pass second scorer)                  |
| Modify | `shared/src/integration/__tests__/full-pipeline.test.ts` (pass second scorer)                    |
| Modify | `shared/src/integration/__tests__/golden-snapshot.test.ts` (pass second scorer)                  |
| Modify | `shared/src/pipeline/__tests__/import-graph-proximity-scorer.test.ts` (add subjectTokens: [])    |
| Modify | `shared/src/pipeline/__tests__/intent-aware-file-discoverer.test.ts` (add subjectTokens: [])     |
| Modify | `shared/src/pipeline/__tests__/prompt-assembler.test.ts` (add subjectTokens: [])                 |
| Modify | `shared/src/pipeline/__tests__/inspect-runner.test.ts` (add subjectTokens: [])                   |
| Modify | `shared/src/pipeline/__tests__/rule-pack-resolver.test.ts` (add subjectTokens: [])               |
| Modify | `shared/src/pipeline/__tests__/spec-file-discoverer.test.ts` (add subjectTokens: [])             |

## Interface / Signature

```typescript
// TaskClassification — shared/src/core/types/task-classification.ts (updated)
export interface TaskClassification {
  readonly taskClass: TaskClass;
  readonly confidence: Confidence;
  readonly matchedKeywords: readonly string[];
  readonly subjectTokens: readonly string[];
}
```

```typescript
// ImportProximityScorer — reused (existing, unchanged)
export interface ImportProximityScorer {
  getScores(
    repo: RepoMap,
    task: TaskClassification,
  ): Promise<ReadonlyMap<RelativePath, number>>;
}
```

```typescript
// SymbolRelevanceScorer — implements ImportProximityScorer
constructor(
  private readonly fileContentReader: FileContentReader,
  private readonly languageProviders: readonly LanguageProvider[],
) {}

async getScores(
  repo: RepoMap,
  task: TaskClassification,
): Promise<ReadonlyMap<RelativePath, number>>
```

```typescript
// HeuristicSelector — constructor gains fourth param
constructor(
  private readonly languageProviders: readonly LanguageProvider[],
  private readonly config: HeuristicSelectorConfig,
  private readonly importProximityScorer: ImportProximityScorer,
  private readonly symbolRelevanceScorer: ImportProximityScorer,
) {}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// TaskClassification (with subjectTokens)
export interface TaskClassification {
  readonly taskClass: TaskClass;
  readonly confidence: Confidence;
  readonly matchedKeywords: readonly string[];
  readonly subjectTokens: readonly string[];
}
```

```typescript
// FileContentReader
import type { RelativePath } from "#core/types/paths.js";
export interface FileContentReader {
  getContent(path: RelativePath): Promise<string>;
}
```

```typescript
// LanguageProvider (extractNames used)
extractNames(fileContent: string): readonly ExportedSymbol[];
```

```typescript
// ExportedSymbol
export interface ExportedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
}
```

### Tier 1 — signature + path

| Type        | Path                                | Members                                       | Purpose               |
| ----------- | ----------------------------------- | --------------------------------------------- | --------------------- |
| `RepoMap`   | `shared/src/core/types/repo-map.js` | root, files                                   | getScores input       |
| `FileEntry` | `shared/src/core/types/repo-map.js` | path, language, estimatedTokens, lastModified | iterated in getScores |

### Tier 2 — path-only

| Type           | Path                             | Factory             |
| -------------- | -------------------------------- | ------------------- |
| `RelativePath` | `shared/src/core/types/paths.js` | `toRelativePath(s)` |

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Add subjectTokens to TaskClassification

In `shared/src/core/types/task-classification.ts`, add `readonly subjectTokens: readonly string[]` to the `TaskClassification` interface, after `matchedKeywords`.

**Verify:** `pnpm typecheck` will report errors (expected — downstream consumers don't provide the field yet).

### Step 2: Extract subjectTokens in IntentClassifier

In `shared/src/pipeline/intent-classifier.ts`:

1. Add a constant `STOPWORDS: ReadonlySet<string>` containing common English stopwords: "the", "a", "an", "to", "for", "in", "on", "at", "of", "with", "from", "by", "is", "are", "was", "were", "be", "been", "being", "and", "or", "but", "not", "no", "this", "that", "it", "its", "my", "our", "your", "their", "all", "any", "each", "every", "some", "can", "will", "should", "would", "could", "do", "does", "did", "has", "have", "had", "about", "into", "through", "during", "before", "after", "above", "below", "between", "same", "so", "than", "too", "very", "just", "also", "now", "here", "there", "when", "where", "how", "what", "which", "who", "whom", "why".

2. Build `ALL_CLASSIFIER_KEYWORDS: ReadonlySet<string>` from the flattened values of KEYWORDS (all task classes).

3. Add a pure function `extractSubjectTokens(intent: string): readonly string[]`. Logic: split `intent.toLowerCase()` by `/[\s\-_./\\:;,!?'"(){}[\]<>]+/`. Filter out tokens where: token is in STOPWORDS, OR token is in ALL_CLASSIFIER_KEYWORDS, OR token.length < 2. Deduplicate via `[...new Set(filtered)]`. Return as `readonly string[]`.

4. In `classify()`, call `extractSubjectTokens(intent)` and add the result as `subjectTokens` to both return paths (the `best.count === 0` path and the normal path).

**Verify:** `pnpm typecheck` passes for intent-classifier.ts.

### Step 3: Update all test TaskClassification objects

Add `subjectTokens: []` to every inline `TaskClassification` object in test files:

- `shared/src/pipeline/__tests__/import-graph-proximity-scorer.test.ts` — in `makeTask()` helper
- `shared/src/pipeline/__tests__/intent-aware-file-discoverer.test.ts` — in each test's task object
- `shared/src/pipeline/__tests__/prompt-assembler.test.ts` — in the test task object
- `shared/src/pipeline/__tests__/inspect-runner.test.ts` — in the fixture task
- `shared/src/pipeline/__tests__/rule-pack-resolver.test.ts` — in each test's task object
- `shared/src/pipeline/__tests__/heuristic-selector.test.ts` — in each test's task object
- `shared/src/pipeline/__tests__/spec-file-discoverer.test.ts` — in each test's task object

**Verify:** `pnpm typecheck` passes across all files.

### Step 4: Update intent-classifier tests

In `shared/src/pipeline/__tests__/intent-classifier.test.ts`, add four test cases:

- **subject_tokens_extracted_from_intent:** classify("fix the auth module login bug") → subjectTokens contains "auth", "module", "login" (classifier keywords "fix" and "bug" excluded, stopword "the" excluded).
- **subject_tokens_empty_when_only_keywords:** classify("fix bug") → subjectTokens is [].
- **subject_tokens_present_for_general_task:** classify("hello world") → subjectTokens contains "hello", "world" (no classifier keywords to remove, no stopwords).
- **subject_tokens_deduplicates:** classify("fix auth auth bug") → subjectTokens contains "auth" exactly once.

Also update existing tests to assert `subjectTokens` is present (`expect(result).toHaveProperty("subjectTokens")`).

**Verify:** `pnpm test shared/src/pipeline/__tests__/intent-classifier.test.ts` passes.

### Step 5: Add symbolRelevance to config weights type

In `shared/src/core/interfaces/heuristic-selector-config.interface.ts`, add `readonly symbolRelevance: number` to the `ScoringWeights` type (alongside pathRelevance, importProximity, recency, sizePenalty).

**Verify:** `pnpm typecheck` passes.

### Step 6: HeuristicSelector — weights, constructor, scoreCandidate, selectContext

In `shared/src/pipeline/heuristic-selector.ts`:

1. Update `DEFAULT_WEIGHTS` (or `DEFAULT_WEIGHTS_BY_TASK_CLASS` if task 091 ran first) to include `symbolRelevance`. Rebalance all profiles to sum 1.0: pathRelevance 0.3, importProximity 0.25, symbolRelevance 0.2, recency 0.15, sizePenalty 0.1. If task 091's per-task-class weights exist, update each profile to include symbolRelevance while maintaining sum 1.0.
2. Add constructor parameter `private readonly symbolRelevanceScorer: ImportProximityScorer` as the fourth parameter.
3. Add parameter `symbolRelevanceScores: ReadonlyMap<RelativePath, number>` to `scoreCandidate`. Add term `(symbolRelevanceScores.get(entry.path) ?? 0) * weights.symbolRelevance` to `baseScore`.
4. In `selectContext`, after `const importProximityScores = await this.importProximityScorer.getScores(repo, task)`, add `const symbolRelevanceScores = await this.symbolRelevanceScorer.getScores(repo, task)`. Pass `symbolRelevanceScores` into each `scoreCandidate(...)` call.

**Verify:** `pnpm typecheck` passes.

### Step 7: Implement SymbolRelevanceScorer

Create `shared/src/pipeline/symbol-relevance-scorer.ts`. Class `SymbolRelevanceScorer` implementing `ImportProximityScorer`:

- Constructor: `(private readonly fileContentReader: FileContentReader, private readonly languageProviders: readonly LanguageProvider[])`.
- `getScores(repo, task)`: If `task.subjectTokens.length === 0`, return a Map with 0 for every path in `repo.files` (early exit — no tokens to match). For each entry in `repo.files`, find provider via `getProvider(entry.path, this.languageProviders)`. If no provider, score 0. Otherwise `await this.fileContentReader.getContent(entry.path)`, then `provider.extractNames(content)`. Count how many of `task.subjectTokens` match at least one symbol: for each token, check `symbol.name.toLowerCase().includes(token.toLowerCase())`. Score = `Math.min(1, matchCount / task.subjectTokens.length)`. On error (getContent throws or extractNames throws), score that file 0 (catch and continue). Return `Map<RelativePath, number>`.

**Verify:** `pnpm typecheck` passes.

### Step 8: Wire SymbolRelevanceScorer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`: import `SymbolRelevanceScorer` from `#pipeline/symbol-relevance-scorer.js`. Construct `const symbolRelevanceScorer = new SymbolRelevanceScorer(fileContentReader, languageProviders)`. Pass as fourth argument to `new HeuristicSelector(languageProviders, config, importProximityScorer, symbolRelevanceScorer)`.

**Verify:** `pnpm typecheck` passes.

### Step 9: Add symbol-relevance-scorer tests

Create `shared/src/pipeline/__tests__/symbol-relevance-scorer.test.ts` with five test cases:

- **symbol_relevance_empty_repo:** repo with `files: []`. `getScores` returns empty Map.
- **symbol_relevance_no_subject_tokens_all_zero:** `task.subjectTokens = []`, one file in repo. Score for that file is 0.
- **symbol_relevance_matching_symbols_boost_score:** One file, provider whose `extractNames` returns `[{ name: "AuthService", kind: "class" }]`. Task with `subjectTokens: ["auth"]`. Assert score > 0 (because "authservice".includes("auth") is true).
- **symbol_relevance_no_provider_zero_score:** File with extension that has no provider. Assert score 0.
- **symbol_relevance_read_error_skipped:** Mock `fileContentReader.getContent` to throw for one path and return content for another. Assert the throwing path gets score 0; the other file's score is computed normally.

Use the same test helpers pattern as `import-graph-proximity-scorer.test.ts`. Mock FileContentReader and LanguageProvider. All task objects include `subjectTokens`.

**Verify:** `pnpm test shared/src/pipeline/__tests__/symbol-relevance-scorer.test.ts` passes.

### Step 10: Update test files for second scorer

Add a fourth argument to every `new HeuristicSelector(...)` call in:

- `shared/src/pipeline/__tests__/heuristic-selector.test.ts` — use same stub scorer pattern as third argument
- `shared/src/pipeline/__tests__/compilation-runner.test.ts` — `{ getScores: () => Promise.resolve(new Map()) }`
- `shared/src/integration/__tests__/full-pipeline.test.ts` — same stub
- `shared/src/integration/__tests__/golden-snapshot.test.ts` — same stub

**Verify:** All tests pass.

### Step 11: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                     | Description                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| subject_tokens_extracted_from_intent          | "fix the auth module login bug" → subjectTokens ["auth", "module", "login"] |
| subject_tokens_empty_when_only_keywords       | "fix bug" → subjectTokens []                                                |
| subject_tokens_present_for_general_task       | "hello world" → subjectTokens ["hello", "world"]                            |
| subject_tokens_deduplicates                   | "fix auth auth bug" → subjectTokens ["auth"] (once)                         |
| symbol_relevance_empty_repo                   | Empty repo → getScores returns empty Map                                    |
| symbol_relevance_no_subject_tokens_all_zero   | subjectTokens [] → all scores 0                                             |
| symbol_relevance_matching_symbols_boost_score | Symbol "AuthService" + subjectToken "auth" → score > 0                      |
| symbol_relevance_no_provider_zero_score       | File with no provider → score 0                                             |
| symbol_relevance_read_error_skipped           | getContent throws for one file → that file score 0, others computed         |

## Acceptance Criteria

- [ ] TaskClassification has `readonly subjectTokens: readonly string[]`
- [ ] IntentClassifier extracts subjectTokens (excluding classifier keywords and stopwords)
- [ ] SymbolRelevanceScorer uses `task.subjectTokens` (NOT `task.matchedKeywords`)
- [ ] HeuristicSelector includes symbolRelevance in weighted sum
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
