# Task 099: Scan — cached RepoMap with file watcher

> **Status:** Pending
> **Phase:** P (Context Quality, Token Efficiency & Compilation Performance)
> **Layer:** adapter
> **Depends on:** Scan: async parallel file system I/O (Done)

## Goal

Add a `WatchingRepoMapSupplier` adapter that decorates `RepoMapSupplier` with an in-memory cache and `fs.watch`, so subsequent `getRepoMap()` calls return instantly from cache while the watcher keeps entries up to date on file changes, with graceful fallback to full scan when watching fails.

## Architecture Notes

- OCP: New class `WatchingRepoMapSupplier` implements `RepoMapSupplier` + `Closeable`; wraps existing `FileSystemRepoMapSupplier` via decorator pattern — no modifications to existing classes.
- Adapter layer: `node:fs` and `node:path` allowed. ESLint adapter boundary already permits these.
- Shared code extraction: `BINARY_EXTENSIONS`, `EXTENSION_TO_LANGUAGE`, `languageFromExtension`, `isBinaryExtension` extracted from `FileSystemRepoMapSupplier` to `file-entry-utils.ts` to avoid jscpd clone violations (~85 lines).
- DIP: `watchFn` injected via constructor for testability; defaults to `fs.watch` in production. No `vi.mock` needed for Node built-ins.
- Immutability: Cache updates build new `RepoMap` objects; never mutate cached data. No `.push()`, `.splice()`, or `let`.
- Error recovery: watcher runtime errors (`'error'` event) invalidate cache and close the watcher; next `getRepoMap` call does a full scan and attempts to set up a new watcher (automatic restart).
- Multi-project: Cache is keyed by `AbsolutePath` (projectRoot); supports one watcher per project root.

## Files

| Action | Path                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/closeable.interface.ts`                                                                    |
| Create | `shared/src/adapters/file-entry-utils.ts`                                                                              |
| Create | `shared/src/adapters/watching-repo-map-supplier.ts`                                                                    |
| Create | `shared/src/adapters/__tests__/watching-repo-map-supplier.test.ts`                                                     |
| Modify | `shared/src/adapters/file-system-repo-map-supplier.ts` (import from file-entry-utils, remove inline constants/helpers) |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (wrap FileSystemRepoMapSupplier with WatchingRepoMapSupplier)           |

## Interface / Signature

```typescript
// shared/src/core/interfaces/closeable.interface.ts
export interface Closeable {
  close(): void;
}
```

```typescript
// shared/src/core/interfaces/repo-map-supplier.interface.ts (unchanged — shown for reference)
import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap } from "#core/types/repo-map.js";

export interface RepoMapSupplier {
  getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap>;
}
```

```typescript
// shared/src/adapters/watching-repo-map-supplier.ts
import * as fs from "node:fs";
import * as path from "node:path";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { Closeable } from "#core/interfaces/closeable.interface.js";
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap } from "#core/types/repo-map.js";

type WatchFn = (
  path: string,
  options: { recursive: boolean },
  listener: (eventType: string, filename: string | null) => void,
) => fs.FSWatcher;

export class WatchingRepoMapSupplier implements RepoMapSupplier, Closeable {
  constructor(
    private readonly inner: RepoMapSupplier,
    private readonly ignoreProvider: IgnoreProvider,
    private readonly watchFn: WatchFn = fs.watch,
    private readonly statFn: (path: string) => fs.Stats = fs.statSync,
  ) {}

  getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap>;
  close(): void;
}
```

```typescript
// shared/src/adapters/file-entry-utils.ts
import type { FileEntry } from "#core/types/repo-map.js";
import type { Bytes } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { RelativePath } from "#core/types/paths.js";
import { toTokenCount } from "#core/types/units.js";

export const BINARY_EXTENSIONS: ReadonlySet<string>;
export const EXTENSION_TO_LANGUAGE: Readonly<Record<string, string>>;
export function languageFromExtension(ext: string): string;
export function isBinaryExtension(ext: string): boolean;
export function buildFileEntry(
  relativePath: RelativePath,
  sizeBytes: Bytes,
  lastModified: ISOTimestamp,
): FileEntry | null;
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// shared/src/core/types/repo-map.ts
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
// shared/src/core/interfaces/ignore-provider.interface.ts
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";

