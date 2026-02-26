# Task 021: status command

> **Status:** Done
> **Phase:** G (CLI)
> **Layer:** cli + storage + core
> **Depends on:** Zod schemas (CLI), MigrationRunner, compilation_log/telemetry_events/guard_findings schema

## Goal

Implement the `aic status` CLI command that reads from the local SQLite database (compilation_log, telemetry_events, guard_findings), displays a project-level summary per MVP spec §4c, and exits with code 0 (including when the database is missing or there are no compilations).

## Architecture Notes

- Composition root: status command receives StatusRunner by injection; main.ts wires a real runner that uses openDatabase + SqliteStatusStore. Same pattern as compile/inspect.
- Exit codes: 0 for all status outcomes (success, no database, no compilations); 1 on Zod validation failure; 2 on AicError or internal error. Per aic-cli.mdc and MVP spec §4c.
- SQL lives only in shared/src/storage/. StatusStore.getSummary() runs all aggregates; cache hit rate from compilation_log.cache_hit. openDatabase in shared/storage for reuse (CLI and future MCP).
- Rules health: MVP stub — display "Rules health: —". Config/Trigger/Database size: CLI uses fs.existsSync and fs.statSync to add those lines to the formatted output.
- Approach chosen: StatusRunner + StatusStore + openDatabase; storage does all SQL, CLI does file-exists check and formatting.

## Files

| Action | Path                                                         |
| ------ | ------------------------------------------------------------ |
| Create | `shared/src/core/types/status-types.ts`                      |
| Create | `shared/src/core/interfaces/status-store.interface.ts`       |
| Create | `shared/src/core/interfaces/status-runner.interface.ts`      |
| Create | `shared/src/storage/open-database.ts`                        |
| Create | `shared/src/storage/sqlite-status-store.ts`                  |
| Create | `shared/src/storage/__tests__/sqlite-status-store.test.ts`   |
| Create | `cli/src/commands/status.ts`                                 |
| Create | `cli/src/commands/__tests__/status.test.ts`                  |
| Modify | `cli/src/main.ts` (add status subcommand, wire StatusRunner) |

## Interface / Signature

StatusStore and StatusRunner (consumed by command):

```typescript
// shared/src/core/interfaces/status-store.interface.ts
import type { StatusAggregates } from "#core/types/status-types.js";

export interface StatusStore {
  getSummary(): StatusAggregates;
}
```

```typescript
// shared/src/core/interfaces/status-runner.interface.ts
import type { StatusRequest } from "#core/types/status-types.js";
import type { StatusAggregates } from "#core/types/status-types.js";

export interface StatusRunner {
  status(request: StatusRequest): Promise<StatusAggregates>;
}
```

Exported function and wiring:

```typescript
// cli/src/commands/status.ts
export async function statusCommand(
  args: StatusArgs,
  runner: StatusRunner,
): Promise<void>;
```

Real runner (wired in main.ts): object implementing StatusRunner whose status(request) calls openDatabase(request.dbPath as string, new SystemClock()), then new SqliteStatusStore(db), then returns Promise.resolve(store.getSummary()).

Concrete classes used by status path:

- openDatabase(dbPath: string, clock: Clock): ExecutableDb — in shared/src/storage/open-database.ts. Instantiates Database from "better-sqlite3", SqliteMigrationRunner(clock), runs migration001, returns db.
- SqliteStatusStore(db: ExecutableDb) — in shared/src/storage/sqlite-status-store.ts. Single method getSummary(): StatusAggregates.
- SystemClock() — from shared/src/adapters/system-clock.js (passed to openDatabase).

## Dependent Types

### Tier 0 — verbatim

StatusRequest (built by command, passed to runner):

```typescript
// shared/src/core/types/status-types.ts
import type { AbsolutePath } from "#core/types/paths.js";
import type { FilePath } from "#core/types/paths.js";

export interface StatusRequest {
  readonly projectRoot: AbsolutePath;
  readonly configPath: FilePath | null;
  readonly dbPath: FilePath;
}
```

StatusAggregates (returned by StatusStore.getSummary and StatusRunner.status):

```typescript
export interface StatusAggregates {
  readonly compilationsTotal: number;
  readonly compilationsToday: number;
  readonly cacheHitRatePct: number | null;
  readonly avgReductionPct: number | null;
  readonly totalTokensSaved: number | null;
  readonly telemetryDisabled: boolean;
  readonly guardByType: Readonly<Record<string, number>>;
  readonly topTaskClasses: readonly {
    readonly taskClass: string;
    readonly count: number;
  }[];
  readonly lastCompilation: {
    readonly intent: string;
    readonly filesSelected: number;
    readonly filesTotal: number;
    readonly tokensCompiled: number;
    readonly tokenReductionPct: number;
    readonly created_at: string;
  } | null;
}
```

StatusArgs (input to statusCommand):

