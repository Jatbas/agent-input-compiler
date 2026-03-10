# Task 123: W03 Stable project ID

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** storage + mcp
> **Depends on:** W02 (Schema migration 011)

## Goal

Persist a stable UUIDv7 per project in `{projectRoot}/.aic/project-id`, register and sync it with the global `projects` table on every `aic_compile`, and handle folder renames by updating `project_root` in `projects` and all eight per-project tables.

## Architecture Notes

- ADR-007: project_id is UUIDv7; ADR-008: timestamps from Clock (ISOTimestamp). All paths written to DB use `ProjectRootNormaliser.normalise` (cross-platform).
- Storage: SQL only in `shared/src/storage/`. Project-id file I/O in `project-id-file.ts` with ESLint exemption (same as ensure-aic-dir). Sync orchestration in `sync-project-with-db.ts` takes interfaces only.
- MCP: ensureProjectInit gains `idGenerator`; compile handler normalises projectRoot then calls ensureProjectInit and syncProject. runInit creates IdGenerator and passes it to ensureProjectInit.
- Design: ProjectStore interface + SqliteProjectStore; project-id-file read/write; syncProject(projectRoot, store, clock, idGenerator, normaliser) in storage; handler stays thin.

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/core/interfaces/project-store.interface.ts` |
| Create | `shared/src/storage/project-id-file.ts` |
| Create | `shared/src/storage/sqlite-project-store.ts` |
| Create | `shared/src/storage/sync-project-with-db.ts` |
| Create | `shared/src/storage/__tests__/sqlite-project-store.test.ts` |
| Create | `shared/src/storage/__tests__/sync-project-with-db.test.ts` |
| Modify | `shared/src/storage/create-project-scope.ts` (add projectStore to scope) |
| Modify | `mcp/src/init-project.ts` (ensureProjectInit(projectRoot, idGenerator); runInit passes idGenerator) |
| Modify | `mcp/src/handlers/compile-handler.ts` (normalise root, syncProject, ensureProjectInit with idGenerator) |
| Modify | `mcp/src/server.ts` (NodePathAdapter, pass projectStore and normaliser to handler; runInit with idGenerator) |
| Modify | `eslint.config.mjs` (add project-id-file.ts to storage node:fs exemption) |
| Modify | `mcp/src/__tests__/init-project.test.ts` (ensureProjectInit(projectRoot, idGenerator)) |

## Interface / Signature

```typescript
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";

export interface ProjectStore {
  getByProjectId(projectId: UUIDv7): { projectRoot: AbsolutePath } | null;
  insert(
    projectId: UUIDv7,
    projectRoot: AbsolutePath,
    createdAt: ISOTimestamp,
    lastSeenAt: ISOTimestamp,
  ): void;
  updateLastSeen(projectId: UUIDv7, lastSeenAt: ISOTimestamp): void;
  updateProjectRootInAllTables(
    oldRoot: AbsolutePath,
    newRoot: AbsolutePath,
  ): void;
}
```

```typescript
export class SqliteProjectStore implements ProjectStore {
  constructor(
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}
  getByProjectId(projectId: UUIDv7): { projectRoot: AbsolutePath } | null;
  insert(
    projectId: UUIDv7,
    projectRoot: AbsolutePath,
    createdAt: ISOTimestamp,
    lastSeenAt: ISOTimestamp,
  ): void;
  updateLastSeen(projectId: UUIDv7, lastSeenAt: ISOTimestamp): void;
  updateProjectRootInAllTables(
    oldRoot: AbsolutePath,
    newRoot: AbsolutePath,
  ): void;
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
export interface ExecutableDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): void;
    all(...args: unknown[]): unknown[];
  };
}
```

```typescript
export interface Clock {
  now(): ISOTimestamp;
  addMinutes(minutes: number): ISOTimestamp;
  durationMs(start: ISOTimestamp, end: ISOTimestamp): Milliseconds;
}
```

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `IdGenerator` | `shared/src/core/interfaces/id-generator.interface.ts` | 1 | generate(): UUIDv7 |
| `ProjectRootNormaliser` | `shared/src/core/interfaces/project-root-normaliser.interface.ts` | 1 | normalise(raw: string): AbsolutePath |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts` | `toAbsolutePath(raw)` |
| `UUIDv7` | `shared/src/core/types/identifiers.ts` | `toUUIDv7(raw)` |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | from `Clock.now()` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** Add `"shared/src/storage/project-id-file.ts"` to the `files` array in the block that allows node:fs for ensure-aic-dir and create-project-scope (the block starting at the comment "Storage: ensure-aic-dir and create-project-scope may use node:fs/node:path").

