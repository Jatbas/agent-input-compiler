# Task 130: Move DB to ~/.aic/

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** storage + mcp (composition root)
> **Depends on:** W07 (Wire ScopeRegistry into server)

## Goal

Move the database from `{projectRoot}/.aic/aic.sqlite` to the global path `~/.aic/aic.sqlite`. The composition root opens one global DB and passes it into `createMcpServer`; `createProjectScope` receives `db` and `clock` as parameters and no longer opens a database itself. Per-project `.aic/` directories still hold `project-id`, `cache/`, and `aic.config.json`.

## Architecture Notes

- ADR: Single global DB at `~/.aic/aic.sqlite` with per-project isolation via `project_root` column (implementation-spec §W08).
- Caller owns the DB: `ScopeRegistry.close()` only clears the scope map; `createMcpServer`'s `out.close()` calls `registry.close()` then `closeDatabase(db)`.
- No backfill or migration in this task; one-time copy from `process.cwd()/.aic/aic.sqlite` to `~/.aic/aic.sqlite` only when the global file does not exist and the cwd file exists.
- Ensure `~/.aic/` with `0700` in `main()` via `fs.mkdirSync`; do not use `ensureAicDir` (which would run ensureGitignore on project root).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `shared/src/storage/create-project-scope.ts` (add `db`, `clock` params; remove `openDatabase`, `SystemClock`; keep `ensureAicDir(projectRoot)` for per-project `.aic`) |
| Modify | `shared/src/storage/scope-registry.ts` (constructor takes `db`, `clock`; `close()` only clears map) |
| Modify | `mcp/src/server.ts` (`main()`: ensure ~/.aic, copy cwd DB to global when global missing and cwd exists; open db; pass to createMcpServer; `createMcpServer` signature and `out.close` wire db/clock) |
| Modify | `mcp/src/__tests__/server.test.ts` (pass `db`, `clock` to `createMcpServer` and `createProjectScope`) |
| Modify | `shared/src/storage/__tests__/scope-registry.test.ts` (pass `db`, `clock` to `ScopeRegistry`; cleanup `closeDatabase(db)`) |
| Modify | `shared/src/integration/__tests__/real-project-integration.test.ts` (pass `db`, `clock` to `createProjectScope`) |
| Modify | `shared/src/integration/__tests__/selection-quality-benchmark.test.ts` (pass `db`, `clock` to `createProjectScope`) |
| Modify | `shared/src/integration/__tests__/token-reduction-benchmark.test.ts` (pass `db`, `clock` to `createProjectScope`) |

## Interface / Signature

```typescript
// createProjectScope — new signature (shared/src/storage/create-project-scope.ts)
export function createProjectScope(
  projectRoot: AbsolutePath,
  normaliser: ProjectRootNormaliser,
  db: ExecutableDb,
  clock: Clock,
): ProjectScope
```

```typescript
// ScopeRegistry (shared/src/storage/scope-registry.ts)
export class ScopeRegistry {
  constructor(
    private readonly normaliser: ProjectRootNormaliser,
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}
  getOrCreate(projectRoot: AbsolutePath): ProjectScope;
  close(): void;  // clears scopes only; caller closes db
}
```

