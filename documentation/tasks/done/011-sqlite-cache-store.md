# Task 011: SqliteCacheStore

> **Status:** Done
> **Phase:** E (Storage)
> **Layer:** storage
> **Depends on:** Phase A (MigrationRunner, 001-initial-schema), Phase B (CacheStore, CachedCompilation)

## Goal

Implement CacheStore using SQLite (cache_metadata table) and a cache directory for prompt blobs: metadata in DB, compiled prompt content in JSON files keyed by cache_key, so the pipeline can read/write compilation cache without touching SQL or files directly.

## Architecture Notes

- All SQL in shared/src/storage/ only. CacheStore interface in core; this is the only implementation in MVP. ADR-007/ADR-008: timestamps as ISOTimestamp; no UUIDv7 for cache_key (key is content-derived).
- Project plan: cache_metadata holds cache_key, file_path, file_tree_hash, created_at, expires_at; the JSON file holds the actual prompt content. set() writes a JSON file (compiledPrompt, tokenCount, configHash) under cacheDir using a safe filename derived from entry.key and INSERTs/REPLACEs a row with file_path pointing to that file; get() SELECTs by key and reads the file; invalidate() DELETE row and deletes the blob file; invalidateAll() SELECTs all file_path from cache_metadata, unlinks each file, then DELETE FROM cache_metadata.
- Storage receives db via constructor; no database constructor inside storage (DIP). SqliteCacheStore(db: ExecutableDb, cacheDir: AbsolutePath). No Clock — set(entry) receives CachedCompilation with createdAt/expiresAt already set; use entry timestamps only for expiry in get().

## Files

| Action | Path                                                                            |
| ------ | ------------------------------------------------------------------------------- |
| Create | `shared/src/storage/sqlite-cache-store.ts`                                      |
| Create | `shared/src/storage/__tests__/sqlite-cache-store.test.ts`                       |
| Modify | `eslint.config.mjs` (allow node:fs and node:path in sqlite-cache-store.ts only) |

## Interface / Signature

Implement the existing CacheStore interface:

```typescript
// From shared/src/core/interfaces/cache-store.interface.ts
import type { CachedCompilation } from "#core/types/compilation-types.js";

export interface CacheStore {
  get(key: string): CachedCompilation | null;
  set(entry: CachedCompilation): void;
  invalidate(key: string): void;
  invalidateAll(): void;
}
```

```typescript
// shared/src/storage/sqlite-cache-store.ts
import type { AbsolutePath } from "#core/types/paths.js";
import type { CacheStore } from "#core/interfaces/cache-store.interface.js";
import type { CachedCompilation } from "#core/types/compilation-types.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";

export class SqliteCacheStore implements CacheStore {
  constructor(
    private readonly db: ExecutableDb,
    private readonly cacheDir: AbsolutePath,
  ) {}
  get(key: string): CachedCompilation | null;
  set(entry: CachedCompilation): void;
  invalidate(key: string): void;
  invalidateAll(): void;
}
```

- set(entry): serialize compiledPrompt, tokenCount, configHash to a JSON file under cacheDir using a safe filename derived from entry.key; INSERT or REPLACE into cache_metadata (cache_key, file_path, file_tree_hash, created_at, expires_at) using entry.key, the file path, entry.fileTreeHash, entry.createdAt, entry.expiresAt.
- get(key): SELECT cache_key, file_path, file_tree_hash, created_at, expires_at WHERE cache_key = ? AND expires_at > datetime('now'); if no row, return null (do not delete file or row on miss); else read file, parse JSON, build CachedCompilation and return.
- invalidate(key): SELECT file_path FROM cache_metadata WHERE cache_key = ?; DELETE FROM cache_metadata WHERE cache_key = ?; unlink the blob file at the stored file_path if it exists.
- invalidateAll(): SELECT file_path FROM cache_metadata; unlink each file; then DELETE FROM cache_metadata.
- Use ExecutableDb.prepare().run() and .all(); no raw SQL outside this file. Path operations for cacheDir only in this file; Node `node:path` and `node:fs` are required for cache blob I/O and are allowed only in this file (see Config Changes).

## Dependent Types

```typescript
// CachedCompilation (from #core/types/compilation-types.js)
import type { TokenCount } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface CachedCompilation {
  readonly key: string;
  readonly compiledPrompt: string;
  readonly tokenCount: TokenCount;
  readonly createdAt: ISOTimestamp;
  readonly expiresAt: ISOTimestamp;
  readonly fileTreeHash: string;
  readonly configHash: string;
}
```

```typescript
// ExecutableDb (from #core/interfaces/executable-db.interface.ts)
export interface ExecutableDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): void;
    all(...args: unknown[]): unknown[];
  };
}
```

## Config Changes