## Steps

### Step 1: ProjectStore interface

Create `shared/src/core/interfaces/project-store.interface.ts` with the ProjectStore interface and imports from `#core` paths (AbsolutePath, ISOTimestamp, UUIDv7 from identifiers and paths).

**Verify:** `pnpm typecheck` passes.

### Step 2: project-id file read/write

Create `shared/src/storage/project-id-file.ts`. Export `readProjectId(projectRoot: AbsolutePath): UUIDv7 | null`: path `path.join(projectRoot, ".aic", "project-id")`; if file does not exist return null; else `fs.readFileSync(filePath, "utf8").trim()` and return `toUUIDv7(trimmed)`. Export `writeProjectId(projectRoot: AbsolutePath, id: UUIDv7): void`: same path, `fs.writeFileSync(filePath, id, "utf8")`. Use `node:fs` and `node:path`; ensure parent directory exists (caller ensures via ensureAicDir). Use named imports.

**Verify:** `pnpm lint` and `pnpm typecheck` pass.

### Step 3: SqliteProjectStore getByProjectId and insert

Create `shared/src/storage/sqlite-project-store.ts`. Class `SqliteProjectStore` implements `ProjectStore`, constructor `(db: ExecutableDb, clock: Clock)`. Implement `getByProjectId(projectId: UUIDv7)`: `db.prepare("SELECT project_root FROM projects WHERE project_id = ?").get(projectId)`; if no row return null; else return `{ projectRoot: toAbsolutePath(row.project_root as string) }`. Implement `insert(projectId, projectRoot, createdAt, lastSeenAt)`: `db.prepare("INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)").run(projectId, projectRoot, createdAt, lastSeenAt)` (pass string values for path and timestamps).

**Verify:** `pnpm typecheck` passes.

### Step 4: SqliteProjectStore updateLastSeen and updateProjectRootInAllTables

In `shared/src/storage/sqlite-project-store.ts` add `updateLastSeen(projectId: UUIDv7, lastSeenAt: ISOTimestamp): void`: `db.prepare("UPDATE projects SET last_seen_at = ? WHERE project_id = ?").run(lastSeenAt, projectId)`. Add `updateProjectRootInAllTables(oldRoot: AbsolutePath, newRoot: AbsolutePath): void`: run `db.prepare("UPDATE projects SET project_root = ? WHERE project_root = ?").run(newRoot, oldRoot)`; then for each table name in the list `compilation_log`, `cache_metadata`, `guard_findings`, `tool_invocation_log`, `session_state`, `file_transform_cache`, `config_history`, `telemetry_events` run `db.prepare("UPDATE " + table + " SET project_root = ? WHERE project_root = ?").run(newRoot, oldRoot)` (use a readonly array of the eight names and a single loop).

**Verify:** `pnpm typecheck` passes.

### Step 5: sync-project-with-db

Create `shared/src/storage/sync-project-with-db.ts`. Export function `syncProject(projectRoot: AbsolutePath, store: ProjectStore, clock: Clock, idGenerator: IdGenerator, normaliser: ProjectRootNormaliser): void`. Normalise: `const normalisedRoot = normaliser.normalise(projectRoot as string)`. Call `readProjectId(projectRoot)`. If null: `const id = idGenerator.generate()`; `writeProjectId(projectRoot, id)`; `store.insert(id, normalisedRoot, clock.now(), clock.now())`; return. If present (id): `const row = store.getByProjectId(id)`. If row is null: `store.insert(id, normalisedRoot, clock.now(), clock.now())`; return. If row.projectRoot === normalisedRoot: `store.updateLastSeen(id, clock.now())`; return. Else (different root, rename): `store.updateProjectRootInAllTables(row.projectRoot, normalisedRoot)`; `store.updateLastSeen(id, clock.now())`. Import readProjectId and writeProjectId from project-id-file.

