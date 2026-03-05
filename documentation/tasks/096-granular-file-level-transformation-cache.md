# Task 096: Granular file-level transformation cache

> **Status:** Pending
> **Phase:** P (Context Quality & Token Efficiency)
> **Layer:** storage
> **Depends on:** —

## Goal

Add a per-file transformation cache store (interface, types, migration, SqliteFileTransformStore) keyed by (file_path, content_hash) so a follow-up task can wire ContentTransformerPipeline and SummarisationLadder to skip unchanged files on recompile.

## Architecture Notes

- ADR-007: UUIDv7 for entity IDs; this store uses composite PK (file_path, content_hash), no UUID.
- ADR-008: Timestamps as ISOTimestamp from Clock; store uses clock.now() for purgeExpired.
- Storage layer: SQL only in shared/src/storage/; no node:fs/node:path in this store (all data in SQLite).
- DIP: Store receives ExecutableDb and Clock via constructor; composition root (create-project-scope) instantiates.
- Approach: SQLite-only storage (no blob files) to avoid fs exemption; single table with composite PK.

## Files

| Action | Path                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| Create | `shared/src/core/types/file-transform-types.ts`                                                              |
| Create | `shared/src/core/interfaces/file-transform-store.interface.ts`                                               |
| Create | `shared/src/storage/migrations/009-file-transform-cache.ts`                                                  |
| Create | `shared/src/storage/sqlite-file-transform-store.ts`                                                          |
| Create | `shared/src/storage/__tests__/sqlite-file-transform-store.test.ts`                                           |
| Modify | `shared/src/storage/create-project-scope.ts` (add fileTransformStore to ProjectScope and createProjectScope) |

## Interface / Signature

```typescript
import type { RelativePath } from "#core/types/paths.js";
import type { CachedFileTransform } from "#core/types/file-transform-types.js";

export interface FileTransformStore {
  get(filePath: RelativePath, contentHash: string): CachedFileTransform | null;
  set(entry: CachedFileTransform): void;
  invalidate(filePath: RelativePath): void;
  purgeExpired(): void;
}
```

```typescript
import type { FileTransformStore } from "#core/interfaces/file-transform-store.interface.js";
import type { CachedFileTransform } from "#core/types/file-transform-types.js";
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";

export class SqliteFileTransformStore implements FileTransformStore {
  constructor(
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}

  get(filePath: RelativePath, contentHash: string): CachedFileTransform | null;
  set(entry: CachedFileTransform): void;
  invalidate(filePath: RelativePath): void;
  purgeExpired(): void;
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface CachedFileTransform {
  readonly filePath: RelativePath;
  readonly contentHash: string;
  readonly transformedContent: string;
  readonly tierOutputs: Readonly<
    Record<InclusionTier, { content: string; tokens: TokenCount }>
  >;
  readonly createdAt: ISOTimestamp;
  readonly expiresAt: ISOTimestamp;
}
```

### Tier 1 — signature + path

| Type           | Path                                                    | Members | Purpose                     |
| -------------- | ------------------------------------------------------- | ------- | --------------------------- |
| `ExecutableDb` | `shared/src/core/interfaces/executable-db.interface.ts` | 2       | exec, prepare               |
| `Clock`        | `shared/src/core/interfaces/clock.interface.ts`         | 3       | now, addMinutes, durationMs |

### Tier 2 — path-only

| Type            | Path                                   | Factory               |
| --------------- | -------------------------------------- | --------------------- |
| `RelativePath`  | `shared/src/core/types/paths.ts`       | `toRelativePath(raw)` |
| `ISOTimestamp`  | `shared/src/core/types/identifiers.ts` | `toISOTimestamp(raw)` |
| `TokenCount`    | `shared/src/core/types/units.ts`       | `toTokenCount(n)`     |
| `InclusionTier` | `shared/src/core/types/enums.ts`       | `INCLUSION_TIER`      |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create CachedFileTransform type

Create `shared/src/core/types/file-transform-types.ts` with the CachedFileTransform interface (Tier 0 block above). Use named imports from `#core/types/paths.js`, `#core/types/units.js`, `#core/types/identifiers.js`, `#core/types/enums.js`.

**Verify:** File exists; `pnpm typecheck` in shared passes.

### Step 2: Create FileTransformStore interface

Create `shared/src/core/interfaces/file-transform-store.interface.ts` with the FileTransformStore interface (first code block under Interface / Signature). Import `RelativePath` and `CachedFileTransform` with `import type`.

**Verify:** File exists; `pnpm typecheck` in shared passes.

### Step 3: Create migration 009