export interface IgnoreProvider {
  accepts(relativePath: RelativePath, root: AbsolutePath): boolean;
}
```

### Tier 2 — path-only

| Type           | Path                                   | Factory               |
| -------------- | -------------------------------------- | --------------------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts`       | `toAbsolutePath(raw)` |
| `RelativePath` | `shared/src/core/types/paths.ts`       | `toRelativePath(raw)` |
| `TokenCount`   | `shared/src/core/types/units.ts`       | `toTokenCount(n)`     |
| `Bytes`        | `shared/src/core/types/units.ts`       | `toBytes(n)`          |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | `toISOTimestamp(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create Closeable interface

Create `shared/src/core/interfaces/closeable.interface.ts` with the `Closeable` interface containing a single `close(): void` method. No imports needed.

**Verify:** `pnpm typecheck` passes.

### Step 2: Create file-entry-utils.ts

Create `shared/src/adapters/file-entry-utils.ts`. Move the following from `shared/src/adapters/file-system-repo-map-supplier.ts`:

- `BINARY_EXTENSIONS` (the entire `ReadonlySet<string>`)
- `EXTENSION_TO_LANGUAGE` (the entire `Readonly<Record<string, string>>`)
- `languageFromExtension(ext: string): string`
- `isBinaryExtension(ext: string): boolean`

Add a new helper function `buildFileEntry` that constructs a `FileEntry | null` from a `RelativePath`, `Bytes`, and `ISOTimestamp`:

```typescript
import * as path from "node:path";
import type { FileEntry } from "#core/types/repo-map.js";
import type { Bytes } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { RelativePath } from "#core/types/paths.js";
import { toTokenCount } from "#core/types/units.js";

export function buildFileEntry(
  relativePath: RelativePath,
  sizeBytes: Bytes,
  lastModified: ISOTimestamp,
): FileEntry | null {
  const ext = path.extname(relativePath).toLowerCase();
  if (isBinaryExtension(ext)) return null;
  const language = languageFromExtension(ext);
  const estimatedTokens = toTokenCount(Math.ceil(sizeBytes / 4));
  return { path: relativePath, language, sizeBytes, estimatedTokens, lastModified };
}
```

Export all five items as named exports.

**Verify:** `pnpm typecheck` passes.

### Step 3: Refactor FileSystemRepoMapSupplier to use file-entry-utils

In `shared/src/adapters/file-system-repo-map-supplier.ts`:

1. Remove the inline `BINARY_EXTENSIONS`, `EXTENSION_TO_LANGUAGE`, `languageFromExtension`, `isBinaryExtension` declarations (lines 9–109 approximately).
2. Add `import { isBinaryExtension, languageFromExtension } from "./file-entry-utils.js";` (named imports).
3. The `getRepoMap` method body stays the same — it already calls `isBinaryExtension(ext)` and `languageFromExtension(ext)` by name.
4. Keep `import * as path from "node:path"` (still used for `path.extname`).
5. Keep `DEFAULT_NEGATIVE_PATTERNS` (not shared — only used by the scan path).

After the change, `file-system-repo-map-supplier.ts` should be ~50 lines (down from ~148).

**Verify:** `pnpm typecheck` and `pnpm lint` pass. `pnpm test shared/src/adapters/__tests__/file-system-repo-map-supplier.test.ts` passes (no test changes needed — tests mock `GlobProvider`, not the utils).

### Step 4: Implement WatchingRepoMapSupplier — getRepoMap

Create `shared/src/adapters/watching-repo-map-supplier.ts`.

Imports:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { Closeable } from "#core/interfaces/closeable.interface.js";
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import { toRelativePath } from "#core/types/paths.js";
import { toBytes } from "#core/types/units.js";
import { toTokenCount } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { buildFileEntry } from "./file-entry-utils.js";
```

Define the `WatchFn` type alias and `CacheEntry` type at module level:

```typescript
type WatchFn = (
  path: string,
  options: { recursive: boolean },
  listener: (eventType: string, filename: string | null) => void,
) => fs.FSWatcher;

interface CacheEntry {
  readonly repoMap: RepoMap;
  readonly watcher: fs.FSWatcher;
}
```

Class skeleton:

```typescript
export class WatchingRepoMapSupplier implements RepoMapSupplier, Closeable {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastErrors = new Map<string, string>();

  constructor(
    private readonly inner: RepoMapSupplier,
    private readonly ignoreProvider: IgnoreProvider,
    private readonly watchFn: WatchFn = fs.watch,
    private readonly statFn: (path: string) => fs.Stats = fs.statSync,
  ) {}
}
```

Implement `getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap>`:

