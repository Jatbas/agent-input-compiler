# Task 100: Chunk-level file inclusion

> **Status:** Pending
> **Phase:** P (Context Quality, Token Efficiency & Compilation Performance)
> **Layer:** pipeline + core
> **Depends on:** Symbol-level intent matching (task 093)

## Goal

Include only relevant functions/blocks at full fidelity and the rest at signature level when subject tokens are present and chunk-reduced content fits the budget. Extend SummarisationLadder to compute per-file resolved content (matched chunks full, non-matched signature) and extend PromptAssembler to use it when present.

## Architecture Notes

- Chunk-aware SummarisationLadder per mvp-progress: no new step; extend existing ladder, SelectedFile, and assembler (Approach B).
- Match semantics: same as SymbolRelevanceScorer — chunk.symbolName.toLowerCase().includes(token.toLowerCase()) for any subjectToken.
- When chunk-level total exceeds budget, do not set resolvedContent; run existing demoteLoop (whole-file tier only). Chunk-level is used only when chunk-reduced total is within budget.
- ADR-010: branded types unchanged. Optional resolvedContent on SelectedFile is backward compatible.

## Files

| Action | Path                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------ |
| Modify | `shared/src/core/types/selected-file.ts` (add optional resolvedContent)                                |
| Modify | `shared/src/core/interfaces/summarisation-ladder.interface.ts` (compress gains optional subjectTokens) |
| Modify | `shared/src/pipeline/summarisation-ladder.ts` (chunk-level logic when subjectTokens non-empty)         |
| Modify | `shared/src/core/run-pipeline-steps.ts` (pass task.subjectTokens to compress)                          |
| Modify | `shared/src/pipeline/prompt-assembler.ts` (use file.resolvedContent when present)                      |
| Modify | `shared/src/pipeline/__tests__/summarisation-ladder.test.ts` (three chunk-level tests)                 |
| Modify | `shared/src/pipeline/__tests__/prompt-assembler.test.ts` (assembler_uses_resolvedContent_when_present) |

## Interface / Signature

```typescript
// SummarisationLadder — optional third parameter
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount } from "#core/types/units.js";

export interface SummarisationLadder {
  compress(
    files: readonly SelectedFile[],
    budget: TokenCount,
    subjectTokens?: readonly string[],
  ): Promise<readonly SelectedFile[]>;
}
```

```typescript
// SelectedFile — optional resolvedContent (shared/src/core/types/selected-file.ts)
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount, StepIndex } from "#core/types/units.js";
import type { RelevanceScore } from "#core/types/scores.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface SelectedFile {
  readonly path: RelativePath;
  readonly language: string;
  readonly estimatedTokens: TokenCount;
  readonly relevanceScore: RelevanceScore;
  readonly tier: InclusionTier;
  readonly previouslyShownAtStep?: StepIndex;
  readonly resolvedContent?: string;
}
```

PromptAssembler interface unchanged; implementation uses file.resolvedContent when present, else getContent(file.path).

## Dependent Types

### Tier 0 — verbatim

```typescript
// CodeChunk — shared/src/core/types/code-chunk.ts
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount, LineNumber } from "#core/types/units.js";
import type { SymbolType } from "#core/types/enums.js";

export interface CodeChunk {
  readonly filePath: RelativePath;
  readonly symbolName: string;
  readonly symbolType: SymbolType;
  readonly startLine: LineNumber;
  readonly endLine: LineNumber;
  readonly content: string;
  readonly tokenCount: TokenCount;
}
```

### Tier 1 — signature + path

| Type              | Path                                                        | Members                                          |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| LanguageProvider  | shared/src/core/interfaces/language-provider.interface.ts   | extractSignaturesWithDocs, extractSignaturesOnly |
| FileContentReader | shared/src/core/interfaces/file-content-reader.interface.ts | getContent                                       |

### Tier 2 — path-only

| Type          | Path                           | Factory        |
| ------------- | ------------------------------ | -------------- |
| RelativePath  | shared/src/core/types/paths.ts | toRelativePath |
| TokenCount    | shared/src/core/types/units.ts | toTokenCount   |
| InclusionTier | shared/src/core/types/enums.ts | INCLUSION_TIER |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add optional resolvedContent to SelectedFile

In `shared/src/core/types/selected-file.ts`: add `readonly resolvedContent?: string;` to the SelectedFile interface.

**Verify:** `pnpm typecheck` passes. No other file changes required for this step.

### Step 2: Extend SummarisationLadder interface and implement chunk-level logic

In `shared/src/core/interfaces/summarisation-ladder.interface.ts`: add optional third parameter `subjectTokens?: readonly string[]` to the compress method signature.

