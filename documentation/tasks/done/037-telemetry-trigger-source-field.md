# Task 037: Telemetry triggerSource field

> **Status:** Done
> **Phase:** Phase I — Live Wiring (mvp-progress.md)
> **Layer:** core + storage + pipeline + mcp + cli
> **Depends on:** Telemetry write on compile, CompilationLogStore, compile handler, compile command

## Goal

Add an optional `triggerSource` field to `CompilationRequest`, persist it on `compilation_log` as `trigger_source`, and accept it at the MCP and CLI boundaries so telemetry can distinguish how compilations were triggered (session_start, prompt_submit, tool_gate, subagent_start, cli, model_initiated).

## Architecture Notes

- ADR-007/008: IDs and timestamps unchanged; new column is nullable TEXT, no FK.
- Pipeline ignores triggerSource; only compilation log and telemetry path read it.
- Validation at boundary only: Zod in MCP schema and CLI schema; core trusts branded types.
- GAP-08 (documentation/gaps.md) specifies this implementation; trigger_source on compilation_log only, not telemetry_events.

## Files

| Action | Path                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- |
| Create | `shared/src/storage/migrations/005-trigger-source.ts`                                           |
| Modify | `shared/src/core/types/enums.ts` (add TRIGGER_SOURCE and TriggerSource type)                    |
| Modify | `shared/src/core/types/compilation-types.ts` (add optional triggerSource to CompilationRequest) |
| Modify | `shared/src/core/types/compilation-log-entry.ts` (add optional triggerSource)                   |
| Modify | `shared/src/storage/open-database.ts` (register migration 005)                                  |
| Modify | `shared/src/pipeline/compilation-runner.ts` (buildLogEntry, recordCompilationAndFindings, run)  |
| Modify | `shared/src/storage/sqlite-compilation-log-store.ts` (INSERT and run include trigger_source)    |
| Modify | `mcp/src/schemas/compilation-request.ts` (optional triggerSource in schema)                     |
| Modify | `mcp/src/handlers/compile-handler.ts` (pass args.triggerSource into request)                    |
| Modify | `cli/src/schemas/compilation-args.ts` (optional triggerSource with default "cli")               |
| Modify | `cli/src/commands/compile.ts` (set request.triggerSource from args)                             |
| Modify | `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts` (tests for trigger_source)  |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (assert triggerSource in entry)      |
| Modify | `mcp/src/__tests__/server.test.ts` (aic_compile with optional triggerSource)                    |
| Modify | `cli/src/commands/__tests__/compile.test.ts` (assert request.triggerSource passed to runner)    |

## Interface / Signature

**1. New enum (enums.ts)** — add after STOP_REASON:

```typescript
export const TRIGGER_SOURCE = {
  SESSION_START: "session_start",
  PROMPT_SUBMIT: "prompt_submit",
  TOOL_GATE: "tool_gate",
  SUBAGENT_START: "subagent_start",
  CLI: "cli",
  MODEL_INITIATED: "model_initiated",
} as const;
export type TriggerSource = (typeof TRIGGER_SOURCE)[keyof typeof TRIGGER_SOURCE];
```

**2. CompilationRequest (compilation-types.ts)** — add optional triggerSource; all other members unchanged. Final interface must match:

```typescript
export interface CompilationRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly modelId: string | null;
  readonly editorId: EditorId;
  readonly configPath: FilePath | null;
  readonly sessionId?: SessionId;
  readonly stepIndex?: StepIndex;
  readonly stepIntent?: string;
  readonly previousFiles?: readonly RelativePath[];
  readonly toolOutputs?: readonly ToolOutput[];
  readonly conversationTokens?: TokenCount;
  readonly triggerSource?: TriggerSource;
}
```

**3. CompilationLogEntry (compilation-log-entry.ts)** — add optional triggerSource; all other members unchanged. Final interface must match:

```typescript
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
  readonly sessionId: SessionId | null;
  readonly configHash: string | null;
  readonly createdAt: ISOTimestamp;
  readonly triggerSource?: TriggerSource | null;
}
```

**4. compilation-runner.ts — function signatures after change.** Cross-check implementation against these exact signatures:

```typescript
function buildLogEntry(
  compilationId: UUIDv7,
  meta: CompilationMeta,
  createdAt: ISOTimestamp,
  sessionId: SessionId | null,
  configHash: string | null,
  triggerSource: TriggerSource | null,
): CompilationLogEntry;

function recordCompilationAndFindings(
  compilationLogStore: CompilationLogStore,
  guardStore: GuardStore,
  idGenerator: IdGenerator,
  clock: Clock,
  meta: CompilationMeta,
  findings: readonly GuardFinding[],
  sessionId: SessionId | null,
  configHash: string | null,
  triggerSource: TriggerSource | null,
): UUIDv7;
```