**Verify:** `pnpm typecheck` passes.

### Step 6: Add projectStore to createProjectScope

In `shared/src/storage/create-project-scope.ts` import SqliteProjectStore. After opening the db and creating clock, construct `const projectStore = new SqliteProjectStore(db, clock)`. Add `projectStore` to the returned object (and to the ProjectScope interface in the same file so the return type includes `readonly projectStore: ProjectStore`).

**Verify:** `pnpm typecheck` passes.

### Step 7: ensureProjectInit(projectRoot, idGenerator) and runInit

In `mcp/src/init-project.ts` add parameter `idGenerator: IdGenerator` to `ensureProjectInit(projectRoot: AbsolutePath, idGenerator: IdGenerator): void`. Import readProjectId and writeProjectId from `@jatbas/aic-core/storage/project-id-file.js`. After `ensureAicDir(projectRoot)`, if `readProjectId(projectRoot) === null` then call `writeProjectId(projectRoot, idGenerator.generate())`. Leave the rest of ensureProjectInit unchanged (config, prettierignore, etc.). In `runInit(projectRoot)` create `const idGenerator = new UuidV7Generator(new SystemClock())` (import from shared adapters) and call `ensureProjectInit(projectRoot, idGenerator)` instead of `ensureProjectInit(projectRoot)`.

**Verify:** `pnpm typecheck` passes.

### Step 8: Compile handler normalise, ensureProjectInit, syncProject

In `mcp/src/handlers/compile-handler.ts` add to `createCompileHandler` parameters: `projectStore: ProjectStore`, `projectRootNormaliser: ProjectRootNormaliser`. In the handler implementation, immediately after `const projectRoot = validateProjectRoot(args.projectRoot)` set `const normalisedRoot = projectRootNormaliser.normalise(projectRoot)`. Call `ensureProjectInit(normalisedRoot, idGenerator)`. Call `syncProject(normalisedRoot, projectStore, clock, idGenerator, projectRootNormaliser)` (import syncProject from storage). Use `normalisedRoot` (not projectRoot) for building the CompilationRequest and all subsequent uses of the project path in the handler.

**Verify:** `pnpm typecheck` passes.

### Step 9: Wire projectStore and normaliser in server

In `mcp/src/server.ts` import NodePathAdapter from shared adapters. At the start of `createMcpServer` (after creating scope) create `const projectRootNormaliser = new NodePathAdapter()`. Pass `scope.projectStore` and `projectRootNormaliser` to `createCompileHandler` as the new arguments in the order the function signature expects (after toolInvocationLogStore, before clock). Ensure runInit is only called from the CLI path; it already receives projectRoot and now creates idGenerator internally (no change to runInit call site).

**Verify:** `pnpm typecheck` passes.

### Step 10: ESLint exemption for project-id-file

In `eslint.config.mjs` locate the block with comment "Storage: ensure-aic-dir and create-project-scope may use node:fs/node:path". Add `"shared/src/storage/project-id-file.ts"` to the `files` array of that block.

**Verify:** `pnpm lint` passes and project-id-file.ts is not reported for node:fs.

### Step 11: SqliteProjectStore tests