Create `shared/src/storage/migrations/009-file-transform-cache.ts`. Export `migration: Migration` with `id: "009-file-transform-cache"`. In `up(db)`: run DDL for table `file_transform_cache` with columns `file_path` (TEXT NOT NULL), `content_hash` (TEXT NOT NULL), `transformed_content` (TEXT NOT NULL), `tier_outputs_json` (TEXT NOT NULL), `created_at` (TEXT NOT NULL), `expires_at` (TEXT NOT NULL), PRIMARY KEY (file_path, content_hash). Create index `idx_file_transform_cache_expires_at` on `expires_at`. In `down(db)`: DROP TABLE IF EXISTS file_transform_cache.

**Verify:** Migration file exists; `pnpm typecheck` passes.

### Step 4: Implement get and set in SqliteFileTransformStore

Create `shared/src/storage/sqlite-file-transform-store.ts`. Class implements FileTransformStore; constructor(db: ExecutableDb, clock: Clock). Implement get(filePath, contentHash): SELECT row where file_path = ? AND content_hash = ? AND expires_at > clock.now(); if no row return null; parse tier_outputs_json (JSON.parse) and map tokens with toTokenCount; return CachedFileTransform with toISOTimestamp for created_at and expires_at. Implement set(entry): serialize tierOutputs to JSON (tokens as number); INSERT OR REPLACE into file_transform_cache with entry.filePath, entry.contentHash, transformed_content, tier_outputs_json, isoToSqliteDatetime(entry.createdAt), isoToSqliteDatetime(entry.expiresAt). Use SQLite TEXT for timestamps in YYYY-MM-DD HH:MM:SS format (same as cache_metadata). Add two helper functions in the same file: isoToSqliteDatetime(iso: string) returning string (slice 0–19, replace "T" with " ") and sqliteDatetimeToIso(sqlite: string) returning ISOTimestamp (reverse conversion).

**Verify:** `pnpm typecheck` and `pnpm lint` pass. Store file has no imports of node:fs or node:path.

### Step 5: Implement invalidate and purgeExpired

In `shared/src/storage/sqlite-file-transform-store.ts`: invalidate(filePath): DELETE FROM file_transform_cache WHERE file_path = ?. purgeExpired(): const nowSql = isoToSqliteDatetime(clock.now()); DELETE FROM file_transform_cache WHERE expires_at <= ? with nowSql.

**Verify:** `pnpm typecheck` and `pnpm lint` pass.

### Step 6: Add fileTransformStore to ProjectScope

In `shared/src/storage/create-project-scope.ts`: add `import type { FileTransformStore } from "#core/interfaces/file-transform-store.interface.js"` and `import { SqliteFileTransformStore } from "#storage/sqlite-file-transform-store.js"`. Add `readonly fileTransformStore: FileTransformStore` to the ProjectScope interface. In createProjectScope, after sessionTracker add `const fileTransformStore = new SqliteFileTransformStore(db, clock)` and add fileTransformStore to the returned object.

**Verify:** `pnpm typecheck` passes. ProjectScope type includes fileTransformStore.

### Step 7: Tests

Create `shared/src/storage/__tests__/sqlite-file-transform-store.test.ts`. Use in-memory Database (":memory:"), run migration 009 only (or 001 + 009 if MigrationRunner is used; for unit test, run 009.up(db) only). Mock Clock with deterministic now(). Implement: get_empty_returns_null (get any path/hash returns null). set_then_get_returns_entry (build CachedFileTransform with toRelativePath, toTokenCount, toISOTimestamp, INCLUSION_TIER keys for tierOutputs; set then get; assert returned entry matches). get_expired_returns_null (set entry with expiresAt in the past, get returns null). invalidate_removes_by_path (set two entries same path different contentHash, invalidate(path), both get return null). purgeExpired_removes_expired_only (set two entries, mock clock so one expires_at is past and one future; purgeExpired(); get for non-expired returns entry, get for expired returns null). set_idempotent (set same entry twice, get returns last written). empty_result_set (call purgeExpired when table empty; call get with no matching row; no throw, get returns null).

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-file-transform-store.test.ts` passes.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                         | Description                                                    |
| --------------------------------- | -------------------------------------------------------------- |
| get_empty_returns_null            | No data; get returns null.                                     |
| set_then_get_returns_entry        | set then get returns equivalent CachedFileTransform.           |
| get_expired_returns_null          | Entry with expires_at in past; get returns null.               |
| invalidate_removes_by_path        | Two entries same path; invalidate(path); both get null.        |
| purgeExpired_removes_expired_only | One expired one not; purgeExpired(); only non-expired remains. |
| set_idempotent                    | set same key twice; get returns last written.                  |
| empty_result_set                  | purgeExpired on empty table and get miss do not throw.         |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in new storage file
- [ ] No `let` in production code (only `const`)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