1. Check `this.cache.get(projectRoot)`. If present, return `Promise.resolve(cached.repoMap)`.
2. Else: `const repoMap = await this.inner.getRepoMap(projectRoot)`.
3. Try `const watcher = this.watchFn(projectRoot, { recursive: true }, (eventType, filename) => this.handleWatchEvent(projectRoot, filename))`.
4. Register `watcher.on("error", (err: Error) => this.handleWatchError(projectRoot, err))`.
5. Store `this.cache.set(projectRoot, { repoMap, watcher })`.
6. Clear `this.lastErrors.delete(projectRoot)`.
7. Return `repoMap`.
8. If step 3 throws: catch the error, store reason in `this.lastErrors.set(projectRoot, (err as Error).message)`, do NOT cache, return `repoMap`.

**Verify:** `pnpm typecheck` passes (methods `handleWatchEvent`, `handleWatchError`, and `close` will be added in Step 5).

### Step 5a: Implement helpers — rebuildRepoMap and invalidateCache

In `shared/src/adapters/watching-repo-map-supplier.ts`, add two private helper methods:

**`private rebuildRepoMap(projectRoot: AbsolutePath, files: readonly FileEntry[]): RepoMap`**

1. Compute `const totalTokensRaw = files.reduce((sum, e) => sum + e.estimatedTokens, 0)`.
2. Return `{ root: projectRoot, files, totalFiles: files.length, totalTokens: toTokenCount(totalTokensRaw) }`.

**`private invalidateCache(projectRoot: string): void`**

1. Get entry from `this.cache.get(projectRoot)`.
2. If present: call `entry.watcher.close()`, then `this.cache.delete(projectRoot)`.

**Verify:** `pnpm typecheck` passes.

### Step 5b: Implement handleWatchEvent

In `shared/src/adapters/watching-repo-map-supplier.ts`, add:

**`private handleWatchEvent(projectRoot: AbsolutePath, filename: string | null): void`**

1. If `filename === null`: call `this.invalidateCache(projectRoot)`. Return.
2. Compute `const fullPath = path.join(projectRoot, filename)`.
3. Try `const stat = this.statFn(fullPath)`.
4. If stat throws with `code === "ENOENT"`: file was deleted. Remove the entry from the cached RepoMap for that `filename` path. Call `this.updateCacheEntry(projectRoot, updatedFiles)`. Return.
5. If stat throws with any other error: call `this.invalidateCache(projectRoot)`. Return.
6. If `!stat.isFile()`: ignore (directory change). Return.
7. Build `const relativePath = toRelativePath(filename)`.
8. If `!this.ignoreProvider.accepts(relativePath, projectRoot)`: remove entry if present (file is now ignored). Update cache. Return.
9. Call `buildFileEntry(relativePath, toBytes(stat.size), toISOTimestamp(stat.mtime.toISOString()))`.
10. If result is `null` (binary file): remove entry if present. Update cache. Return.
11. Else: upsert the new `FileEntry` into the cached files array (filter out existing entry with same path, spread in new entry). Call `this.updateCacheEntry(projectRoot, updatedFiles)`.

Where `updateCacheEntry` is an inline pattern: get existing cache entry, rebuild RepoMap with `this.rebuildRepoMap(projectRoot, updatedFiles)`, replace cache entry keeping same watcher reference: `this.cache.set(projectRoot, { repoMap: newRepoMap, watcher: existing.watcher })`.

**Verify:** `pnpm typecheck` passes.

### Step 5c: Implement handleWatchError and close

In `shared/src/adapters/watching-repo-map-supplier.ts`, add:

**`private handleWatchError(projectRoot: AbsolutePath, err: Error): void`**

1. Store `this.lastErrors.set(projectRoot, err.message)`.
2. Call `this.invalidateCache(projectRoot)`.

**`close(): void`**

1. Iterate `this.cache.values()`, call `entry.watcher.close()` on each.
2. Call `this.cache.clear()`.

**Verify:** `pnpm typecheck` and `pnpm lint` pass.

### Step 6: Wire in createFullPipelineDeps (file: create-pipeline-deps.ts)

In `shared/src/bootstrap/create-pipeline-deps.ts`:

1. Add `import { WatchingRepoMapSupplier } from "#adapters/watching-repo-map-supplier.js";`.
2. Replace the current wiring:

Before:

```typescript
const repoMapSupplier = new FileSystemRepoMapSupplier(
  new FastGlobAdapter(),
  new IgnoreAdapter(),
);
return { ...partial, repoMapSupplier };
```

After:

```typescript
const ignoreAdapter = new IgnoreAdapter();
const inner = new FileSystemRepoMapSupplier(new FastGlobAdapter(), ignoreAdapter);
const repoMapSupplier = new WatchingRepoMapSupplier(inner, ignoreAdapter);
return { ...partial, repoMapSupplier };
```

