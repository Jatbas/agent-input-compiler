# Task 026: Telemetry write on compile

> **Status:** In Progress
> **Phase:** 0.5 (Phase I — Live Wiring & Bug Fixes)
> **Layer:** core + mcp + cli
> **Depends on:** Wire real RepoMap in MCP/CLI, Wire real InspectRunner (CLI), SqliteTelemetryStore, CompilationRunner, createProjectScope

## Goal

Persist a telemetry event to the local SQLite store after every successful compile (MCP and CLI) by building a TelemetryEvent from the compilation result and calling TelemetryStore.write, so compilation metrics are available for status and analytics.

## Architecture Notes

- ADR-007: UUIDv7 for event id via IdGenerator; ADR-008: ISOTimestamp from Clock. RepoId = SHA-256 of project root (security.md).
- Direct write at boundary (no event bus): handler and command call buildTelemetryEvent then telemetryStore.write after runner.run(). Non-fatal: try/catch around write, log at warn on failure.
- TelemetryDeps (telemetryStore, clock, idGenerator, stringHasher) passed from composition roots; opt-in (telemetry.enabled) deferred to config-loading task.

## Files

| Action | Path                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/build-telemetry-event.ts`                                                                                               |
| Create | `shared/src/core/__tests__/build-telemetry-event.test.ts`                                                                                |
| Modify | `shared/src/core/types/telemetry-types.ts` (add TelemetryDeps type)                                                                      |
| Modify | `mcp/src/handlers/compile-handler.ts` (add telemetryDeps param, write after run)                                                         |
| Modify | `mcp/src/server.ts` (pass telemetry deps to createCompileHandler)                                                                        |
| Modify | `cli/src/commands/compile.ts` (add optional telemetryDeps param, write when present)                                                     |
| Modify | `cli/src/main.ts` (createCompilationRunner returns { runner, scope, stringHasher }; pass telemetryDeps to compileCommand)                |
| Modify | `cli/src/commands/__tests__/compile.test.ts` (optional third param; add test with mock store)                                            |
| Create | `mcp/src/handlers/__tests__/compile-handler.test.ts` (test that with mock runner and telemetryDeps, telemetryStore.write is called once) |

## Interface / Signature

```typescript
// buildTelemetryEvent — pure function in shared/src/core/build-telemetry-event.ts
import type {
  CompilationMeta,
  CompilationRequest,
} from "#core/types/compilation-types.js";
import type { TelemetryEvent } from "#core/types/telemetry-types.js";
import type { UUIDv7, ISOTimestamp, RepoId } from "#core/types/identifiers.js";

export function buildTelemetryEvent(
  meta: CompilationMeta,
  _request: CompilationRequest,
  id: UUIDv7,
  timestamp: ISOTimestamp,
  repoId: RepoId,
): TelemetryEvent;
```

```typescript
// createCompileHandler — second param added
export function createCompileHandler(
  runner: CompilationRunner,
  telemetryDeps: TelemetryDeps,
): (
  args: {
    intent: string;
    projectRoot: string;
    modelId: string | null;
    editorId: string;
    configPath: string | null;
  },
  _extra: unknown,
) => Promise<CallToolResult>;
```

```typescript
// compileCommand — optional third param
export async function compileCommand(
  args: CompilationArgs,
  runner: CompilationRunner,
  telemetryDeps?: TelemetryDeps,
): Promise<void>;
```

```typescript
// TelemetryDeps — in shared/src/core/types/telemetry-types.ts
import type { TelemetryStore } from "#core/interfaces/telemetry-store.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { IdGenerator } from "#core/interfaces/id-generator.interface.js";
import type { StringHasher } from "#core/interfaces/string-hasher.interface.js";

