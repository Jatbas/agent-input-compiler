# Task 097: Scan — eliminate double-stat via fast-glob stats

> **Status:** Pending
> **Phase:** P (Context Quality, Token Efficiency & Compilation Performance)
> **Layer:** adapter
> **Depends on:** —

## Goal

Use fast-glob's `stats: true` so the scan returns path and stat data in one pass; FileSystemRepoMapSupplier builds FileEntry from that data and no longer calls `fs.statSync` on every file, eliminating the second stat pass and improving scan speed.

## Architecture Notes

- One adapter per library; GlobProvider is extended with findWithStats; FastGlobAdapter implements it; FileSystemRepoMapSupplier consumes it. No new adapter file.
- Core type PathWithStat (path, sizeBytes, lastModified) keeps Node fs.Stats out of the core interface (ADR-010 branded types).
- init-language-providers continues to use GlobProvider.find(); only FileSystemRepoMapSupplier uses findWithStats.

## Files

| Action | Path                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| Create | `shared/src/core/types/path-with-stat.ts`                                                  |
| Modify | `shared/src/core/types/index.ts` (export PathWithStat)                                     |
| Modify | `shared/src/core/interfaces/glob-provider.interface.ts` (add findWithStats)                |
| Modify | `shared/src/adapters/fast-glob-adapter.ts` (implement findWithStats with stats: true)      |
| Modify | `shared/src/adapters/file-system-repo-map-supplier.ts` (use findWithStats, remove fs)      |
| Modify | `shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts` (mock findWithStats) |
| Modify | `shared/src/adapters/__tests__/fast-glob-adapter.test.ts` (add findWithStats test)         |

## Interface / Signature

```typescript
// shared/src/core/interfaces/glob-provider.interface.ts (after change)
import type { AbsolutePath } from "#core/types/paths.js";
import type { RelativePath } from "#core/types/paths.js";
import type { PathWithStat } from "#core/types/path-with-stat.js";

export interface GlobProvider {
  find(patterns: readonly string[], cwd: AbsolutePath): readonly RelativePath[];
  findWithStats(patterns: readonly string[], cwd: AbsolutePath): readonly PathWithStat[];
}
```

```typescript
// shared/src/adapters/fast-glob-adapter.ts — class and new method
export class FastGlobAdapter implements GlobProvider {
  constructor() {}
  find(patterns: readonly string[], cwd: AbsolutePath): readonly RelativePath[] { ... }
  findWithStats(
    patterns: readonly string[],
    cwd: AbsolutePath,
  ): readonly PathWithStat[] { ... }
}
```

```typescript
// FileSystemRepoMapSupplier constructor unchanged; getRepoMap uses findWithStats and builds FileEntry from PathWithStat
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// shared/src/core/types/path-with-stat.ts (new)
import type { RelativePath } from "#core/types/paths.js";
import type { Bytes } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface PathWithStat {
  readonly path: RelativePath;
  readonly sizeBytes: Bytes;
  readonly lastModified: ISOTimestamp;
}
```

### Tier 1 — signature + path

| Type             | Path                                                      | Members | Purpose                            |
| ---------------- | --------------------------------------------------------- | ------- | ---------------------------------- |
| `IgnoreProvider` | `shared/src/core/interfaces/ignore-provider.interface.ts` | 1       | accepts(relativePath, projectRoot) |

### Tier 2 — path-only

| Type           | Path                                   | Factory               |
| -------------- | -------------------------------------- | --------------------- |
| `RelativePath` | `shared/src/core/types/paths.ts`       | `toRelativePath(raw)` |
| `AbsolutePath` | `shared/src/core/types/paths.ts`       | `toAbsolutePath(raw)` |
| `Bytes`        | `shared/src/core/types/units.ts`       | `toBytes(n)`          |
| `TokenCount`   | `shared/src/core/types/units.ts`       | `toTokenCount(n)`     |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | `toISOTimestamp(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create PathWithStat type

Create `shared/src/core/types/path-with-stat.ts` with the PathWithStat interface (Tier 0 block above). Use named imports from `#core/types/paths.js`, `#core/types/units.js`, `#core/types/identifiers.js`.

**Verify:** File exists; `pnpm typecheck` in shared passes.

### Step 2: Export PathWithStat from core types index

In `shared/src/core/types/index.ts`, add `export type { PathWithStat } from "./path-with-stat.js";` (with other type exports).

**Verify:** `pnpm typecheck` in shared passes.

### Step 3: Add findWithStats to GlobProvider interface

In `shared/src/core/interfaces/glob-provider.interface.ts`, add `import type { PathWithStat } from "#core/types/path-with-stat.js";` and add the method signature: `findWithStats(patterns: readonly string[], cwd: AbsolutePath): readonly PathWithStat[];`.