The `IgnoreAdapter` instance is shared between both suppliers. The `watchFn` parameter defaults to `fs.watch` (not passed explicitly — uses the constructor default).

**Verify:** `pnpm typecheck` and `pnpm lint` pass. `pnpm test` passes (integration tests use the wired deps).

### Step 7: Tests

Create `shared/src/adapters/__tests__/watching-repo-map-supplier.test.ts`.

Test setup: Create a mock `RepoMapSupplier` (inner) that returns a fixed `RepoMap`. Create a mock `IgnoreProvider` that returns `true` for `accepts`. Create a mock `watchFn` that captures the listener and returns a mock `FSWatcher` (object with `close: vi.fn()`, `on: vi.fn()` that captures the error handler). Use `toAbsolutePath`, `toRelativePath`, `toBytes`, `toTokenCount`, `toISOTimestamp` from core types.

For `statSync` in the callback: inject a `statFn` as a fourth constructor parameter (typed `(path: string) => fs.Stats`), defaulting to `fs.statSync` in production. This avoids `vi.mock("node:fs")` entirely. Add `statFn` to the constructor signature:

```typescript
constructor(
  private readonly inner: RepoMapSupplier,
  private readonly ignoreProvider: IgnoreProvider,
  private readonly watchFn: WatchFn = fs.watch,
  private readonly statFn: (path: string) => fs.Stats = fs.statSync,
) {}
```

Update the Interface/Signature section accordingly. The `handleWatchEvent` method uses `this.statFn(fullPath)` instead of `fs.statSync(fullPath)`.

Test cases:

1. **first_call_delegates_and_returns**: Create supplier with mock inner, mock watchFn. Call `getRepoMap(projectRoot)`. Assert result equals the mock RepoMap. Assert `inner.getRepoMap` called once. Assert `watchFn` called once with `projectRoot` and `{ recursive: true }`.

2. **second_call_same_root_returns_cached**: Call `getRepoMap` twice with same projectRoot. Assert `inner.getRepoMap` called exactly once. Assert both results are the same RepoMap object.

3. **watcher_event_updates_entry**: After first call, capture the listener from `watchFn`. Mock `statFn` to return `{ isFile: () => true, size: 42, mtime: new Date("2025-01-01T00:00:00.000Z") }`. Call `listener("change", "new-file.ts")`. Call `getRepoMap` again. Assert cached result includes an entry for `new-file.ts` with `sizeBytes: toBytes(42)`. Assert `inner.getRepoMap` still called only once.

4. **watcher_filename_undefined_invalidates_cache**: After first call, capture listener. Call `listener("change", null)`. Call `getRepoMap` again. Assert `inner.getRepoMap` called twice (cache was invalidated, full scan on second call).

5. **watch_throws_graceful_fallback**: Inject `watchFn` that throws `new Error("EMFILE")`. Call `getRepoMap`. Assert result equals the mock RepoMap. Call `getRepoMap` again. Assert `inner.getRepoMap` called twice (no caching when watcher fails).

6. **watcher_error_event_invalidates_cache**: After first call, capture the error handler registered via `watcher.on("error", handler)`. Call `handler(new Error("watch failure"))`. Call `getRepoMap` again. Assert `inner.getRepoMap` called twice. Assert new `watchFn` call was made (re-watch attempt).

7. **close_stops_all_watchers**: After first call, call `close()`. Assert `watcher.close()` was called. Call `getRepoMap` again. Assert `inner.getRepoMap` called twice (cache cleared).

**Verify:** `pnpm test shared/src/adapters/__tests__/watching-repo-map-supplier.test.ts` passes.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                    | Description                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| first_call_delegates_and_returns             | First getRepoMap delegates to inner; watchFn called to set up watcher.      |
| second_call_same_root_returns_cached         | Second call returns cached RepoMap; inner not called again.                 |
| watcher_event_updates_entry                  | Watcher callback with filename updates the cached FileEntry.                |
| watcher_filename_undefined_invalidates_cache | Watcher callback with null filename invalidates cache; next call re-scans.  |
| watch_throws_graceful_fallback               | watchFn throws; getRepoMap returns result without caching.                  |
| watcher_error_event_invalidates_cache        | Watcher 'error' event invalidates cache; next call re-scans and re-watches. |
| close_stops_all_watchers                     | close() calls watcher.close() and clears cache.                             |

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
- [ ] `pnpm lint:clones` — zero clones (shared extraction prevents duplication)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
