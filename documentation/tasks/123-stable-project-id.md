# Task 123: Stable project ID (W03)

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** storage + mcp
> **Depends on:** W02 (Schema migration 011)

## Goal

Generate and persist a UUIDv7 project ID in `{projectRoot}/.aic/project-id`, reconcile it with the `projects` table on every compile, and handle folder renames by updating `project_root` in `projects` and all eight per-project tables.

## Architecture Notes

- ADR-007: UUIDv7 for project_id. ADR-008: timestamps from Clock (ISOTimestamp).
- Storage: new module `ensure-project-id.ts` uses node:fs/node:path for .aic/project-id file; add to existing storage allowlist (with ensure-aic-dir, create-project-scope). All SQL in storage; ExecutableDb has .run() and .all() only — use .prepare(sql).all(args)[0] for single-row SELECT.
- No new store interface; single exported function `reconcileProjectId` plus internal helpers. ProjectScope gains `normaliser`; createProjectScope and compile handler receive and pass it. Chosen approach: one new storage module + wiring in mcp (simplest correct path).

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/storage/ensure-project-id.ts` |
| Create | `shared/src/storage/__tests__/ensure-project-id.test.ts` |
| Modify | `eslint.config.mjs` (add ensure-project-id.ts to storage node:fs/node:path allowlist) |
| Modify | `mcp/src/init-project.ts` (ensureProjectInit optional clock, idGenerator; ensure .aic/project-id when both provided) |
| Modify | `shared/src/storage/create-project-scope.ts` (ProjectScope.normaliser, createProjectScope(projectRoot, normaliser), call reconcileProjectId at end) |
| Modify | `mcp/src/handlers/compile-handler.ts` (createCompileHandler getScope param; ensureProjectInit with scope.clock/scope.idGenerator; call reconcileProjectId) |
| Modify | `mcp/src/server.ts` (NodePathAdapter, pass to createProjectScope; pass getScope to createCompileHandler) |

## Interface / Signature

Interfaces used by ensure-project-id (no new interface; reuse existing):

```typescript
// ProjectRootNormaliser — shared/src/core/interfaces/project-root-normaliser.interface.ts
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

export interface ProjectRootNormaliser {
  normalise(raw: string): AbsolutePath;
}
```

```typescript
// ExecutableDb — shared/src/core/interfaces/executable-db.interface.ts
export interface ExecutableDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): void;
    all(...args: unknown[]): unknown[];
  };
}
```

Exported function (sync; no class):

```typescript
export const PROJECT_ID_FILENAME = "project-id";

export function reconcileProjectId(
  projectRoot: AbsolutePath,
  db: ExecutableDb,
  clock: Clock,
  idGenerator: IdGenerator,
  normaliser: ProjectRootNormaliser,
): void;
```

## Dependent Types

### Tier 0 — verbatim

None; the function uses interfaces and branded types from Tier 1/Tier 2.

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `Clock` | `shared/src/core/interfaces/clock.interface.ts` | now, addMinutes, durationMs | created_at, last_seen_at |
| `IdGenerator` | `shared/src/core/interfaces/id-generator.interface.ts` | generate | UUIDv7 for project_id |
| `ExecutableDb` | `shared/src/core/interfaces/executable-db.interface.ts` | exec, prepare (run, all) | projects table |
| `ProjectRootNormaliser` | `shared/src/core/interfaces/project-root-normaliser.interface.ts` | normalise | normalise projectRoot for DB |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts` | `toAbsolutePath(value)` |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | from `clock.now()` |

## Config Changes

- **package.json:** None.
- **eslint.config.mjs:** Add `shared/src/storage/ensure-project-id.ts` to the existing storage allowlist block that already includes `ensure-aic-dir.ts` and `create-project-scope.ts` (same `files` array).

## Steps

### Step 1: Create ensure-project-id.ts

Create `shared/src/storage/ensure-project-id.ts`. Export constant `PROJECT_ID_FILENAME = "project-id"`. Export function `reconcileProjectId(projectRoot: AbsolutePath, db: ExecutableDb, clock: Clock, idGenerator: IdGenerator, normaliser: ProjectRootNormaliser): void`. Implement: (1) path to file: `path.join(projectRoot, ".aic", PROJECT_ID_FILENAME)`. (2) If `!fs.existsSync(filePath)`: call `ensureAicDir(projectRoot)`, generate UUID with `idGenerator.generate()`, write UUID to file with `fs.writeFileSync(filePath, uuid, "utf8")`, insert into projects with `db.prepare("INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)").run(projectId, normaliser.normalise(projectRoot), clock.now(), clock.now())`. (3) If file exists: read with `fs.readFileSync(filePath, "utf8")`, trim to get projectId; `const row = db.prepare("SELECT project_root FROM projects WHERE project_id = ?").all(projectId)[0]`; if no row, insert (same as above); if row and row.project_root === normaliser.normalise(projectRoot), run `db.prepare("UPDATE projects SET last_seen_at = ? WHERE project_id = ?").run(clock.now(), projectId)`; if row and row.project_root !== normalised, run UPDATE projects SET project_root = ?, last_seen_at = ? WHERE project_id = ?, then for each table in [compilation_log, cache_metadata, tool_invocation_log, session_state, file_transform_cache, config_history, telemetry_events, guard_findings] run `db.prepare("UPDATE <table> SET project_root = ? WHERE project_root = ?").run(newRoot, oldRoot)`. Use sync fs and path only. Do not use ExecutableDb .get() — use .all(...)[0].

