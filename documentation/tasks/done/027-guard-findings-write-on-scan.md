# Task 027: Guard findings write on scan

> **Status:** Done
> **Phase:** 0.5 (Quality Release) — Phase I Live Wiring
> **Layer:** storage + pipeline (orchestrator) + composition roots
> **Depends on:** SqliteGuardStore, CompilationRunner, createProjectScope, MCP server, CLI compile

## Goal

Persist guard findings to the database on every compilation so that `guard_findings` is populated and `aic status` can report Guard aggregates; this requires writing a row to `compilation_log` first (FK) and then calling `GuardStore.write(compilationId, findings)` from the compilation path.

## Architecture Notes

- ADR-007: UUIDv7 for compilation_log id. guard_findings.compilation_id REFERENCES compilation_log(id).
- Pipeline does not call storage; CompilationRunner (orchestrator) calls CompilationLogStore.record and GuardStore.write after runPipelineSteps so that compilation_log is written on every successful compilation (cache hit and miss), then guard findings are written (empty array on cache hit, r.guardResult.findings on miss).
- Single-responsibility stores: CompilationLogStore only INSERTs into compilation_log; GuardStore only writes guard_findings. Runner builds CompilationLogEntry from meta + idGenerator + clock and orchestrates both writes.
- More than three Create rows: one new store (interface + impl + test), one new type, plus index export — justified because compilation_log had no writer and guard_findings requires a valid FK.

## Files

| Action | Path                                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/types/compilation-log-entry.ts`                                                                                                                             |
| Create | `shared/src/core/interfaces/compilation-log-store.interface.ts`                                                                                                              |
| Create | `shared/src/storage/sqlite-compilation-log-store.ts`                                                                                                                         |
| Create | `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts`                                                                                                          |
| Modify | `shared/src/core/types/index.ts` (export CompilationLogEntry)                                                                                                                |
| Modify | `shared/src/pipeline/compilation-runner.ts` (add guardStore, compilationLogStore, idGenerator; call record then guardStore.write on every successful run)                    |
| Modify | `shared/src/storage/create-project-scope.ts` (instantiate SqliteCompilationLogStore, add compilationLogStore to ProjectScope)                                                |
| Modify | `mcp/src/server.ts` (pass scope.guardStore, scope.compilationLogStore, scope.idGenerator to CompilationRunner)                                                               |
| Modify | `cli/src/main.ts` (pass scope.guardStore, scope.compilationLogStore, scope.idGenerator to CompilationRunner)                                                                 |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (mock guardStore and compilationLogStore; assert record and guardStore.write called with correct id and findings) |

## Interface / Signature

```typescript
// GuardStore (existing) — shared/src/core/interfaces/guard-store.interface.ts
import type { UUIDv7 } from "#core/types/identifiers.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export interface GuardStore {
  write(compilationId: UUIDv7, findings: readonly GuardFinding[]): void;
  queryByCompilation(compilationId: UUIDv7): readonly GuardFinding[];
}
```

```typescript
// CompilationLogStore (new) — shared/src/core/interfaces/compilation-log-store.interface.ts
import type { CompilationLogEntry } from "#core/types/compilation-log-entry.js";

export interface CompilationLogStore {
  record(entry: CompilationLogEntry): void;
}
```

```typescript
// SqliteCompilationLogStore (new)
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { CompilationLogStore } from "#core/interfaces/compilation-log-store.interface.js";
import type { CompilationLogEntry } from "#core/types/compilation-log-entry.js";

export class SqliteCompilationLogStore implements CompilationLogStore {
  constructor(private readonly db: ExecutableDb) {}
  record(entry: CompilationLogEntry): void;
}
```

```typescript
// CompilationRunner (modified) — constructor and run behavior
constructor(
  private readonly deps: PipelineStepsDeps,
  private readonly clock: Clock,
  private readonly cacheStore: CacheStore,
  private readonly configStore: ConfigStore,
  private readonly stringHasher: StringHasher,
  private readonly guardStore: GuardStore,
  private readonly compilationLogStore: CompilationLogStore,
  private readonly idGenerator: IdGenerator,
) {}
async run(request: CompilationRequest): Promise<{ compiledPrompt: string; meta: CompilationMeta }>;
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// GuardFinding, GuardResult — shared/src/core/types/guard-types.ts
import type { GuardSeverity, GuardFindingType } from "#core/types/enums.js";
import type { RelativePath } from "#core/types/paths.js";
import type { LineNumber } from "#core/types/units.js";