In `shared/src/pipeline/summarisation-ladder.ts`: implement chunk-level behaviour. When subjectTokens is non-empty and has length > 0: for each file, get provider via getProvider(file.path, languageProviders). If provider exists, get content from contentMap (preload as today), call provider.extractSignaturesWithDocs(content) and provider.extractSignaturesOnly(content). For each chunk, treat as matched when subjectTokens.some((t) => chunk.symbolName.toLowerCase().includes(t.toLowerCase())). Build resolvedContent by concatenating: matched chunks use full content (from extractSignaturesWithDocs), non-matched use signature only (from extractSignaturesOnly). Set file.resolvedContent and file.estimatedTokens = tokenCounter(resolvedContent). After processing all files, if sum(estimatedTokens) <= budget return the files with resolvedContent set. If sum > budget do not set resolvedContent on any file and run existing demoteLoop and dropToFit (current behaviour). When subjectTokens is undefined or empty, do not set resolvedContent and run current behaviour unchanged. Preserve immutability: return new file objects with spread, never mutate input.

**Verify:** `pnpm typecheck` and `pnpm lint` pass. Existing summarisation-ladder tests still pass.

### Step 3: Pass task.subjectTokens to compress in run-pipeline-steps

In `shared/src/core/run-pipeline-steps.ts`: change the call to `deps.summarisationLadder.compress(transformResult.files, budget)` to `deps.summarisationLadder.compress(transformResult.files, budget, task.subjectTokens)`. Change the spec ladder call similarly: pass `task.subjectTokens` as the third argument to compress when calling for spec files.

**Verify:** `pnpm typecheck` passes.

### Step 4: Use resolvedContent in PromptAssembler when present

In `shared/src/pipeline/prompt-assembler.ts`: in the contextParts construction, for each file that needs content (not previouslyShownAtStep), use `file.resolvedContent !== undefined ? file.resolvedContent : (await this.fileContentReader.getContent(file.path))`. Await content for all needContent files in one Promise.all; for files with resolvedContent use the resolved string from the file object, for others use the result from getContent in the same order as needContent. Preserve existing ordering and section layout.

**Verify:** `pnpm typecheck` and `pnpm lint` pass. Existing prompt-assembler tests still pass.

### Step 5: Add tests for chunk-level and assembler resolvedContent

In `shared/src/pipeline/__tests__/summarisation-ladder.test.ts`: add test **chunk_level_when_subjectTokens_match_sets_resolvedContent**: provider that returns chunks with distinct symbolNames "auth" and "util"; subjectTokens `["auth"]`; one file with that provider; compress(files, budget, ["auth"]); assert the returned file has resolvedContent containing full content for the auth chunk and signature-only for the other; assert estimatedTokens equals tokenCounter(resolvedContent). Add test **chunk_level_when_subjectTokens_empty_no_resolvedContent**: compress with subjectTokens [] or undefined; assert no file in the result has resolvedContent. Add test **chunk_level_file_without_provider_no_resolvedContent**: one file with extension that has no LanguageProvider in the test (use .xyz); compress with non-empty subjectTokens; assert that file has no resolvedContent.

In `shared/src/pipeline/__tests__/prompt-assembler.test.ts`: add test **assembler_uses_resolvedContent_when_present**: build a file list with one SelectedFile that has resolvedContent set to "resolved text"; mock FileContentReader.getContent to track calls; call assemble; assert the assembled string contains "resolved text" for that file's section and getContent was not called for that file's path.

**Verify:** `pnpm test shared/src/pipeline/__tests__/summarisation-ladder.test.ts shared/src/pipeline/__tests__/prompt-assembler.test.ts` passes.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                 | Description                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| chunk_level_when_subjectTokens_match_sets_resolvedContent | compress with subjectTokens returns file with resolvedContent (matched full, rest signature); estimatedTokens matches. |
| chunk_level_when_subjectTokens_empty_no_resolvedContent   | compress with [] or undefined leaves no resolvedContent.                                                               |
| chunk_level_file_without_provider_no_resolvedContent      | file with no LanguageProvider has no resolvedContent when subjectTokens non-empty.                                     |
| assembler_uses_resolvedContent_when_present               | assembled prompt uses file.resolvedContent when set; getContent not called for that file.                              |

## Acceptance Criteria

- [ ] SelectedFile has optional resolvedContent. SummarisationLadder.compress accepts optional subjectTokens.
- [ ] When subjectTokens non-empty and chunk-level total <= budget, files have resolvedContent and estimatedTokens set.
- [ ] When over budget or subjectTokens empty, no resolvedContent; existing demoteLoop behaviour unchanged.
- [ ] PromptAssembler uses file.resolvedContent when present, else getContent(file.path).
- [ ] run-pipeline-steps passes task.subjectTokens to both compress calls.
- [ ] All four new test cases pass.
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No `let` in production code; single-line comments only.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you have to make 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
