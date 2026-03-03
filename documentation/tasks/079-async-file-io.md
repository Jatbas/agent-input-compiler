# Task 079: Async file I/O for pipeline

> **Status:** Pending
> **Phase:** Performance (documentation/performance_review.md)
> **Layer:** core + adapters + pipeline
> **Depends on:** (none)

## Goal

Make `FileContentReader.getContent` and all pipeline steps that read file content asynchronous, so the MCP server uses `fs.promises` instead of `fs.*Sync` and stays responsive during compilations.

## Architecture Notes

- Single interface change: `FileContentReader.getContent(path)` returns `Promise<string>`. All consumers must await.
- Pipeline steps that call `getContent` become async: their interface methods return `Promise<...>` and implementations use `await` or `Promise.all` for bulk reads.
- `runPipelineSteps` is already async; add `await` to the five step calls (selectContext, scan, transform, compress, assemble).
- Core/pipeline continue to depend only on interfaces; the only code that touches `node:fs` is the adapter `CachingFileContentReader`, which switches to `fs.promises`.
- SummarisationLadder.compress: preload all file contents at start with `Promise.all(files.map(f => fileContentReader.getContent(f.path)))`, store in a `Map<RelativePath, string>`, then existing demoteLoop/tokenAtTier logic reads from the map (sync).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `shared/src/core/interfaces/file-content-reader.interface.ts` (getContent → Promise<string>) |
| Modify | `shared/src/core/interfaces/import-proximity-scorer.interface.ts` (getScores → Promise<...>) |
| Modify | `shared/src/core/interfaces/context-selector.interface.ts` (selectContext → Promise<ContextResult>) |
| Modify | `shared/src/core/interfaces/context-guard.interface.ts` (scan → Promise<...>) |
| Modify | `shared/src/core/interfaces/content-transformer-pipeline.interface.ts` (transform → Promise<TransformResult>) |
| Modify | `shared/src/core/interfaces/summarisation-ladder.interface.ts` (compress → Promise<readonly SelectedFile[]>) |
| Modify | `shared/src/core/interfaces/prompt-assembler.interface.ts` (assemble → Promise<string>) |
| Modify | `shared/src/adapters/caching-file-content-reader.ts` (fs.promises, async getContent) |
| Modify | `shared/src/pipeline/import-graph-proximity-scorer.ts` (async getScores, await getContent) |
| Modify | `shared/src/pipeline/heuristic-selector.ts` (async selectContext, await getScores) |
| Modify | `shared/src/pipeline/context-guard.ts` (async scan, await getContent) |
| Modify | `shared/src/pipeline/content-transformer-pipeline.ts` (async transform, await getContent) |
| Modify | `shared/src/pipeline/summarisation-ladder.ts` (async compress, preload content map) |
| Modify | `shared/src/pipeline/prompt-assembler.ts` (async assemble, await getContent) |
| Modify | `shared/src/core/run-pipeline-steps.ts` (await selectContext, scan, transform, compress, assemble) |
| Modify | `shared/src/pipeline/__tests__/content-transformer-pipeline.test.ts` (await transform) |
| Modify | `shared/src/pipeline/__tests__/prompt-assembler.test.ts` (await assemble) |
| Modify | `shared/src/pipeline/__tests__/context-guard.test.ts` (await scan) |
| Modify | `shared/src/pipeline/__tests__/heuristic-selector.test.ts` (await selectContext) |
| Modify | `shared/src/pipeline/__tests__/summarisation-ladder.test.ts` (await compress) |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (mocks return Promises) |
| Modify | `shared/src/pipeline/__tests__/inspect-runner.test.ts` (mocks return Promises) |
| Modify | `shared/src/integration/__tests__/full-pipeline.test.ts` (getContent mock returns Promise) |
| Modify | `shared/src/integration/__tests__/golden-snapshot.test.ts` (getContent mock returns Promise) |

## Interface / Signature

**FileContentReader** (after change):

```typescript
import type { RelativePath } from "#core/types/paths.js";

export interface FileContentReader {
  getContent(path: RelativePath): Promise<string>;
}
```

**ContextSelector** (after change): `selectContext(...): Promise<ContextResult>`  
**ContextGuard** (after change): `scan(files): Promise<{ result: GuardResult; safeFiles: readonly SelectedFile[] }>`  
**ContentTransformerPipeline** (after change): `transform(files, context): Promise<TransformResult>`  
**SummarisationLadder** (after change): `compress(files, budget): Promise<readonly SelectedFile[]>`  
**PromptAssembler** (after change): `assemble(...): Promise<string>`  
**ImportProximityScorer** (after change): `getScores(repo, task): Promise<ReadonlyMap<RelativePath, number>>`

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Change core interfaces to async