**5. CompilationRunner.run** — passes `request.triggerSource ?? null` as the final argument to both call sites of `recordCompilationAndFindings` (cache-hit path and fresh path). No other signature change to the class.

## Dependent Types

### Tier 0 — verbatim

Only the new enum and the added fields are new. Existing types (CompilationRequest, CompilationLogEntry) are in core/types as listed above; add the single optional property to each.

### Tier 1 — signature + path

| Type            | Path                             | Members                     | Purpose                       |
| --------------- | -------------------------------- | --------------------------- | ----------------------------- |
| `TriggerSource` | `shared/src/core/types/enums.ts` | const TRIGGER_SOURCE + type | Enum for trigger source value |

### Tier 2 — path-only

| Type                               | Path | Factory |
| ---------------------------------- | ---- | ------- |
| (existing branded types unchanged) | —    | —       |

## Config Changes

- **shared/package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add TRIGGER_SOURCE and TriggerSource type

In `shared/src/core/types/enums.ts`, add after `STOP_REASON` the const object `TRIGGER_SOURCE` with keys SESSION_START, PROMPT_SUBMIT, TOOL_GATE, SUBAGENT_START, CLI, MODEL_INITIATED and string values `"session_start"`, `"prompt_submit"`, `"tool_gate"`, `"subagent_start"`, `"cli"`, `"model_initiated"`. Export type `TriggerSource` as `(typeof TRIGGER_SOURCE)[keyof typeof TRIGGER_SOURCE]`.

**Verify:** TypeScript compiles; no lint errors.

### Step 2: Add optional triggerSource to CompilationRequest

In `shared/src/core/types/compilation-types.ts`, import `TriggerSource` from enums and add `readonly triggerSource?: TriggerSource;` to the `CompilationRequest` interface.

**Verify:** CompilationRequest in source matches the interface in the Interface/Signature section (including triggerSource); typecheck passes.

### Step 3: Add optional triggerSource to CompilationLogEntry

In `shared/src/core/types/compilation-log-entry.ts`, import `TriggerSource` from enums and add `readonly triggerSource?: TriggerSource | null;` to the `CompilationLogEntry` interface.

**Verify:** CompilationLogEntry in source matches the interface in the Interface/Signature section (including triggerSource); typecheck passes.

### Step 4: Create migration 005-trigger-source.ts

Create `shared/src/storage/migrations/005-trigger-source.ts`. Copy the `hasColumn` and `safeAddColumn` helpers from `004-normalize-telemetry.ts` (same signatures). In `up(db)`, call `safeAddColumn(db, "compilation_log", "trigger_source", "TEXT")`. Export migration with `id: "005-trigger-source"`. Implement `down` as no-op (MVP does not roll back).

**Verify:** File exists; migration exports `Migration`-shaped object.

### Step 5: Register migration 005 in open-database.ts

In `shared/src/storage/open-database.ts`, import `migration as migration005` from the new migration file and add `migration005` to the array passed to `migrationRunner.run()` (after migration004).

**Verify:** typecheck passes; migration list includes 005.

### Step 6: Extend buildLogEntry and recordCompilationAndFindings with triggerSource

In `shared/src/pipeline/compilation-runner.ts`: Add parameter `triggerSource: TriggerSource | null` as the last parameter of `buildLogEntry`; include `triggerSource` in the returned object. Add parameter `triggerSource: TriggerSource | null` to `recordCompilationAndFindings` and pass it into `buildLogEntry`. In both call sites of `recordCompilationAndFindings` (cache hit and fresh), pass `request.triggerSource ?? null` as the new argument. Import `TriggerSource` from core/types/enums if needed for typing.

**Verify:** buildLogEntry and recordCompilationAndFindings in source match the function signatures in the Interface/Signature section; typecheck passes.

### Step 7: SqliteCompilationLogStore.record — add trigger_source column

In `shared/src/storage/sqlite-compilation-log-store.ts`, add `trigger_source` to the INSERT column list and add `entry.triggerSource ?? null` to the corresponding `stmt.run()` argument list (same order as columns).

**Verify:** Column count and run() argument count match; typecheck passes.

### Step 8a: MCP schema — optional triggerSource

In `mcp/src/schemas/compilation-request.ts`, add optional field: `triggerSource: z.enum(["session_start", "prompt_submit", "tool_gate", "subagent_start", "cli", "model_initiated"]).optional()`.

**Verify:** Schema still validates args without triggerSource; with triggerSource validates.

### Step 8b: MCP compile-handler — pass triggerSource into request