**Verify:** File exists; export reconcileProjectId and PROJECT_ID_FILENAME; no imports from adapters or mcp.

### Step 2: Add ensure-project-id.ts to ESLint allowlist

In `eslint.config.mjs`, locate the block with `files: ["shared/src/storage/ensure-aic-dir.ts", "shared/src/storage/create-project-scope.ts"]`. Add `"shared/src/storage/ensure-project-id.ts"` to that array.

**Verify:** `pnpm lint` with no new errors for ensure-project-id.ts.

### Step 3: ensureProjectInit optional clock and idGenerator

In `mcp/src/init-project.ts`, add optional parameters `clock?: Clock` and `idGenerator?: IdGenerator` to `ensureProjectInit`. Import `PROJECT_ID_FILENAME` from `@jatbas/aic-core/storage/ensure-project-id.js`. After `ensureAicDir(projectRoot)`, when both clock and idGenerator are defined: set `projectIdPath = path.join(projectRoot, ".aic", PROJECT_ID_FILENAME)`. If `!fs.existsSync(projectIdPath)`, call `idGenerator.generate()`, then `fs.writeFileSync(projectIdPath, uuid, "utf8")`. Leave `runInit` unchanged (it continues to call `ensureProjectInit(projectRoot)` with no extra args).

**Verify:** ensureProjectInit signature has optional clock and idGenerator; runInit still calls ensureProjectInit(projectRoot) only.

### Step 4: ProjectScope.normaliser and createProjectScope(projectRoot, normaliser)

In `shared/src/storage/create-project-scope.ts`, add `normaliser: ProjectRootNormaliser` to the `ProjectScope` interface and to the object returned by `createProjectScope`. Change `createProjectScope(projectRoot: AbsolutePath)` to `createProjectScope(projectRoot: AbsolutePath, normaliser: ProjectRootNormaliser)`. Import `reconcileProjectId` from `ensure-project-id.js`. At the end of `createProjectScope`, before the return statement, call `reconcileProjectId(projectRoot, db, clock, idGenerator, normaliser)`. Include `normaliser` in the returned scope object.

**Verify:** ProjectScope has normaliser; createProjectScope takes normaliser and calls reconcileProjectId; return object includes normaliser.

### Step 5: Compile handler getScope and reconcileProjectId

In `mcp/src/handlers/compile-handler.ts`, add parameter `getScope: (projectRoot: AbsolutePath) => ProjectScope` to `createCompileHandler`. At the start of the returned async handler, after `validateProjectRoot(args.projectRoot)`, call `const scope = getScope(projectRoot)`. Replace the existing `ensureProjectInit(projectRoot)` call with `ensureProjectInit(projectRoot, scope.clock, scope.idGenerator)`. Immediately after that, call `reconcileProjectId(projectRoot, scope.db, scope.clock, scope.idGenerator, scope.normaliser)`. Import `reconcileProjectId` from shared storage and `ProjectScope` type.

**Verify:** createCompileHandler signature includes getScope; handler calls ensureProjectInit(projectRoot, scope.clock, scope.idGenerator) and reconcileProjectId(projectRoot, scope.db, scope.clock, scope.idGenerator, scope.normaliser).

### Step 6: Server NodePathAdapter and getScope

In `mcp/src/server.ts`, before `createProjectScope(projectRoot)`, instantiate `const normaliser = new NodePathAdapter()` (import from adapters). Change the call to `createProjectScope(projectRoot, normaliser)`. When calling `createCompileHandler`, add the argument `getScope: () => scope` (a function that returns the single scope for the current server).

**Verify:** server creates NodePathAdapter; createProjectScope(projectRoot, normaliser) and createCompileHandler(..., getScope) are called with the new arguments.

### Step 7: Tests for reconcileProjectId

Create `shared/src/storage/__tests__/ensure-project-id.test.ts`. Use in-memory DB; run migration 011 before tests. Mock or use a temp dir for file I/O. Test cases: (1) reconcileProjectId_file_missing: no project-id file, empty projects table; after reconcileProjectId, file exists with a UUID, projects has one row with that project_id and normalised project_root. (2) reconcileProjectId_file_present_insert: file contains a UUID string, projects empty; after reconcileProjectId, projects has one row; call again and assert last_seen_at updated. (3) reconcileProjectId_match_update_last_seen: file and projects row with same project_root; call reconcileProjectId; assert last_seen_at changed. (4) reconcileProjectId_rename_update_all_tables: file and projects row with different project_root (old path); call reconcileProjectId; assert projects row has new project_root and each of the eight tables that have rows with old project_root get UPDATE so project_root is the new path. (5) reconcileProjectId_uuid_not_in_db_insert: file has UUID, projects has no row; after reconcileProjectId, one row inserted. Use deterministic Clock and IdGenerator in tests.

**Verify:** All five test cases exist and pass; `pnpm test shared/src/storage/__tests__/ensure-project-id.test.ts` passes.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| reconcileProjectId_file_missing | No file and empty projects; after reconcile, file written and one row inserted |
| reconcileProjectId_file_present_insert | File with UUID and empty DB; row inserted; second call updates last_seen_at |
| reconcileProjectId_match_update_last_seen | File and row with same project_root; last_seen_at updated |
| reconcileProjectId_rename_update_all_tables | File and row with different project_root; projects and eight tables updated |
| reconcileProjectId_uuid_not_in_db_insert | File has UUID, DB has no row; row inserted |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] reconcileProjectId and PROJECT_ID_FILENAME exported; behaviour matches spec
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