**Verify:** `pnpm typecheck` in shared passes.

### Step 4: Implement findWithStats in FastGlobAdapter

In `shared/src/adapters/fast-glob-adapter.ts`, add `import type { PathWithStat } from "#core/types/path-with-stat.js";`, `import { toBytes } from "#core/types/units.js";`, and `import { toISOTimestamp } from "#core/types/identifiers.js";`. Implement findWithStats: if patterns.length === 0 return []. Call `fg.sync([...patterns], { cwd: cwdStr, stats: true })` to get Entry[]. Map each entry to PathWithStat: path = toRelativePath(entry.path), sizeBytes = toBytes(entry.stats.size), lastModified = toISOTimestamp(entry.stats.mtime.toISOString()). Return the array as readonly PathWithStat[]. Use the sync API; fast-glob returns Entry with .path (relative to cwd) and .stats (fs.Stats).

**Verify:** `pnpm typecheck` and `pnpm lint` pass. fast-glob-adapter.ts is the only file that imports fast-glob.

### Step 5: FileSystemRepoMapSupplier use findWithStats and remove fs

In `shared/src/adapters/file-system-repo-map-supplier.ts`, remove the `import * as fs from "node:fs";` line. Keep `import * as path from "node:path";` for path.extname. Replace the getRepoMap implementation: call `this.globProvider.findWithStats(patterns, projectRoot)` instead of `this.globProvider.find(...)`. Filter results with `this.ignoreProvider.accepts(entry.path, projectRoot)`. Replace the reduce: for each PathWithStat build FileEntry using entry.path, languageFromExtension(path.extname(entry.path).toLowerCase()), skip if isBinaryExtension(ext) with null; otherwise build { path: entry.path, language, sizeBytes: entry.sizeBytes, estimatedTokens: toTokenCount(Math.ceil(entry.sizeBytes / 4)), lastModified: entry.lastModified }. Remove the tryBuildEntry helper and any fs.statSync usage.

**Verify:** `pnpm typecheck` and `pnpm lint` pass. file-system-repo-map-supplier.ts has no import of node:fs.

### Step 6: Update file-system-repo-map-supplier tests

In `shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts`, update each mock GlobProvider to implement both find and findWithStats (GlobProvider requires both). For bytes_div4_token_estimate_for_text_file: mock findWithStats to return one PathWithStat with path toRelativePath("a.ts"), sizeBytes toBytes(Buffer.byteLength(content, "utf8")), lastModified toISOTimestamp(new Date().toISOString()). For binary_files_excluded: mock findWithStats to return one entry for "x.png" with sizeBytes toBytes(6). For totalTokens_equals_sum_of_estimatedTokens: mock findWithStats to return two PathWithStat entries for a.ts and b.ts with correct sizes (1 and 2 bytes). For empty_project_returns_zero_totalTokens: mock findWithStats to return []. Ensure mock type satisfies GlobProvider (implements both find and findWithStats). Run tests; all four tests pass.

**Verify:** `pnpm test shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts` passes.

### Step 7: Add findWithStats test in fast-glob-adapter.test

In `shared/src/adapters/__tests__/fast-glob-adapter.test.ts`, add a test findWithStats_returns_path_size_mtime: create temp dir, write one file named a.ts with content "x", call adapter.findWithStats(["**/*.ts"], cwd), expect result length 1, expect result[0].path to equal toRelativePath("a.ts"), result[0].sizeBytes to equal toBytes(1), and result[0].lastModified to be a string in ISO timestamp format.

**Verify:** `pnpm test shared/src/adapters/__tests__/fast-glob-adapter.test.ts` passes.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                 | Description                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| findWithStats_returns_path_size_mtime     | FastGlobAdapter.findWithStats returns path, sizeBytes, lastModified for matched file. |
| bytes_div4_token_estimate_for_text_file   | RepoMap entry estimatedTokens from PathWithStat sizeBytes.                            |
| binary_files_excluded                     | Binary extension filtered out when building from PathWithStat.                        |
| totalTokens_equals_sum_of_estimatedTokens | Multiple files; totalTokens equals sum of file estimatedTokens.                       |
| empty_project_returns_zero_totalTokens    | findWithStats returns []; getRepoMap returns zero totalTokens.                        |

## Acceptance Criteria

- [ ] PathWithStat type created and exported
- [ ] GlobProvider has findWithStats; FastGlobAdapter implements it with fg.sync(..., { stats: true })
- [ ] FileSystemRepoMapSupplier uses findWithStats and has no node:fs import
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()` or `Date.now()` in adapter production code (tests may use them only when constructing mock lastModified)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