In `mcp/src/handlers/compile-handler.ts`, extend the `request` object built for `runner.run()` with `...(args.triggerSource !== undefined && args.triggerSource !== null ? { triggerSource: args.triggerSource as TriggerSource } : {})`. Import `TriggerSource` from shared core types/enums.

**Verify:** typecheck passes; request.triggerSource is set when args.triggerSource is provided.

### Step 9a: CLI schema — optional triggerSource default "cli"

In `cli/src/schemas/compilation-args.ts`, extend CompilationArgsSchema with `triggerSource: z.enum(["session_start", "prompt_submit", "tool_gate", "subagent_start", "cli", "model_initiated"]).default("cli")` so CLI compile always has a trigger source.

**Verify:** Parsed args include triggerSource with default "cli".

### Step 9b: CLI compile command — set request.triggerSource

In `cli/src/commands/compile.ts`, add `triggerSource: args.triggerSource` to the request object passed to `runner.run()`. Import `TriggerSource` from `@aic/shared/core/types/enums.js` and type the request object so that the triggerSource property is `TriggerSource` (args.triggerSource from the schema has the correct runtime value).

**Verify:** request.triggerSource is set from args; typecheck passes.

### Step 10: Tests — sqlite-compilation-log-store

In `shared/src/storage/__tests__/sqlite-compilation-log-store.test.ts`: Ensure setup runs migration 005 (import and run migration005.up(db) after 004). Add test that records an entry with `triggerSource: TRIGGER_SOURCE.CLI` and assert the row's `trigger_source` column equals `"cli"`. Add test that records an entry without triggerSource (omit the field or set null) and assert `trigger_source` is null.

**Verify:** `pnpm test` for sqlite-compilation-log-store passes.

### Step 11: Tests — compilation-runner

In `shared/src/pipeline/__tests__/compilation-runner.test.ts`: In tests that call `runner.run(request)`, ensure the mock `compilationLogStore.record` is asserted to have been called with an entry that includes `triggerSource` when request.triggerSource is set, and that entry.triggerSource is null or undefined when request.triggerSource is absent. Add or adjust one test that passes `request.triggerSource: TRIGGER_SOURCE.CLI` and assert the recorded entry has `triggerSource: "cli"` (or TRIGGER_SOURCE.CLI).

**Verify:** compilation-runner tests pass.

### Step 12: Tests — MCP aic_compile with optional triggerSource

In `mcp/src/__tests__/server.test.ts`, add a test that calls `client.callTool({ name: "aic_compile", arguments: { intent: "fix bug", projectRoot: tmpDir, triggerSource: "session_start" } })` and asserts the call succeeds (no throw, result content non-empty). Existing test without triggerSource continues to pass.

**Verify:** MCP server tests pass.

### Step 13: Tests — CLI compile command triggerSource

In `cli/src/commands/__tests__/compile.test.ts`, add a test that calls `compileCommand` with parsed args that include triggerSource (from CompilationArgsSchema parse) and a mock runner that captures the request; assert the request object passed to `runner.run()` includes `triggerSource` with the expected value (default "cli" when not overridden).

**Verify:** CLI compile tests pass.

### Step 14: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`.
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                  | Description                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| record_with_trigger_source_persists_column | SqliteCompilationLogStore: record entry with triggerSource set, assert trigger_source column value         |
| record_without_trigger_source_stores_null  | SqliteCompilationLogStore: record entry without triggerSource, assert trigger_source is NULL               |
| runner_passes_trigger_source_to_entry      | CompilationRunner: run with request.triggerSource set, assert store.record called with entry.triggerSource |
| mcp_accepts_optional_trigger_source        | MCP: callTool aic_compile with triggerSource in args, assert success                                       |
| cli_sets_trigger_source                    | CLI compile: request.triggerSource set from args (default or explicit)                                     |

## Acceptance Criteria

- [ ] All files created/modified per Files table
- [ ] Interface/Signature section: implementation matches all code blocks (CompilationRequest, CompilationLogEntry, buildLogEntry, recordCompilationAndFindings)
- [ ] TRIGGER_SOURCE enum and TriggerSource type in enums.ts
- [ ] CompilationRequest and CompilationLogEntry match the interfaces in this task
- [ ] Migration 005 adds trigger_source to compilation_log; open-database runs 005
- [ ] buildLogEntry and recordCompilationAndFindings accept and pass triggerSource; run() passes request.triggerSource ?? null
- [ ] SqliteCompilationLogStore INSERT and run() include trigger_source
- [ ] MCP schema and handler pass through optional triggerSource; CLI schema default "cli", compile command sets request.triggerSource
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