In `shared/src/core/interfaces/file-content-reader.interface.ts`: change `getContent(path: RelativePath): string` to `getContent(path: RelativePath): Promise<string>`.

In `shared/src/core/interfaces/import-proximity-scorer.interface.ts`: change `getScores(repo, task): ReadonlyMap<...>` to `getScores(repo, task): Promise<ReadonlyMap<RelativePath, number>>`.

In `shared/src/core/interfaces/context-selector.interface.ts`: change `selectContext(...): ContextResult` to `selectContext(...): Promise<ContextResult>`.

In `shared/src/core/interfaces/context-guard.interface.ts`: change `scan(files): { result, safeFiles }` to `scan(files): Promise<{ readonly result: GuardResult; readonly safeFiles: readonly SelectedFile[] }>`.

In `shared/src/core/interfaces/content-transformer-pipeline.interface.ts`: change `transform(files, context): TransformResult` to `transform(files, context): Promise<TransformResult>`.

In `shared/src/core/interfaces/summarisation-ladder.interface.ts`: change `compress(files, budget): readonly SelectedFile[]` to `compress(files, budget): Promise<readonly SelectedFile[]>`.

In `shared/src/core/interfaces/prompt-assembler.interface.ts`: change `assemble(...): string` to `assemble(...): Promise<string>`.

**Verify:** `pnpm typecheck` fails until implementations are updated (expected).

### Step 2: CachingFileContentReader — async getContent with fs.promises

In `shared/src/adapters/caching-file-content-reader.ts`:

- Change `getContent(pathRel: RelativePath): string` to `async getContent(pathRel: RelativePath): Promise<string>`.
- Use `const stat = await fs.promises.stat(full)` (and `stat.mtimeMs`) instead of `fs.statSync`.
- Use `const content = await fs.promises.readFile(full, "utf8")` instead of `fs.readFileSync`.
- Keep the same cache shape (Map of path → { content, mtimeMs }). No other API changes.

**Verify:** `pnpm typecheck` passes for this file. Adapter tests if any: update to await getContent.

### Step 3: ImportGraphProximityScorer — async getScores

In `shared/src/pipeline/import-graph-proximity-scorer.ts`:

- Change `buildEdges` to `async function buildEdges(..., fileContentReader: FileContentReader, ...): Promise<ReadonlyMap<...>>`. Inside the loop over `repo.files`, use `const content = await fileContentReader.getContent(entry.path)`.
- Change `getScores(repo, task): ReadonlyMap<...>` to `async getScores(repo, task): Promise<ReadonlyMap<...>>`. Await `buildEdges(...)` and use the result in `bfsScores` as today.

**Verify:** `pnpm typecheck` passes. Tests for this module: update to await getScores if present.

### Step 4: HeuristicSelector — async selectContext

In `shared/src/pipeline/heuristic-selector.ts`:

- Change `selectContext(task, repo, budget, rulePack): ContextResult` to `async selectContext(...): Promise<ContextResult>`.
- Before using `importProximityScores`, set `const importProximityScores = await this.importProximityScorer.getScores(repo, task)`.
- Rest of method unchanged (sync logic on already-loaded data).

**Verify:** `pnpm typecheck` passes.

### Step 5: ContextGuard — async scan

In `shared/src/pipeline/context-guard.ts`:

- Change `scan(files): { result, safeFiles }` to `async scan(files): Promise<{ result, safeFiles }>`.
- To get content per file: `const contents = await Promise.all(files.map((file) => this.fileContentReader.getContent(file.path)))` then iterate files with contents (or use a Map path → content). Build `allFindings` by iterating files and using the pre-fetched content for each file (no getContent inside flatMap).
- Return shape unchanged.

**Verify:** `pnpm typecheck` passes.

### Step 6: ContentTransformerPipeline — async transform

In `shared/src/pipeline/content-transformer-pipeline.ts`:

- Change `transform(files, context): TransformResult` to `async transform(files, context): Promise<TransformResult>`.
- Replace the synchronous `files.map((file) => { const rawContent = this.fileContentReader.getContent(file.path); ... })` with: first `const rawContents = await Promise.all(files.map((file) => this.fileContentReader.getContent(file.path)))`, then map over `files` with index and use `rawContents[i]` as `rawContent`. Rest of reduce/transform logic unchanged.

**Verify:** `pnpm typecheck` passes.

### Step 7: SummarisationLadder — async compress with content preload

In `shared/src/pipeline/summarisation-ladder.ts`:

