# Task 098: Scan — async parallel file system I/O

> **Status:** Done
> **Phase:** P (Context Quality, Token Efficiency & Compilation Performance)
> **Layer:** adapter
> **Depends on:** Scan: eliminate double-stat via fast-glob stats

## Goal

Replace synchronous fast-glob and blocking scan with the async fast-glob API so directory traversal and stat I/O run asynchronously and unblock the MCP event loop, improving scan speed and responsiveness.

## Architecture Notes

- One adapter per library; GlobProvider interface and FastGlobAdapter are extended to return Promises; no new adapter file.
- RepoMapSupplier.getRepoMap already returns Promise<RepoMap>; FileSystemRepoMapSupplier will await findWithStats.
- init-language-providers is already async; projectHasExtension becomes async and awaits glob.find().

## Files

| Action | Path                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------- |
| Modify | `shared/src/core/interfaces/glob-provider.interface.ts` (find and findWithStats return Promise)      |
| Modify | `shared/src/adapters/fast-glob-adapter.ts` (use fg() async API instead of fg.sync)                   |
| Modify | `shared/src/adapters/file-system-repo-map-supplier.ts` (await findWithStats in getRepoMap)           |
| Modify | `shared/src/adapters/init-language-providers.ts` (projectHasExtension async, await glob.find)        |
| Modify | `shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts` (mocks return Promise.resolve) |
| Modify | `shared/src/adapters/__tests__/fast-glob-adapter.test.ts` (tests async, await adapter methods)       |

## Interface / Signature

```typescript
import type { AbsolutePath } from "#core/types/paths.js";
import type { RelativePath } from "#core/types/paths.js";
import type { PathWithStat } from "#core/types/path-with-stat.js";

export interface GlobProvider {
  find(patterns: readonly string[], cwd: AbsolutePath): Promise<readonly RelativePath[]>;
  findWithStats(
    patterns: readonly string[],
    cwd: AbsolutePath,
  ): Promise<readonly PathWithStat[]>;
}
```

```typescript
export class FastGlobAdapter implements GlobProvider {
  constructor() {}

  find(patterns: readonly string[], cwd: AbsolutePath): Promise<readonly RelativePath[]>;
  findWithStats(
    patterns: readonly string[],
    cwd: AbsolutePath,
  ): Promise<readonly PathWithStat[]>;
}
```

```typescript
// FileSystemRepoMapSupplier constructor unchanged; getRepoMap awaits this.globProvider.findWithStats(...) then builds RepoMap
```

## Dependent Types

### Tier 0 — verbatim

```typescript
import type { RelativePath } from "#core/types/paths.js";
import type { Bytes } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface PathWithStat {
  readonly path: RelativePath;
  readonly sizeBytes: Bytes;
  readonly lastModified: ISOTimestamp;
}
```