```typescript
// cli/src/schemas/status-args.ts (existing)
export const StatusArgsSchema = z.object({
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
  dbPath: z.string().nullable().default(null),
});
export type StatusArgs = z.infer<typeof StatusArgsSchema>;
```

### Tier 1 — signature + path

| Type         | Path                                                  | Members | Purpose         |
| ------------ | ----------------------------------------------------- | ------- | --------------- |
| StatusStore  | shared/src/core/interfaces/status-store.interface.ts  | 1       | getSummary()    |
| StatusRunner | shared/src/core/interfaces/status-runner.interface.ts | 1       | status(request) |
| Clock        | shared/src/core/interfaces/clock.interface.ts         | 1       | now()           |
| ExecutableDb | shared/src/core/interfaces/executable-db.interface.ts | 2       | exec, prepare   |

### Tier 2 — path-only

| Type         | Path                           | Factory           |
| ------------ | ------------------------------ | ----------------- |
| AbsolutePath | shared/src/core/types/paths.ts | toAbsolutePath(s) |
| FilePath     | shared/src/core/types/paths.ts | toFilePath(s)     |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Status types

Create `shared/src/core/types/status-types.ts` with StatusRequest and StatusAggregates interfaces as in Dependent Types Tier 0. Export both.

**Verify:** File exists; `pnpm typecheck` from repo root passes.

### Step 2: StatusStore interface

Create `shared/src/core/interfaces/status-store.interface.ts` with StatusStore (getSummary(): StatusAggregates). Import StatusAggregates from #core/types/status-types.js.

**Verify:** File exists; `pnpm typecheck` passes.

### Step 3: StatusRunner interface

Create `shared/src/core/interfaces/status-runner.interface.ts` with StatusRunner (status(request: StatusRequest): Promise<StatusAggregates>). Import StatusRequest and StatusAggregates from #core/types/status-types.js.

**Verify:** File exists; `pnpm typecheck` passes.

### Step 4: openDatabase

Create `shared/src/storage/open-database.ts`. Import Database from "better-sqlite3", SqliteMigrationRunner from "#storage/sqlite-migration-runner.js", migration001 from "#storage/migrations/001-initial-schema.js", type Clock from "#core/interfaces/clock.interface.js", type ExecutableDb from "#core/interfaces/executable-db.interface.js". Export function openDatabase(dbPath: string, clock: Clock): ExecutableDb. Implementation: const db = new Database(dbPath) as unknown as ExecutableDb; const migrationRunner = new SqliteMigrationRunner(clock); migrationRunner.run(db, [migration001]); return db.

**Verify:** File exists; no ESLint errors; `pnpm typecheck` passes.

### Step 5: SqliteStatusStore.getSummary

Create `shared/src/storage/sqlite-status-store.ts`. Class SqliteStatusStore with constructor(private readonly db: ExecutableDb). Implement getSummary(): StatusAggregates using this.db.prepare(...).all() for: (1) compilation*log COUNT(*) as compilationsTotal; (2) compilation*log COUNT(*) WHERE date(created*at) = date('now') as compilationsToday; (3) cache hit rate from compilation_log as SUM(cache_hit=1)\_100.0/NULLIF(COUNT(*),0) (return null when COUNT(\*) is 0); (4) telemetry_events AVG(token_reduction_pct), SUM(tokens_raw - tokens_compiled); (5) guard_findings GROUP BY type with COUNT; (6) compilation_log task_class GROUP BY with COUNT ORDER BY count DESC LIMIT 3; (7) compilation_log ORDER BY created_at DESC LIMIT 1 for lastCompilation. Map columns to StatusAggregates. When telemetry_events has no rows, avgReductionPct and totalTokensSaved are null, telemetryDisabled true. Use sync API (getSummary returns T, not Promise<T>).

**Verify:** File exists; `pnpm typecheck` passes; SQL uses only compilation_log, telemetry_events, guard_findings columns from 001-initial-schema.

### Step 6: SqliteStatusStore tests

