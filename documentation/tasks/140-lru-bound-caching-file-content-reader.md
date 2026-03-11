# Task 140: LRU bound on CachingFileContentReader

> **Status:** Pending
> **Phase:** Z (Memory Bounds)
> **Layer:** adapter
> **Depends on:** —

## Goal

Add a configurable LRU cap to the in-memory cache in `createCachingFileContentReader` so the Map does not grow without bound during long server sessions.

## Architecture Notes

- Adapter layer: implements `FileContentReader`; may import node:fs and node:path (this file is already allowed). No new dependency — Map-based LRU only (do not add `lru-cache` package).
- Map preserves insertion order: delete-then-set on cache hit moves entry to end; evict via `cache.keys().next().value` when size exceeds cap.
- Backward compatible: optional second parameter; all existing call sites remain valid.

## Files

| Action | Path                                                       |
| ------ | ---------------------------------------------------------- |
| Modify | `shared/src/adapters/caching-file-content-reader.ts`        |
| Create | `shared/src/adapters/__tests__/caching-file-content-reader.test.ts` |

## Interface / Signature

```typescript
// Interface (unchanged) — Source: shared/src/core/interfaces/file-content-reader.interface.ts
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";

export interface FileContentReader {
  getContent(path: RelativePath): Promise<string>;
}
```

```typescript
// Factory signature — implement in caching-file-content-reader.ts
export function createCachingFileContentReader(
  projectRoot: AbsolutePath,
  options?: { readonly maxEntries?: number },
): FileContentReader {
  const maxEntries = options?.maxEntries ?? 500;
  const cache = new Map<string, { readonly content: string; readonly mtimeMs: number }>();
  return {
    async getContent(pathRel: RelativePath): Promise<string> {
      const full = path.join(projectRoot, pathRel);
      const stat = await fs.promises.stat(full);
      const mtimeMs = stat.mtimeMs;
      const cached = cache.get(pathRel);
      if (cached !== undefined && cached.mtimeMs === mtimeMs) {
        cache.delete(pathRel);
        cache.set(pathRel, cached);
        return cached.content;
      }
      const content = await fs.promises.readFile(full, "utf8");
      cache.set(pathRel, { content, mtimeMs });
      if (cache.size > maxEntries) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
      }
      return content;
    },
  };
}
```

## Dependent Types

### Tier 2 — path-only

| Type           | Path                              | Factory              |
| -------------- | --------------------------------- | -------------------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts`   | `toAbsolutePath(raw)` |
| `RelativePath` | `shared/src/core/types/paths.ts`   | `toRelativePath(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add LRU cap to createCachingFileContentReader

In `shared/src/adapters/caching-file-content-reader.ts`:

1. Add an optional second parameter `options?: { readonly maxEntries?: number }`. Default `maxEntries` to `500` when omitted (`const maxEntries = options?.maxEntries ?? 500`).
2. In `getContent`, on cache hit (cached entry exists and `cached.mtimeMs === mtimeMs`): before returning, call `cache.delete(pathRel)` then `cache.set(pathRel, cached)` to move the entry to the end of the Map (LRU touch).
3. After each cache miss where you call `cache.set(pathRel, { content, mtimeMs })`, enforce the cap: if `cache.size > maxEntries`, obtain the oldest key with `const firstKey = cache.keys().next().value` and, if `firstKey !== undefined`, call `cache.delete(firstKey)`.

Use the exact API calls: `path.join(projectRoot, pathRel)`, `fs.promises.stat(full)`, `fs.promises.readFile(full, "utf8")`. Keep all existing imports.

**Verify:** File passes `pnpm exec eslint shared/src/adapters/caching-file-content-reader.ts` with zero errors and zero warnings.

### Step 2: Add unit tests

Create `shared/src/adapters/__tests__/caching-file-content-reader.test.ts`.

1. **cache_hit_returns_cached_content:** Mock `fs.promises.stat` and `fs.promises.readFile` using `vi.spyOn`. Create reader with `toAbsolutePath("/tmp")` and default options. Call `getContent(toRelativePath("a.ts"))` twice with the same path; ensure `readFile` is called only once and the second call returns the same content.
2. **cache_miss_reads_file:** Mock `fs.promises.stat` and `fs.promises.readFile` to return known content. Create reader; call `getContent(toRelativePath("b.ts"))`; assert `readFile` was called with the correct full path and the returned value equals the mocked content.
3. **eviction_when_over_cap:** Create reader with `{ maxEntries: 2 }`. Mock `fs.promises.stat` and `fs.promises.readFile` so that three distinct paths `a.ts`, `b.ts`, `c.ts` can be read. Call `getContent` for path A, then B, then C. After the third call, the cache must hold at most 2 entries; the first path (A) must have been evicted, so the next call to `getContent(A)` must trigger a new `readFile`; verify via mock `readFile` call count.
4. **touch_on_hit_moves_to_end:** Create reader with `{ maxEntries: 2 }`. Call `getContent(A)`, `getContent(B)`, then `getContent(A)` again (touch A). Then call `getContent(C)`. The evicted entry must be B (oldest after touch), not A. Assert that a subsequent `getContent(A)` returns from cache (no new read) and `getContent(B)` triggers a new read.

**Verify:** `pnpm test shared/src/adapters/__tests__/caching-file-content-reader.test.ts` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                     | Description                                                                 |
| ----------------------------- | --------------------------------------------------------------------------- |
| cache_hit_returns_cached_content | Second getContent for same path does not call readFile; returns cached content. |
| cache_miss_reads_file        | getContent calls readFile and returns file content.                         |
| eviction_when_over_cap       | With maxEntries 2, after three distinct path reads, oldest entry is evicted.  |
| touch_on_hit_moves_to_end    | Re-reading A before adding C keeps A in cache and evicts B.                |

## Acceptance Criteria

- [ ] `caching-file-content-reader.ts` updated with optional `options` and LRU eviction
- [ ] `__tests__/caching-file-content-reader.test.ts` created with all four test cases
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No new dependencies; no `lru-cache` package
- [ ] Existing call sites unchanged (optional param)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