- Change `compress(files, budget): readonly SelectedFile[]` to `async compress(files, budget): Promise<readonly SelectedFile[]>`.
- At the start of compress: `const contentMap = new Map<RelativePath, string>(); await Promise.all(files.map(async (f) => { contentMap.set(f.path, await this.fileContentReader.getContent(f.path)); }));`
- Replace the inner use of `this.fileContentReader.getContent(filePath)` in `tokenAtTier` with `contentMap.get(filePath) ?? ""` (or a closure that has access to contentMap). Ensure tokenAtTier receives the map or a getter that reads from it.
- Rest of demoteLoop/dropToFit logic unchanged.

**Verify:** `pnpm typecheck` passes.

### Step 8: PromptAssembler — async assemble

In `shared/src/pipeline/prompt-assembler.ts`:

- Change `assemble(...): string` to `async assemble(...): Promise<string>`.
- Replace `files.flatMap((file) => { const content = this.fileContentReader.getContent(file.path); ... })` with: `const contents = await Promise.all(files.map((f) => this.fileContentReader.getContent(f.path)))`, then `const contextParts = files.map((file, i) => [\`### ${file.path} [Tier: ${file.tier}]\`, contents[i], ""]).flat()`.
- Return sections.join("\n").trimEnd() as today.

**Verify:** `pnpm typecheck` passes.

### Step 9: runPipelineSteps — await all step calls

In `shared/src/core/run-pipeline-steps.ts`:

- Change `const contextResult = deps.contextSelector.selectContext(...)` to `const contextResult = await deps.contextSelector.selectContext(...)`.
- Change `const { result: guardResult, safeFiles } = deps.contextGuard.scan(...)` to `const { result: guardResult, safeFiles } = await deps.contextGuard.scan(...)`.
- Change `const transformResult = deps.contentTransformerPipeline.transform(...)` to `const transformResult = await deps.contentTransformerPipeline.transform(...)`.
- Change `const ladderFiles = deps.summarisationLadder.compress(...)` to `const ladderFiles = await deps.summarisationLadder.compress(...)`.
- Change `const assembledPrompt = deps.promptAssembler.assemble(...)` to `const assembledPrompt = await deps.promptAssembler.assemble(...)`.

**Verify:** `pnpm typecheck` passes.

### Step 10: Update pipeline and integration tests

- In `shared/src/pipeline/__tests__/content-transformer-pipeline.test.ts`: every `pipeline.transform(files, ...)` → `await pipeline.transform(files, ...)` (test callbacks async where needed).
- In `shared/src/pipeline/__tests__/prompt-assembler.test.ts`: every `assembler.assemble(...)` → `await assembler.assemble(...)`.
- In `shared/src/pipeline/__tests__/context-guard.test.ts`: every `guard.scan(files)` → `await guard.scan(files)`.
- In `shared/src/pipeline/__tests__/heuristic-selector.test.ts`: every `selector.selectContext(...)` → `await selector.selectContext(...)`; ensure fileContentReader mock has `getContent` returning `Promise.resolve(content)`.
- In `shared/src/pipeline/__tests__/summarisation-ladder.test.ts`: every `ladder.compress(...)` → `await ladder.compress(...)`.
- In `shared/src/pipeline/__tests__/compilation-runner.test.ts` and `inspect-runner.test.ts`: mocks for contextSelector, contextGuard, contentTransformerPipeline, summarisationLadder, promptAssembler must return Promises (e.g. `selectContext: () => Promise.resolve(contextResult)`).
- In `shared/src/integration/__tests__/full-pipeline.test.ts` and `golden-snapshot.test.ts`: the inline `getContent` mock (returning string) must return `Promise.resolve(content)` and callers must await.

**Verify:** `pnpm test` for shared (unit + integration) passes.

### Step 11: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, no new warnings or knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| Existing unit tests | All pipeline and adapter tests updated to await async methods; mocks return Promises. |
| Existing integration tests | full-pipeline, golden-snapshot, real-project, selection-quality, token-reduction: no API change to runPipelineSteps result; they already await run(); file reader mock or real CachingFileContentReader returns Promise. |

## Acceptance Criteria

- [ ] FileContentReader.getContent returns Promise<string>; CachingFileContentReader uses fs.promises.
- [ ] All pipeline steps that read files (selectContext, scan, transform, compress, assemble) are async and awaited in runPipelineSteps.
- [ ] All listed files modified; no new files.
- [ ] `pnpm lint` — zero errors, zero warnings.
- [ ] `pnpm typecheck` — clean.
- [ ] `pnpm test` — all pass.
- [ ] `pnpm knip` — no new unused files, exports, or dependencies.
- [ ] No layer boundary violations; core/pipeline still do not import node:fs.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise.
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need.
3. Report to the user and wait for guidance.

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations (type casts, extra plumbing, output patching), stop. List the adaptations, report to the user, and re-evaluate before continuing.