export interface GuardFinding {
  readonly severity: GuardSeverity;
  readonly type: GuardFindingType;
  readonly file: RelativePath;
  readonly line?: LineNumber;
  readonly message: string;
  readonly pattern?: string;
}

export interface GuardResult {
  readonly passed: boolean;
  readonly findings: readonly GuardFinding[];
  readonly filesBlocked: readonly RelativePath[];
  readonly filesRedacted: readonly RelativePath[];
}
```

```typescript
// CompilationLogEntry (new) — shared/src/core/types/compilation-log-entry.ts
import type { UUIDv7, ISOTimestamp } from "#core/types/identifiers.js";
import type { TokenCount, Milliseconds } from "#core/types/units.js";
import type { Percentage } from "#core/types/scores.js";
import type { TaskClass, EditorId } from "#core/types/enums.js";

export interface CompilationLogEntry {
  readonly id: UUIDv7;
  readonly intent: string;
  readonly taskClass: TaskClass;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly tokenReductionPct: Percentage;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly editorId: EditorId;
  readonly modelId: string;
  readonly createdAt: ISOTimestamp;
}
```

### Tier 1 — signature + path

| Type                | Path                                                          | Members | Purpose                                                           |
| ------------------- | ------------------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| GuardStore          | shared/src/core/interfaces/guard-store.interface.ts           | 2       | write(compilationId, findings), queryByCompilation(compilationId) |
| CompilationLogStore | shared/src/core/interfaces/compilation-log-store.interface.ts | 1       | record(entry)                                                     |
| IdGenerator         | shared/src/core/interfaces/id-generator.interface.ts          | 1       | generate()                                                        |

### Tier 2 — path-only

| Type                     | Path                                 | Factory                            |
| ------------------------ | ------------------------------------ | ---------------------------------- |
| UUIDv7                   | shared/src/core/types/identifiers.js | toUUIDv7(raw)                      |
| ISOTimestamp             | shared/src/core/types/identifiers.js | Clock.now()                        |
| TokenCount, Milliseconds | shared/src/core/types/units.js       | toTokenCount(n), toMilliseconds(n) |
| Percentage               | shared/src/core/types/scores.js      | toPercentage(n)                    |
| TaskClass, EditorId      | shared/src/core/types/enums.js       | as const                           |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add CompilationLogEntry type

Create `shared/src/core/types/compilation-log-entry.ts` with interface CompilationLogEntry (id: UUIDv7, intent: string, taskClass: TaskClass, filesSelected: number, filesTotal: number, tokensRaw: TokenCount, tokensCompiled: TokenCount, tokenReductionPct: Percentage, cacheHit: boolean, durationMs: Milliseconds, editorId: EditorId, modelId: string, createdAt: ISOTimestamp). Use branded types from core/types (identifiers, units, scores, enums). Export CompilationLogEntry from `shared/src/core/types/index.ts` (add one export line).

**Verify:** `pnpm typecheck` passes; Grep for `CompilationLogEntry` in index.ts returns one export.

### Step 2: Add CompilationLogStore interface

Create `shared/src/core/interfaces/compilation-log-store.interface.ts`. Define interface CompilationLogStore with one method: `record(entry: CompilationLogEntry): void`. Import CompilationLogEntry from #core/types/compilation-log-entry.js.

**Verify:** `pnpm typecheck` passes.

### Step 3: Implement SqliteCompilationLogStore

Create `shared/src/storage/sqlite-compilation-log-store.ts`. Class SqliteCompilationLogStore implements CompilationLogStore. Constructor(private readonly db: ExecutableDb). Method record(entry: CompilationLogEntry): void — prepare INSERT INTO compilation_log (id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled, token_reduction_pct, cache_hit, duration_ms, editor_id, model_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) and run with entry.id, entry.intent, entry.taskClass, entry.filesSelected, entry.filesTotal, entry.tokensRaw, entry.tokensCompiled, entry.tokenReductionPct, entry.cacheHit ? 1 : 0, entry.durationMs, entry.editorId, entry.modelId || null, entry.createdAt. Map column names to schema in 001-initial-schema.ts (token_reduction_pct REAL, cache_hit INTEGER).

**Verify:** `pnpm typecheck` and `pnpm lint` pass.

### Step 4: Tests for SqliteCompilationLogStore

Create `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts`. Use in-memory Database (better-sqlite3), run migration001.up(db). Instantiate SqliteCompilationLogStore(db). Build a CompilationLogEntry with toUUIDv7, toTokenCount, toMilliseconds, toPercentage, EDITOR_ID.GENERIC, TASK_CLASS.REFACTOR, toISOTimestamp. Call store.record(entry). Query compilation_log with db.prepare("SELECT \* FROM compilation_log WHERE id = ?").get(entry.id); assert one row with correct id, intent, task_class, files_selected, tokens_raw, tokens_compiled, cache_hit, created_at. Add test: record with empty intent and zero tokens — assert row inserted with intent "" and tokens 0.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts` passes.