Create `shared/src/storage/__tests__/sqlite-status-store.test.ts`. Use in-memory Database(":memory:"), run migration001.up(db), instantiate SqliteStatusStore(db). Tests: empty DB returns compilationsTotal 0, compilationsToday 0, cacheHitRatePct null, lastCompilation null, telemetryDisabled true; insert one compilation_log row then getSummary() returns compilationsTotal 1 and lastCompilation matches; insert telemetry_events row then getSummary() has telemetryDisabled false and numeric avgReductionPct/totalTokensSaved; insert guard_findings rows then getSummary().guardByType matches. Assert no division-by-zero when compilation count is zero.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-status-store.test.ts` passes.

### Step 7: statusCommand

Create `cli/src/commands/status.ts`. Import StatusArgsSchema and type StatusArgs from status-args, StatusRunner interface, StatusRequest and StatusAggregates types, toAbsolutePath and toFilePath from shared paths, AicError and sanitizeError, path from "node:path", fs from "node:fs", z from "zod". Export async function statusCommand(args: StatusArgs, runner: StatusRunner): Promise<void>. Parse args with StatusArgsSchema.parse(args). Build dbPath: args.dbPath !== null ? toFilePath(args.dbPath) : toFilePath(path.join(args.projectRoot, ".aic", "aic.sqlite")). If !fs.existsSync(dbPath as string), process.stdout.write("No AIC database found. Run 'aic init' or use AIC via your editor first.\n"), return (caller exits 0). Else build StatusRequest { projectRoot: toAbsolutePath(args.projectRoot), configPath: args.configPath !== null ? toFilePath(args.configPath) : null, dbPath }. const aggregates = await runner.status(request). If aggregates.compilationsTotal === 0, process.stdout.write("No compilations recorded yet. Run 'aic compile' or use AIC via your editor.\n"), return. Else format aggregates to the spec output (Compilations, Cache hit rate, Avg reduction, Total tokens saved, Guard, Top task classes, Rules health stub "—", Config line (config path from request, fs.existsSync), Trigger line (.cursor/rules/aic.mdc, fs.existsSync), Database line (dbPath, fs.statSync for size)) and process.stdout.write formatted string. Catch: z.ZodError → stderr message, throw; AicError → sanitizeError, stderr write, throw; other → stderr "Internal error", throw.

**Verify:** File exists; `pnpm typecheck` and `pnpm lint` pass.

### Step 8: main.ts status subcommand

In `cli/src/main.ts` add status subcommand: .command("status"), .description("Show project-level summary from local database"), .option("--root <path>", "project root directory", process.cwd()), .option("--config <path>", "path to aic.config.json"), .option("--db <path>", "path to SQLite database"). In the action: parse with StatusArgsSchema ({ projectRoot: path.resolve(opts.root ?? process.cwd()), configPath: opts.config ?? null, dbPath: opts.db ?? null }), build StatusRequest (dbPath default path.join(projectRoot, ".aic", "aic.sqlite") when opts.db not set). Wire real StatusRunner: import openDatabase from shared storage, SystemClock from shared adapters, SqliteStatusStore; runner = { async status(request) { const db = openDatabase(request.dbPath as string, new SystemClock()); const store = new SqliteStatusStore(db); return store.getSummary(); } }. await statusCommand(parsed, runner); process.exit(0). Catch ZodError → stderr, exit 1; other → sanitizeError to stderr, exit 2.

**Verify:** `aic status --help` shows status command; `pnpm typecheck` and `pnpm lint` pass.

### Step 9: status command tests

Create `cli/src/commands/__tests__/status.test.ts`. Stub StatusRunner returning fixture StatusAggregates (compilationsTotal 1, compilationsToday 0, cacheHitRatePct 0, avgReductionPct 10, totalTokensSaved 1000, telemetryDisabled false, guardByType {}, topTaskClasses [{ taskClass: "refactor", count: 1 }], lastCompilation with intent "fix bug", filesSelected 8, filesTotal 142, tokensCompiled 7200, tokenReductionPct 84, created_at ISO string). Test valid_args_stdout_stub: StatusArgsSchema.parse valid args, mock stdout.write, call statusCommand(parsed, stubRunner), assert stdout contains "Compilations" and "fix bug". Test no_database_message_exit0: import { tmpdir } from "node:os", fs and path; projectRoot = fs.mkdtempSync(path.join(tmpdir(), "aic-status-no-db-")); configPath null, dbPath null so the command computes dbPath as path.join(projectRoot, ".aic", "aic.sqlite") which does not exist; mock stdout.write, call statusCommand(parsed, stubRunner); assert stdout contains "No AIC database found". Test no_compilations_message: stub returns StatusAggregates with compilationsTotal 0; mock stdout.write, call statusCommand(parsed, zeroCompilationsStub); assert stdout contains "No compilations recorded yet". Test runner_throws_aic_error: stub runner throws new ConfigError("test"); statusCommand(parsed, throwingRunner) rejects; assert stderr contains "test".

**Verify:** `pnpm test cli/src/commands/__tests__/status.test.ts` passes.

### Step 10: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                           | Description                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| valid_args_stdout_stub              | Stub runner returns fixture aggregates; stdout contains Compilations and last intent             |
| no_database_message_exit0           | dbPath points to non-existent file; command writes "No AIC database found" to stdout and returns |
| no_compilations_message             | Stub returns compilationsTotal 0; stdout contains "No compilations recorded yet"                 |
| runner_throws_aic_error             | Stub throws AicError; command writes sanitized message to stderr and rejects                     |
| sqlite_status_store_empty           | Empty DB; getSummary returns zeros, nulls, telemetryDisabled true                                |
| sqlite_status_store_one_compilation | One compilation_log row; getSummary matches                                                      |
| sqlite_status_store_telemetry       | telemetry_events row present; avgReductionPct and totalTokensSaved set, telemetryDisabled false  |
| sqlite_status_store_guard_by_type   | guard_findings rows; guardByType matches                                                         |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] StatusStore and StatusRunner interfaces match wiring and command usage
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