Source: `shared/src/core/types/path-with-stat.ts`. FastGlobAdapter builds PathWithStat from fast-glob Entry (toRelativePath, toBytes(entry.stats.size), toISOTimestamp(entry.stats.mtime.toISOString())).

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
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | `toISOTimestamp(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Change GlobProvider to async

In `shared/src/core/interfaces/glob-provider.interface.ts`, change both method return types from synchronous to Promise: `find(...): Promise<readonly RelativePath[]>` and `findWithStats(...): Promise<readonly PathWithStat[]>`.

**Verify:** File exists; both method signatures have return type `Promise<...>`.

### Step 2: Implement async find and findWithStats in FastGlobAdapter

In `shared/src/adapters/fast-glob-adapter.ts`, replace `fg.sync` with the default async `fg`. For find: if patterns.length === 0 return Promise.resolve([]). Otherwise `const raw = await fg([...patterns], { cwd: cwdStr });` then map to RelativePath (same path resolution as today) and return Promise.resolve(result). For findWithStats: if patterns.length === 0 return Promise.resolve([]). Otherwise `const raw = await fg([...patterns], { cwd: cwdStr, stats: true });` then filter entries with defined stats, map each to PathWithStat (path via toRelativePath, sizeBytes via toBytes(entry.stats.size), lastModified via toISOTimestamp(entry.stats.mtime.toISOString())), return Promise.resolve(withStats). Use the async API only; do not call fg.sync.

**Verify:** `pnpm typecheck` and `pnpm lint` pass. fast-glob-adapter.ts is the only file that imports fast-glob.

### Step 3: FileSystemRepoMapSupplier await findWithStats

In `shared/src/adapters/file-system-repo-map-supplier.ts`, make getRepoMap body async: `const withStats = await this.globProvider.findWithStats(patterns, projectRoot);` then keep the rest of the logic unchanged (filter, reduce, return Promise.resolve({ root, files, totalFiles, totalTokens })).

**Verify:** `pnpm typecheck` and `pnpm lint` pass.

### Step 4: init-language-providers projectHasExtension async

In `shared/src/adapters/init-language-providers.ts`, change projectHasExtension to async: `async function projectHasExtension(projectRoot: string, ext: string): Promise<boolean>`. Inside it, use `const glob = new FastGlobAdapter();` and `const paths = await glob.find([...], toAbsolutePath(projectRoot));` then return paths.length > 0. Update every call site to await projectHasExtension (initLanguageProviders is already async so use `await projectHasExtension(projectRoot, ".py")` etc.).

**Verify:** `pnpm typecheck` and `pnpm lint` pass.

### Step 5: Update file-system-repo-map-supplier tests

In `shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts`, update each mock GlobProvider so find and findWithStats return Promises: `find: () => Promise.resolve([...])` and `findWithStats: () => Promise.resolve([...])` with the same array values as today. All four tests already await supplier.getRepoMap(projectRoot); no other test changes.

**Verify:** `pnpm test shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts` passes.

### Step 6: Update fast-glob-adapter tests

In `shared/src/adapters/__tests__/fast-glob-adapter.test.ts`, convert every test that calls adapter.find or adapter.findWithStats to async: use `async () => { ... }` and await the adapter method. For find empty patterns: `const result = await adapter.find([], cwd);`. For find matching pattern: `const result = await adapter.find(["**/*.ts"], cwd);`. For find with negation: await adapter.find. For find deterministic: await both calls. For find non-existent cwd: use `await expect(adapter.find(["**/*.ts"], cwd)).rejects.toThrow();`. For findWithStats_returns_path_size_mtime: `const result = await adapter.findWithStats(["**/*.ts"], cwd);`. Ensure tmpDir is set before any async call in each test.

**Verify:** `pnpm test shared/src/adapters/__tests__/fast-glob-adapter.test.ts` passes.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                    | Description                                                     |
| -------------------------------------------- | --------------------------------------------------------------- |
| find empty patterns returns []               | FastGlobAdapter.find([], cwd) resolves to [].                   |
| find matching pattern returns relative paths | find(["**/*.ts"], cwd) resolves to paths under cwd.             |
| find with negation excludes matching files   | Negation pattern excludes file.                                 |
| find deterministic                           | Two find calls return same order.                               |
| find non-existent cwd propagates error       | find with invalid cwd rejects.                                  |
| findWithStats_returns_path_size_mtime        | findWithStats returns path, sizeBytes, lastModified.            |
| bytes_div4_token_estimate_for_text_file      | RepoMap entry estimatedTokens from PathWithStat.                |
| binary_files_excluded                        | Binary extension filtered out.                                  |
| totalTokens_equals_sum_of_estimatedTokens    | Multiple files; totalTokens equals sum of file estimatedTokens. |
| empty_project_returns_zero_totalTokens       | findWithStats returns []; getRepoMap returns zero totalTokens.  |

## Acceptance Criteria

- [ ] GlobProvider find and findWithStats return Promise; FastGlobAdapter uses fg() async API
- [ ] FileSystemRepoMapSupplier getRepoMap awaits findWithStats
- [ ] init-language-providers projectHasExtension is async and awaits glob.find
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()` or `Date.now()` in adapter production code
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