Create `shared/src/storage/__tests__/sqlite-project-store.test.ts`. Use in-memory db, run migration 011 before tests. Create store with `new SqliteProjectStore(db, clock)` using a stub Clock that returns fixed timestamps. Tests: `getByProjectId_missing_returns_null` — no insert, getByProjectId(uuid) returns null. `getByProjectId_present_returns_projectRoot` — insert one row via store.insert, getByProjectId returns `{ projectRoot }` matching inserted path. `insert_persists_row` — insert then getByProjectId returns the row. `updateLastSeen_updates_timestamp` — insert, updateLastSeen with new timestamp, query projects table and assert last_seen_at matches. `updateProjectRootInAllTables_updates_projects_and_eight_tables` — insert project row, insert one row into compilation_log with project_root set to old path, call updateProjectRootInAllTables(oldPath, newPath), assert projects has new path and compilation_log row has new path.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-project-store.test.ts` passes.

### Step 12: sync-project-with-db tests

Create `shared/src/storage/__tests__/sync-project-with-db.test.ts`. Use a temp directory for projectRoot and the real project-id-file and fs for file I/O. Use a mock ProjectStore that records calls to insert, updateLastSeen, and updateProjectRootInAllTables so tests can assert which were invoked. Use stub Clock and IdGenerator that return fixed values. Tests: `syncProject_missing_file_generates_writes_inserts` — do not create .aic/project-id so readProjectId returns null; use stub idGenerator.generate returning a fixed UUID; call syncProject; assert writeProjectId was called with that UUID and store.insert was called with same id and normalised root. `syncProject_file_present_matching_root_updates_last_seen` — write a fixed UUID to .aic/project-id; configure mock store.getByProjectId to return `{ projectRoot: normalisedRoot }`; call syncProject; assert store.updateLastSeen called and updateProjectRootInAllTables not called. `syncProject_file_present_different_root_calls_updateProjectRootInAllTables` — write a fixed UUID to .aic/project-id; configure mock store.getByProjectId to return `{ projectRoot: otherPath }`; call syncProject; assert store.updateProjectRootInAllTables(otherPath, normalisedRoot) and updateLastSeen called. `syncProject_file_present_not_in_db_inserts` — write a fixed UUID to .aic/project-id; configure mock store.getByProjectId to return null; call syncProject; assert store.insert called.

**Verify:** `pnpm test shared/src/storage/__tests__/sync-project-with-db.test.ts` passes.

### Step 13: init-project.test.ts update

In `mcp/src/__tests__/init-project.test.ts` update every call to `ensureProjectInit(projectRoot)` to `ensureProjectInit(projectRoot, idGenerator)`. Create an IdGenerator for tests using `new UuidV7Generator(stubClock)` with a stub Clock that returns fixed timestamps so project-id and store timestamps are deterministic. Update `runInit(projectRoot)` calls to remain as-is (runInit still takes one argument). Add test `ensureProjectInit_creates_project_id_file_when_missing`: ensureProjectInit(projectRoot, idGenerator) on fresh dir, assert `.aic/project-id` exists and file content is a UUID string. Add test `ensureProjectInit_leaves_project_id_unchanged_when_present`: write a known UUID string to `.aic/project-id`, ensureProjectInit(projectRoot, idGenerator), assert file content unchanged.

**Verify:** `pnpm test mcp/src/__tests__/init-project.test.ts` passes.

### Step 14: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| getByProjectId_missing_returns_null | No row for projectId; getByProjectId returns null |
| getByProjectId_present_returns_projectRoot | Insert row; getByProjectId returns matching projectRoot |
| insert_persists_row | Insert then getByProjectId returns the row |
| updateLastSeen_updates_timestamp | Insert, updateLastSeen; last_seen_at in DB matches |
| updateProjectRootInAllTables_updates_projects_and_eight_tables | Rename updates projects and compilation_log project_root |
| syncProject_missing_file_generates_writes_inserts | File missing: writeProjectId and store.insert called |
| syncProject_file_present_matching_root_updates_last_seen | Matching root: updateLastSeen called only |
| syncProject_file_present_different_root_calls_updateProjectRootInAllTables | Different root: updateProjectRootInAllTables and updateLastSeen |
| syncProject_file_present_not_in_db_inserts | Id in file not in DB: store.insert called |
| ensureProjectInit_creates_project_id_file_when_missing | First run creates .aic/project-id with UUID |
| ensureProjectInit_leaves_project_id_unchanged_when_present | Existing .aic/project-id left unchanged |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] ProjectStore interface matches SqliteProjectStore signature exactly
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