### Step 5: CompilationRunner — add deps and call record + guardStore.write

In `shared/src/pipeline/compilation-runner.ts` add constructor parameters: guardStore: GuardStore, compilationLogStore: CompilationLogStore, idGenerator: IdGenerator (all private readonly). In run(): after determining result (cache hit or miss), generate compilationId = this.idGenerator.generate() and createdAt = this.clock.now(). Build CompilationLogEntry from the meta used for the return value (buildCacheHitMeta for cache hit, buildFreshMeta for cache miss): id = compilationId, intent = meta.intent, taskClass = meta.taskClass, filesSelected = meta.filesSelected, filesTotal = meta.filesTotal, tokensRaw = meta.tokensRaw, tokensCompiled = meta.tokensCompiled, tokenReductionPct = meta.tokenReductionPct, cacheHit = meta.cacheHit, durationMs = meta.durationMs, editorId = meta.editorId, modelId = meta.modelId, createdAt. Call this.compilationLogStore.record(entry). Then call this.guardStore.write(compilationId, findings) where findings = [] on cache hit and findings = r.guardResult.findings on cache miss. Place both calls after meta is built and before return; on cache hit do this after buildCacheHitMeta and before return; on cache miss do this after buildFreshMeta and cacheStore.set and before return.

**Verify:** `pnpm typecheck` passes. CompilationRunner.run return type unchanged.

### Step 6: createProjectScope — add SqliteCompilationLogStore

In `shared/src/storage/create-project-scope.ts` import SqliteCompilationLogStore. After guardStore = new SqliteGuardStore(...), add compilationLogStore = new SqliteCompilationLogStore(db). Add compilationLogStore to the returned ProjectScope object. Add compilationLogStore: CompilationLogStore to the ProjectScope interface (same file).

**Verify:** `pnpm typecheck` passes; ProjectScope type includes compilationLogStore.

### Step 7: MCP server — pass guardStore, compilationLogStore, idGenerator to CompilationRunner

In `mcp/src/server.ts` where CompilationRunnerImpl is instantiated, add the fourth, fifth, and sixth arguments: scope.guardStore, scope.compilationLogStore, scope.idGenerator (after stringHasher).

**Verify:** `pnpm typecheck` passes for mcp package.

### Step 8: CLI — pass guardStore, compilationLogStore, idGenerator to CompilationRunner

In `cli/src/main.ts` in createCompilationRunner, where CompilationRunnerImpl is instantiated, add scope.guardStore, scope.compilationLogStore, scope.idGenerator after stringHasher.

**Verify:** `pnpm typecheck` passes for cli package.

### Step 9: CompilationRunner tests — mock guardStore and compilationLogStore

In `shared/src/pipeline/__tests__/compilation-runner.test.ts` add mock guardStore: { write: (id, findings) => { recordedGuardCalls.push({ id, findings }); } } and mock compilationLogStore: { record: (entry) => { recordedLogEntries.push(entry); } } (use arrays defined in test scope). Pass these mocks when constructing CompilationRunner in tests that run runner.run(). Add test: on cache miss, after run(), assert recordedLogEntries has one entry with id matching compilationId and meta shape; assert recordedGuardCalls has one call with same id and findings equal to r.guardResult.findings (use a scenario that produces at least one guard finding or explicitly assert empty array when no findings). Add test: on cache hit, after run(), assert compilationLogStore.record was called once and guardStore.write was called once with findings length 0.

**Verify:** `pnpm test shared/src/pipeline/__tests__/compilation-runner.test.ts` passes.

### Step 10: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                  | Description                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SqliteCompilationLogStore record inserts row               | record(entry) then SELECT from compilation_log yields one row with correct columns                                                |
| SqliteCompilationLogStore empty intent zero tokens         | record(entry) with intent "" and tokens 0 inserts valid row                                                                       |
| CompilationRunner cache miss writes log and guard findings | Mock record and write; run with cache miss; assert record called once, write called with compilationId and r.guardResult.findings |
| CompilationRunner cache hit writes log and empty findings  | Mock record and write; run with cache hit; assert record called once, write called with findings length 0                         |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] CompilationLogStore interface and SqliteCompilationLogStore implement record(entry) correctly
- [ ] CompilationRunner records compilation_log and writes guard findings on every successful run (cache hit and miss)
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