export interface TelemetryDeps {
  readonly telemetryStore: TelemetryStore;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly stringHasher: StringHasher;
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// TelemetryEvent — Source: shared/src/core/types/telemetry-types.ts
import type { UUIDv7, ISOTimestamp, RepoId } from "#core/types/identifiers.js";
import type { TokenCount, Milliseconds } from "#core/types/units.js";
import type { TaskClass, InclusionTier } from "#core/types/enums.js";
export interface TelemetryEvent {
  readonly id: UUIDv7;
  readonly timestamp: ISOTimestamp;
  readonly repoId: RepoId;
  readonly taskClass: TaskClass;
  readonly tokensRaw: TokenCount;
  readonly tokensCompiled: TokenCount;
  readonly filesSelected: number;
  readonly filesTotal: number;
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly guardBlockedCount: number;
  readonly guardFindingsCount: number;
  readonly cacheHit: boolean;
  readonly durationMs: Milliseconds;
  readonly model: string | null;
}
```

### Tier 1 — signature + path

| Type               | Path                                       | Members                                                                                                                        | Purpose                                                                                   |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| CompilationMeta    | shared/src/core/types/compilation-types.ts | taskClass, filesSelected, filesTotal, tokensRaw, tokensCompiled, summarisationTiers, guard, cacheHit, durationMs, modelId, ... | Input to buildTelemetryEvent                                                              |
| CompilationRequest | shared/src/core/types/compilation-types.ts | projectRoot, intent, modelId, ...                                                                                              | projectRoot for repoId hash                                                               |
| GuardResult        | shared/src/core/types/guard-types.ts       | passed, findings, filesBlocked, filesRedacted                                                                                  | meta.guard; guardBlockedCount = filesBlocked.length, guardFindingsCount = findings.length |

### Tier 2 — path-only

| Type         | Path                                 | Factory                                  |
| ------------ | ------------------------------------ | ---------------------------------------- |
| UUIDv7       | shared/src/core/types/identifiers.ts | IdGenerator.generate()                   |
| ISOTimestamp | shared/src/core/types/identifiers.ts | clock.now()                              |
| RepoId       | shared/src/core/types/identifiers.ts | toRepoId(stringHasher.hash(projectRoot)) |

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Add TelemetryDeps type

In `shared/src/core/types/telemetry-types.ts`, add an exported interface or type `TelemetryDeps` with readonly properties: `telemetryStore: TelemetryStore`, `clock: Clock`, `idGenerator: IdGenerator`, `stringHasher: StringHasher`. Import the four interfaces from core.

**Verify:** `pnpm typecheck` from repo root passes.

### Step 2: Add buildTelemetryEvent

Create `shared/src/core/build-telemetry-event.ts`. Export function `buildTelemetryEvent(meta: CompilationMeta, _request: CompilationRequest, id: UUIDv7, timestamp: ISOTimestamp, repoId: RepoId): TelemetryEvent`. Implement: guardBlockedCount = meta.guard?.filesBlocked.length ?? 0; guardFindingsCount = meta.guard?.findings.length ?? 0; model = meta.modelId ?? null; return object with all TelemetryEvent fields from meta and the five params.

**Verify:** File exists and exports buildTelemetryEvent; `pnpm typecheck` passes.

### Step 3: Add build-telemetry-event tests

Create `shared/src/core/__tests__/build-telemetry-event.test.ts`. Test: (1) meta with guard null → guardBlockedCount 0, guardFindingsCount 0; (2) meta with guard with findings and filesBlocked → returned event has correct guardBlockedCount and guardFindingsCount; (3) meta.modelId empty string → event.model null. Use toUUIDv7, toISOTimestamp, toRepoId, toTokenCount, toMilliseconds, TASK_CLASS, INCLUSION_TIER for fixtures.

**Verify:** `pnpm test shared/src/core/__tests__/build-telemetry-event.test.ts` passes.

### Step 4: Modify compile-handler to write telemetry

In `mcp/src/handlers/compile-handler.ts`, add second parameter `telemetryDeps: TelemetryDeps`. After `const result = await runner.run(request);`, compute repoId = toRepoId(telemetryDeps.stringHasher.hash(request.projectRoot)), event = buildTelemetryEvent(result.meta, request, telemetryDeps.idGenerator.generate(), telemetryDeps.clock.now(), repoId). In try/catch, call telemetryDeps.telemetryStore.write(event); on catch log at warn and continue. Then return the existing response.

**Verify:** Handler compiles; `pnpm typecheck` passes.

### Step 5: Pass telemetry deps in MCP server

In `mcp/src/server.ts`, in createMcpServer, call createCompileHandler(compilationRunner, { telemetryStore: scope.telemetryStore, clock: scope.clock, idGenerator: scope.idGenerator, stringHasher: sha256Adapter }).

**Verify:** `pnpm typecheck` and `pnpm test` (mcp) pass.

### Step 6: Modify compile command to accept and use telemetryDeps

In `cli/src/commands/compile.ts`, add optional third parameter `telemetryDeps?: TelemetryDeps`. After `const result = await runner.run(request);`, if telemetryDeps is defined, compute repoId and event the same way as in the handler and call telemetryDeps.telemetryStore.write(event) in try/catch (warn on catch). Then write compiledPrompt to stdout as today.

**Verify:** `pnpm typecheck` passes; existing compile tests still call compileCommand with two args and still pass.

### Step 7: Change createCompilationRunner return and pass telemetryDeps in CLI main

In `cli/src/main.ts`, change createCompilationRunner so it returns `{ runner, scope, stringHasher }` (runner = new CompilationRunnerImpl(...), scope and stringHasher from createScopeAndDeps / local Sha256Adapter). In the compile action, const result = createCompilationRunner(args.projectRoot); call compileCommand(args, result.runner, { telemetryStore: result.scope.telemetryStore, clock: result.scope.clock, idGenerator: result.scope.idGenerator, stringHasher: result.stringHasher }).

**Verify:** `pnpm typecheck` passes; compile command still runs (manual or test).

### Step 8: Tests for compile command and handler

In `cli/src/commands/__tests__/compile.test.ts`, ensure compileCommand(parsed, stubRunner) with two args still works. Add a test: pass a mock telemetryDeps with a mock telemetryStore (write recorded); call compileCommand with stub runner that returns a result and the mock deps; assert write was called once and the event shape matches (taskClass, tokensRaw, tokensCompiled, cacheHit, etc.). In `mcp/src/handlers/__tests__/compile-handler.test.ts`, add a test: createCompileHandler(runner, telemetryDeps) with mock runner returning a result and mock telemetryDeps; invoke the returned handler with valid args; assert telemetryDeps.telemetryStore.write was called once with an event whose taskClass, tokensRaw, tokensCompiled, cacheHit match the runner result.meta.

**Verify:** `pnpm test` for cli and mcp passes.

### Step 9: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                             | Description                                                              |
| ------------------------------------- | ------------------------------------------------------------------------ |
| buildTelemetryEvent guard null        | guardBlockedCount 0, guardFindingsCount 0 when meta.guard is null        |
| buildTelemetryEvent guard with counts | Correct guardBlockedCount and guardFindingsCount from meta.guard         |
| buildTelemetryEvent model null        | event.model null when meta.modelId is empty string                       |
| compileCommand with telemetryDeps     | Mock store write called once with event matching result.meta             |
| compileCommand without telemetryDeps  | Existing two-arg calls still pass; no write                              |
| createCompileHandler with deps        | Mock telemetryStore.write called after successful run with correct event |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] buildTelemetryEvent and TelemetryDeps match signatures above
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
