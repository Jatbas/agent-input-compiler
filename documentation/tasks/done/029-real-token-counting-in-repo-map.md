# Task 029: Real token counting in repo map

> **Status:** Done
> **Phase:** 0.5 Phase I — Live Wiring & Bug Fixes
> **Layer:** adapter
> **Depends on:** FileSystemRepoMapSupplier, createFullPipelineDeps, Wire real RepoMap in MCP/CLI

## Goal

Use real token counts (via TokenCounter) instead of bytes/4 when building RepoMap in FileSystemRepoMapSupplier, so context selection and budget use accurate per-file token estimates.

## Architecture Notes

- Adapter receives interfaces only (GlobProvider, IgnoreProvider, FileContentReader, TokenCounter); no new library — tiktoken stays in TiktokenAdapter.
- DIP: FileSystemRepoMapSupplier gets FileContentReader and TokenCounter from composition root (createFullPipelineDeps); bootstrap already has fileContentReader and tiktokenAdapter.
- On read or count failure use bytes/4 fallback so files are not dropped from the map.

## Files

| Action | Path                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `shared/src/adapters/file-system-repo-map-supplier.ts` (add FileContentReader + TokenCounter; real token count with bytes/4 fallback) |
| Create | `shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts`                                                                 |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (pass fileContentReader and tokenCounter to FileSystemRepoMapSupplier)                 |

## Interface / Signature

```typescript
import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap } from "#core/types/repo-map.js";

export interface RepoMapSupplier {
  getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap>;
}
```

```typescript
export class FileSystemRepoMapSupplier implements RepoMapSupplier {
  constructor(
    private readonly globProvider: GlobProvider,
    private readonly ignoreProvider: IgnoreProvider,
    private readonly fileContentReader: FileContentReader,
    private readonly tokenCounter: TokenCounter,
  ) {}

  getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap>;
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
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

### Tier 1 — signature + path

| Type                | Path                                                          | Members                     | Purpose                           |
| ------------------- | ------------------------------------------------------------- | --------------------------- | --------------------------------- |
| `GlobProvider`      | `shared/src/core/interfaces/glob-provider.interface.ts`       | find(patterns, projectRoot) | Discover paths under project root |
| `IgnoreProvider`    | `shared/src/core/interfaces/ignore-provider.interface.ts`     | accepts(path, projectRoot)  | Filter by .gitignore              |
| `FileContentReader` | `shared/src/core/interfaces/file-content-reader.interface.ts` | getContent(path)            | Read file content by RelativePath |
| `TokenCounter`      | `shared/src/core/interfaces/token-counter.interface.ts`       | countTokens(text)           | Count tokens from content         |

### Tier 2 — path-only

| Type           | Path                                   | Factory               |
| -------------- | -------------------------------------- | --------------------- |
| `AbsolutePath` | `shared/src/core/types/paths.js`       | `toAbsolutePath(raw)` |
| `RelativePath` | `shared/src/core/types/paths.js`       | `toRelativePath(raw)` |
| `TokenCount`   | `shared/src/core/types/units.js`       | `toTokenCount(raw)`   |
| `Bytes`        | `shared/src/core/types/units.js`       | `toBytes(raw)`        |
| `ISOTimestamp` | `shared/src/core/types/identifiers.js` | `toISOTimestamp(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add FileContentReader and TokenCounter to FileSystemRepoMapSupplier

In `shared/src/adapters/file-system-repo-map-supplier.ts`: add `FileContentReader` and `TokenCounter` to the constructor (third and fourth parameters). Refactor entry building so that for each non-binary file you call `fileContentReader.getContent(relativePath)` then `tokenCounter.countTokens(content)` to set `estimatedTokens`. On throw from `getContent` or `countTokens`, use `toTokenCount(Math.ceil(stat.size / 4))` as fallback. Keep binary check and stat-based size/lastModified/language; remove the constant `BYTES_PER_TOKEN` and the bytes/4 calculation for the success path. Aggregate `totalTokens` as the sum of each entry's `estimatedTokens` (then pass the sum to `toTokenCount` for the RepoMap).

**Verify:** Run `pnpm typecheck` from repo root; no errors.

### Step 2: Wire fileContentReader and tokenCounter in createFullPipelineDeps

In `shared/src/bootstrap/create-pipeline-deps.ts`: in `createFullPipelineDeps`, where `FileSystemRepoMapSupplier` is constructed, pass `fileContentReader` and `tokenCounter` (the existing `tiktokenAdapter` used as `tokenCounter` in the returned deps) as the third and fourth arguments. Signature becomes `new FileSystemRepoMapSupplier(new FastGlobAdapter(), new IgnoreAdapter(), fileContentReader, tiktokenAdapter)`.

**Verify:** Run `pnpm typecheck`; no errors.

### Step 3: Add file-system-repo-map-supplier tests

Create `shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts`. Use a temp directory and a real or mock GlobProvider and IgnoreProvider that return known paths. Provide a mock FileContentReader that returns fixed content for given RelativePath and a mock TokenCounter that returns a fixed TokenCount for given text. Assert that the returned RepoMap's file entries have `estimatedTokens` equal to the mock count. Add a test where FileContentReader.getContent throws for one path; assert that entry still appears with `estimatedTokens` equal to `toTokenCount(Math.ceil(stat.size / 4))`. Add a test that a path with an extension in the existing BINARY_EXTENSIONS set produces no entry. Add a test that `repoMap.totalTokens` equals the sum of `repoMap.files[].estimatedTokens` for 2+ files. Add a test that when no files match (empty glob or all filtered), `repoMap.files.length === 0` and `repoMap.totalTokens` is `toTokenCount(0)`.

**Verify:** Run `pnpm test -- shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts`; all tests pass.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                 | Description                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| real_token_count_used_for_text_file       | FileEntry.estimatedTokens equals mock TokenCounter count when content is readable |
| bytes_fallback_when_getContent_throws     | Entry still present with estimatedTokens = ceil(size/4) when getContent throws    |
| binary_files_excluded                     | Extension in BINARY_EXTENSIONS yields no entry                                    |
| totalTokens_equals_sum_of_estimatedTokens | repoMap.totalTokens equals sum of files[].estimatedTokens for 2+ files            |
| empty_project_returns_zero_totalTokens    | repoMap.files.length === 0 and totalTokens is toTokenCount(0) when no files       |

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