- **package.json:** None.
- **eslint.config.mjs:** Add the following block after the storage block (after the closing `},` of the block that has `files: ["shared/src/storage/**/*.ts"]`). This allows only `sqlite-cache-store.ts` to import `node:fs` and `node:path`; all other storage rules (crypto, zod, tiktoken, fast-glob, ignore, patterns) still apply.

```javascript
  // ─── SqliteCacheStore: allow node:fs and node:path for cache blob I/O ───
  {
    files: ["shared/src/storage/sqlite-cache-store.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "node:crypto",
              message: "Use a Hasher interface. Crypto is wrapped in adapters/.",
            },
            {
              name: "crypto",
              message: "Use a Hasher interface. Crypto is wrapped in adapters/.",
            },
            {
              name: "zod",
              message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009.",
            },
            {
              name: "tiktoken",
              message:
                "Use the Tokenizer interface. External libs are wrapped in adapters/.",
            },
            {
              name: "fast-glob",
              message:
                "Use the GlobProvider interface. External libs are wrapped in adapters/.",
            },
            {
              name: "ignore",
              message:
                "Use the IgnoreProvider interface. External libs are wrapped in adapters/.",
            },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            {
              group: ["**/pipeline/**"],
              message: "Storage must not import pipeline code.",
            },
            {
              group: ["**/adapters/**"],
              message: "Storage must not import adapters.",
            },
            {
              group: ["@aic/cli", "@aic/cli/*", "**/cli/**"],
              message: "Storage must not import CLI code.",
            },
            {
              group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"],
              message: "Storage must not import MCP code.",
            },
          ],
        },
      ],
    },
  },
```

`BAN_RELATIVE_PARENT` is defined at the top of eslint.config.mjs; the patterns array must match the storage block's patterns exactly.

## Steps

### Step 1: Add ESLint override for sqlite-cache-store

In `eslint.config.mjs`, add a block after the storage block as specified in Config Changes: only `shared/src/storage/sqlite-cache-store.ts` may import `node:fs` and `node:path`; omit those path entries in that file's override.

**Verify:** `pnpm lint` passes.

### Step 2: Implement set and get

Create `shared/src/storage/sqlite-cache-store.ts`. Implement set and get. set(entry): write a JSON file under cacheDir using a safe filename derived from entry.key containing compiledPrompt, tokenCount, configHash; INSERT or REPLACE into cache_metadata (cache_key, file_path, file_tree_hash, created_at, expires_at). get(key): SELECT with `WHERE cache_key = ? AND expires_at > datetime('now')` so SQLite handles expiry; if no row, return null (do not delete file or row on miss); else read file at file_path, parse JSON, build and return CachedCompilation. No Clock injection needed — expiry is handled in SQL.

**Verify:** `pnpm typecheck` passes.

### Step 3: Implement invalidate and invalidateAll

In the same file, implement invalidate and invalidateAll. invalidate(key): SELECT file_path FROM cache_metadata WHERE cache_key = ?; DELETE FROM cache_metadata WHERE cache_key = ?; then unlink the blob file at the stored file_path if it exists. invalidateAll(): SELECT file_path FROM cache_metadata; unlink each file; then DELETE FROM cache_metadata.

**Verify:** `pnpm typecheck` still passes.

### Step 4: Unit tests

Create `shared/src/storage/__tests__/sqlite-cache-store.test.ts`. Use a real ExecutableDb from better-sqlite3 (e.g. `new Database(":memory:")`), run the initial migration, and a temp dir passed as AbsolutePath (e.g. via `toAbsolutePath`) for cacheDir. Test: set then get returns same CachedCompilation; get missing key returns null; invalidate removes entry and get returns null; invalidateAll clears all; expiry — get returns null when expires_at is in the past; get when blob missing — when a row exists but the blob file is missing, get returns null; get when blob corrupt — when a row exists and the blob file exists but JSON is invalid, get returns null.

**Verify:** `pnpm test -- shared/src/storage/__tests__/sqlite-cache-store.test.ts` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

## Tests

| Test case             | Description                                                               |
| --------------------- | ------------------------------------------------------------------------- |
| set then get          | Same entry returned                                                       |
| get missing           | Returns null                                                              |
| invalidate            | Entry removed, get returns null                                           |
| invalidateAll         | All entries removed                                                       |
| expiry                | get returns null when expires_at in past                                  |
| get when blob missing | get returns null when row exists but blob file is missing                 |
| get when blob corrupt | get returns null when row exists and blob file exists but JSON is invalid |

## Acceptance Criteria

- [ ] SqliteCacheStore implements CacheStore; constructor(db, cacheDir) with cacheDir: AbsolutePath
- [ ] All SQL in this file only; no SQL in pipeline/adapters
- [ ] All test cases pass
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] No Date.now()/new Date(); use entry timestamps only
- [ ] Single-line comments only

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section to this file with:
   - What you tried
   - What went wrong
   - What decision you need from the user
3. Report to the user and wait for guidance