```typescript
// createMcpServer (mcp/src/server.ts)
export function createMcpServer(
  projectRoot: AbsolutePath,
  db: ExecutableDb,
  clock: Clock,
  additionalProviders?: readonly LanguageProvider[],
): McpServer
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// ProjectScope — shared/src/storage/create-project-scope.ts
export interface ProjectScope {
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly normaliser: ProjectRootNormaliser;
  readonly cacheStore: CacheStore;
  readonly telemetryStore: TelemetryStore;
  readonly configStore: ConfigStore;
  readonly guardStore: GuardStore;
  readonly compilationLogStore: CompilationLogStore;
  readonly sessionTracker: SessionTracker;
  readonly fileTransformStore: FileTransformStore;
  readonly projectRoot: AbsolutePath;
}
```

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `ExecutableDb` | `shared/src/core/interfaces/executable-db.interface.js` | 2 | exec, prepare — passed to stores |
| `Clock` | `shared/src/core/interfaces/clock.interface.js` | 1 | now() — passed to createProjectScope and stores |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.js` | `toAbsolutePath(raw)` |
| `ProjectRootNormaliser` | `shared/src/core/interfaces/project-root-normaliser.interface.js` | normalise(raw): AbsolutePath |

## Config Changes

- **package.json:** None.
- **eslint.config.mjs:** None.

## Steps

### Step 1: createProjectScope — accept db and clock

In `shared/src/storage/create-project-scope.ts`: Change the function signature to `(projectRoot: AbsolutePath, normaliser: ProjectRootNormaliser, db: ExecutableDb, clock: Clock): ProjectScope`. Remove the line that builds `dbPath` from `aicDir` and the line that calls `openDatabase(dbPath, clock)`. Remove the line that constructs `new SystemClock()`. Remove the import of `openDatabase` and `SystemClock`. Keep `ensureAicDir(projectRoot)` and use the injected `db` and `clock` for all store construction and `reconcileProjectId`. Keep `new UuidV7Generator(clock)` and `path.join(aicDir, "cache")`, `fs.mkdirSync(cacheDirPath, { recursive: true })`, and all store constructors unchanged except they use the passed `db` and `clock`.

**Verify:** `pnpm typecheck` passes; no references to `openDatabase` or `SystemClock` in this file.

### Step 2: ScopeRegistry — accept db and clock; close() clears map only

In `shared/src/storage/scope-registry.ts`: Add `db: ExecutableDb` and `clock: Clock` to the constructor (both `private readonly`). In `getOrCreate`, call `createProjectScope(projectRoot, this.normaliser, this.db, this.clock)` instead of `createProjectScope(projectRoot, this.normaliser)`. In `close()`, remove the loop that calls `closeDatabase(scope.db)`; keep only `this.scopes.clear()`. Remove the import of `closeDatabase` from this file.

**Verify:** `pnpm typecheck` passes; `close()` body is only `this.scopes.clear()`.

### Step 3: main() — ensure ~/.aic, copy once when global missing and cwd exists, open global DB

In `mcp/src/server.ts`, in `main()` before calling `createMcpServer`: Compute `globalAicDir = path.join(os.homedir(), ".aic")` and `globalDbPath = path.join(globalAicDir, "aic.sqlite")`. Call `fs.mkdirSync(globalAicDir, { recursive: true, mode: 0o700 })`. Compute `cwdAicDb = path.join(process.cwd(), ".aic", "aic.sqlite")`. If `!fs.existsSync(globalDbPath)` and `fs.existsSync(cwdAicDb)`, call `fs.copyFileSync(cwdAicDb, globalDbPath)`. Create `clock = new SystemClock()` (import from adapters). Create `db = openDatabase(globalDbPath, clock)` (import `openDatabase` from `@jatbas/aic-core/storage/open-database.js`). Replace the call `createMcpServer(projectRoot)` with `createMcpServer(projectRoot, db, clock)`.

**Verify:** `main()` opens the DB at `~/.aic/aic.sqlite` and passes `db` and `clock` to `createMcpServer`; copy runs only when global DB is missing and cwd DB exists.

### Step 4: createMcpServer — accept db and clock; out.close closes db

In `mcp/src/server.ts`: Change `createMcpServer(projectRoot: AbsolutePath, additionalProviders?: ...)` to `createMcpServer(projectRoot: AbsolutePath, db: ExecutableDb, clock: Clock, additionalProviders?: ...)`. Add import for `closeDatabase` from `@jatbas/aic-core/storage/open-database.js` and type `ExecutableDb` from core. Replace `new ScopeRegistry(normaliser)` with `new ScopeRegistry(normaliser, db, clock)`. In the `out.close` implementation, after `registry.close()` add `closeDatabase(db)` before `return Promise.resolve()`.

**Verify:** `createMcpServer` signature has `db` and `clock`; `out.close()` calls `registry.close()` then `closeDatabase(db)`.

### Step 5a: server.test.ts — pass db and clock

In `mcp/src/__tests__/server.test.ts`: For every test that calls `createMcpServer(toAbsolutePath(tmpDir))` or `createMcpServer(projectRoot)`, before that call create `clock = new SystemClock()` and `db = openDatabase(":memory:", clock)`, then call `createMcpServer(projectRoot, db, clock)` (or `createMcpServer(toAbsolutePath(tmpDir), db, clock)`). Ensure each test that opens a server calls `server.close()` in cleanup so that `closeDatabase(db)` runs. For the two places that call `createProjectScope(projectRoot, normaliser)` or `createProjectScope(projectRoot, new NodePathAdapter())`, create `db = openDatabase(":memory:", clock)` and `clock = new SystemClock()` (or reuse from context) and call `createProjectScope(projectRoot, normaliser, db, clock)` (or with `new NodePathAdapter()` as second arg and `db`, `clock` as third and fourth).

**Verify:** `pnpm test` for mcp/src/__tests__/server.test.ts passes.

### Step 5b: scope-registry.test.ts — pass db and clock

In `shared/src/storage/__tests__/scope-registry.test.ts`: In each test, create `clock = new SystemClock()` and `db = openDatabase(":memory:", clock)` before creating the registry. Replace `new ScopeRegistry(normaliser)` with `new ScopeRegistry(normaliser, db, clock)`. In `afterEach` (or at end of each test), call `registry.close()` then `closeDatabase(db)` (import `closeDatabase` and `openDatabase` from storage, `SystemClock` from adapters).

**Verify:** `pnpm test` for shared/src/storage/__tests__/scope-registry.test.ts passes.

### Step 5c: real-project-integration.test.ts — pass db and clock

In `shared/src/integration/__tests__/real-project-integration.test.ts`: Where `createProjectScope(projectRoot, new NodePathAdapter())` is called, create `clock = new SystemClock()` and `db = openDatabase(":memory:", clock)` and call `createProjectScope(projectRoot, new NodePathAdapter(), db, clock)`.

**Verify:** `pnpm test` for real-project-integration.test.ts passes.

### Step 5d: selection-quality-benchmark.test.ts — pass db and clock

In `shared/src/integration/__tests__/selection-quality-benchmark.test.ts`: Where `createProjectScope(fixtureRoot, new NodePathAdapter())` is called (two places), create `clock` and `db` and pass them as third and fourth arguments.

**Verify:** `pnpm test` for selection-quality-benchmark.test.ts passes.

### Step 5e: token-reduction-benchmark.test.ts — pass db and clock

In `shared/src/integration/__tests__/token-reduction-benchmark.test.ts`: Where `createProjectScope(fixtureRoot, new NodePathAdapter())` is called, create `clock` and `db` and pass them as third and fourth arguments.

**Verify:** `pnpm test` for token-reduction-benchmark.test.ts passes.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| same_path_same_instance | ScopeRegistry returns same scope for same normalised path (with db, clock) |
| different_paths_different_instances | ScopeRegistry returns different scopes for different paths |
| normalisation_trailing_slash | Trailing slash normalisation still deduplicates scope |
| normalisation_drive_letter | Drive-letter normalisation still deduplicates scope |
| close_releases_scopes | After close(), getOrCreate returns new scope instance; db still open until caller closes it |
| server tests | All server tests pass with createMcpServer(projectRoot, db, clock) and cleanup closeDatabase |
| integration/benchmark tests | real-project-integration, selection-quality-benchmark, token-reduction-benchmark pass with createProjectScope(..., db, clock) |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] createProjectScope signature is (projectRoot, normaliser, db, clock); no openDatabase or SystemClock in file
- [ ] ScopeRegistry constructor is (normaliser, db, clock); close() only clears scopes
- [ ] main() ensures ~/.aic with 0700, copies cwd/.aic/aic.sqlite to ~/.aic/aic.sqlite only when global missing and cwd exists, opens db at ~/.aic/aic.sqlite, passes db and clock to createMcpServer
- [ ] createMcpServer(projectRoot, db, clock, additionalProviders?); out.close() calls registry.close() then closeDatabase(db)
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
