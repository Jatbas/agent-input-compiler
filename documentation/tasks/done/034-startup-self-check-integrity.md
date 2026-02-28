# Task 034: Startup self-check (integrity)

> **Status:** Done
> **Phase:** 0.5 — Quality Release (Phase I — Live Wiring)
> **Layer:** mcp (composition root) + shared (storage, core, types)
> **Depends on:** SessionTracker interface, SqliteSessionStore, 002-server-sessions migration

## Goal

On every MCP server startup, run an integrity check (trigger rule, session hook, hook script), persist the result in `server_sessions` (installation_ok, installation_notes), and surface it via `aic status` so misconfiguration is visible without blocking startup.

## Architecture Notes

- ADR-007: session_id remains UUIDv7. ADR-008: timestamps remain ISOTimestamp. New columns installation_ok (INTEGER 0/1), installation_notes (TEXT) added by migration 003.
- SessionTracker.startSession extended with two required params so the MCP composition root supplies the integrity result. No new core interface for the check — runStartupSelfCheck is a plain function in mcp/src (Cursor-specific paths, composition root may use node:fs/node:path).
- Design decision: integrity check as MCP-side function (simplicity); status reads latest server_sessions row for installation_ok/installation_notes.

## Files

| Action | Path                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| Create | `shared/src/storage/migrations/003-server-sessions-integrity.ts`                                                   |
| Create | `mcp/src/startup-self-check.ts`                                                                                    |
| Create | `mcp/src/__tests__/startup-self-check.test.ts`                                                                     |
| Modify | `shared/src/core/interfaces/session-tracker.interface.ts` (add installationOk, installationNotes to startSession)  |
| Modify | `shared/src/storage/sqlite-session-store.ts` (INSERT and startSession signature)                                   |
| Modify | `shared/src/storage/__tests__/sqlite-session-store.test.ts` (pass new params, assert new columns)                  |
| Modify | `shared/src/storage/open-database.ts` (add migration003 to run list)                                               |
| Modify | `shared/src/storage/create-project-scope.ts` (add sessionTracker: SessionTracker, SqliteSessionStore(db))          |
| Modify | `mcp/src/server.ts` (run self-check, startSession, backfillCrashedSessions)                                        |
| Modify | `shared/src/core/types/status-types.ts` (add installationOk, installationNotes to StatusAggregates)                |
| Modify | `shared/src/storage/sqlite-status-store.ts` (query latest server_sessions for installation_ok, installation_notes) |
| Modify | `cli/src/commands/status.ts` (display installation line)                                                           |
| Modify | `mcp/src/__tests__/server.test.ts` (assert server_sessions row has integrity fields)                               |
| Modify | `shared/src/storage/__tests__/sqlite-status-store.test.ts` (new aggregates)                                        |
| Modify | `shared/src/storage/__tests__/sqlite-migration-runner.test.ts` (apply 003, assert columns)                         |

## Interface / Signature

**SessionTracker (modified) — add two params to startSession:**

```typescript
import type { SessionId, ISOTimestamp } from "#core/types/identifiers.js";
import type { StopReason } from "#core/types/enums.js";

export interface SessionTracker {
  startSession(
    sessionId: SessionId,
    startedAt: ISOTimestamp,
    pid: number,
    version: string,
    installationOk: boolean,
    installationNotes: string,
  ): void;
  stopSession(
    sessionId: SessionId,
    stoppedAt: ISOTimestamp,
    stopReason: StopReason,
  ): void;
  backfillCrashedSessions(stoppedAt: ISOTimestamp): void;
}
```

**Wiring — runStartupSelfCheck and startup sequence:**

```typescript
// mcp/src/startup-self-check.ts
export function runStartupSelfCheck(projectRoot: AbsolutePath): {
  installationOk: boolean;
  installationNotes: string;
};
```

```typescript
// createMcpServer(projectRoot): after scope = createProjectScope(projectRoot)
const { installationOk, installationNotes } = runStartupSelfCheck(projectRoot);
const sessionId = toSessionId(scope.idGenerator.generate() as string);
const startedAt = scope.clock.now();
scope.sessionTracker.startSession(
  sessionId,
  startedAt,
  process.pid,
  "0.2.0",
  installationOk,
  installationNotes,
);
scope.sessionTracker.backfillCrashedSessions(startedAt);
```

**ProjectScope gains:** `readonly sessionTracker: SessionTracker`. createProjectScope instantiates `new SqliteSessionStore(db)` and adds it to the returned object.

## Dependent Types

### Tier 0 — verbatim

SessionTracker (see Interface section above). StatusAggregates gains two fields:

```typescript
readonly installationOk: boolean | null;
readonly installationNotes: string | null;
```

### Tier 1 — signature + path

| Type          | Path                                                   | Members | Purpose                     |
| ------------- | ------------------------------------------------------ | ------- | --------------------------- |
| `Clock`       | `shared/src/core/interfaces/clock.interface.ts`        | 3       | now, addMinutes, durationMs |
| `IdGenerator` | `shared/src/core/interfaces/id-generator.interface.ts` | 1       | generate(): UUIDv7          |

### Tier 2 — path-only

| Type           | Path                                   | Factory               |
| -------------- | -------------------------------------- | --------------------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts`       | `toAbsolutePath(raw)` |
| `SessionId`    | `shared/src/core/types/identifiers.ts` | `toSessionId(raw)`    |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | from Clock.now()      |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Migration 003

Create `shared/src/storage/migrations/003-server-sessions-integrity.ts`. Export `migration: Migration` with id `"003-server-sessions-integrity"`. In `up(db)`, run `db.exec("ALTER TABLE server_sessions ADD COLUMN installation_ok INTEGER");` and `db.exec("ALTER TABLE server_sessions ADD COLUMN installation_notes TEXT");`. In `down(db)`, leave the function body empty (MVP does not roll back this migration). Use type `Migration` from `#core/interfaces/migration.interface.js`.

**Verify:** File exists; migration object has id, up, down.

### Step 2: SessionTracker interface

In `shared/src/core/interfaces/session-tracker.interface.ts`, add two parameters to `startSession`: `installationOk: boolean`, `installationNotes: string` (after `version: string`).

**Verify:** Interface has startSession with six parameters; `pnpm typecheck` passes.

### Step 3: SqliteSessionStore

In `shared/src/storage/sqlite-session-store.ts`, update `startSession` to accept `installationOk: boolean` and `installationNotes: string`. Change the INSERT to include columns `installation_ok`, `installation_notes` with placeholders and bind `installationOk ? 1 : 0`, `installationNotes`.

**Verify:** INSERT has eight columns; bound params match; `pnpm typecheck` passes.

### Step 4: SqliteSessionStore tests

In `shared/src/storage/__tests__/sqlite-session-store.test.ts`, run migration 003 in setup (import and apply `migration003.up(db)` after 002). In every test that calls `startSession`, add arguments `true` and `""` (or `false` and a non-empty string for one test). In the test that asserts persisted row columns, extend the SELECT to include `installation_ok`, `installation_notes` and assert their values.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-session-store.test.ts` passes.

### Step 5: open-database

In `shared/src/storage/open-database.ts`, import `migration as migration003` from `#storage/migrations/003-server-sessions-integrity.js` and change the `migrationRunner.run(db, [...])` call to pass `[migration001, migration002, migration003]`.

**Verify:** `pnpm typecheck` passes; openDatabase runs all three migrations.

### Step 6: create-project-scope

In `shared/src/storage/create-project-scope.ts`, add `SessionTracker` and `SqliteSessionStore` to imports. Add `readonly sessionTracker: SessionTracker` to the `ProjectScope` interface. In `createProjectScope`, after opening the db, instantiate `const sessionTracker = new SqliteSessionStore(db)` and include `sessionTracker` in the returned object.

**Verify:** ProjectScope has sessionTracker; `pnpm typecheck` passes.

### Step 7: startup-self-check

Create `mcp/src/startup-self-check.ts`. Import `path` from `node:path`, `fs` from `node:fs`, and type `AbsolutePath` from `@aic/shared/core/types/paths.js`. Export function `runStartupSelfCheck(projectRoot: AbsolutePath): { installationOk: boolean; installationNotes: string }`. Implement: (1) triggerPath = path.join(projectRoot, ".cursor", "rules", "aic.mdc"); triggerExists = fs.existsSync(triggerPath). (2) hooksPath = path.join(projectRoot, ".cursor", "hooks", "hooks.json"); hooksExist = fs.existsSync(hooksPath). If hooksExist, content = fs.readFileSync(hooksPath, "utf8"), parsed = JSON.parse(content), sessionStartHasCompile = Array.isArray(parsed?.hooks?.sessionStart) && parsed.hooks.sessionStart.some((entry: { command?: string }) => String(entry?.command ?? "").includes("AIC-compile-context.cjs")). Else sessionStartHasCompile = false. (3) hookScriptPath = path.join(projectRoot, ".cursor", "hooks", "AIC-compile-context.cjs"); hookScriptExists = fs.existsSync(hookScriptPath). Build notes array: if !triggerExists push "trigger rule not found — run aic init"; if !hooksExist || !sessionStartHasCompile push "session hook not configured"; if !hookScriptExists push "hook script missing". installationOk = notes.length === 0; installationNotes = notes.join("; ") or "". Return { installationOk, installationNotes }.

**Verify:** File exists; runStartupSelfCheck returns object with both fields; `pnpm typecheck` passes.

### Step 8: server.ts startup sequence

In `mcp/src/server.ts`, import `runStartupSelfCheck` from `./startup-self-check.js` and `toSessionId` from `@aic/shared/core/types/identifiers.js`. In `createMcpServer`, after `const scope = createProjectScope(projectRoot);`, call `const { installationOk, installationNotes } = runStartupSelfCheck(projectRoot);`, then `const sessionId = toSessionId(scope.idGenerator.generate() as string);`, `const startedAt = scope.clock.now();`, `scope.sessionTracker.startSession(sessionId, startedAt, process.pid, "0.2.0", installationOk, installationNotes);`, `scope.sessionTracker.backfillCrashedSessions(startedAt);`. Do this before building deps and creating the server so the session row exists before any tool runs.

**Verify:** createMcpServer runs without throw; a call to createMcpServer then querying scope.db for server_sessions shows one row with non-null installation_ok and installation_notes.

### Step 9: StatusAggregates

In `shared/src/core/types/status-types.ts`, add to the `StatusAggregates` interface: `readonly installationOk: boolean | null;` and `readonly installationNotes: string | null;`.

**Verify:** Type has the two new fields; `pnpm typecheck` passes.

### Step 10: SqliteStatusStore getSummary

In `shared/src/storage/sqlite-status-store.ts`, after building lastCompilation, query the latest server_sessions row: `SELECT installation_ok, installation_notes FROM server_sessions ORDER BY started_at DESC LIMIT 1`. Parse the single row if present; set installationOk to row.installation_ok === 1, installationNotes to row.installation_notes ?? null (or null if no row). Include installationOk and installationNotes in the returned object.

**Verify:** getSummary return type includes the new fields; `pnpm typecheck` passes.

### Step 11: status command output

In `cli/src/commands/status.ts`, in `formatStatusOutput`, add a line for installation: when `aggregates.installationOk === true` output "Installation: OK"; when `aggregates.installationOk === false` and `aggregates.installationNotes` is non-null output "Installation: " + aggregates.installationNotes; when both are null output "Installation: —". Append this line to the array that is joined for the status output after the Trigger rule line.

**Verify:** status output includes Installation line; `pnpm typecheck` passes.

### Step 12: startup-self-check tests

Create `mcp/src/__tests__/startup-self-check.test.ts`. Use a temp directory created with fs.mkdtempSync(path.join(os.tmpdir(), "aic-startup-")). Tests: (1) all_missing_returns_false_and_notes — no .cursor or files, call runStartupSelfCheck, expect installationOk false and installationNotes to include "trigger rule not found", "session hook not configured", "hook script missing". (2) all_present_returns_true — create .cursor/rules/aic.mdc, .cursor/hooks/hooks.json with sessionStart containing command "node .cursor/hooks/AIC-compile-context.cjs", .cursor/hooks/AIC-compile-context.cjs; call runStartupSelfCheck, expect installationOk true and installationNotes "". (3) only_trigger_missing_notes_mention_trigger — create hooks and script only, call runStartupSelfCheck, expect installationOk false and notes to include "trigger rule not found". Use toAbsolutePath for the temp dir when calling runStartupSelfCheck.

**Verify:** `pnpm test mcp/src/__tests__/startup-self-check.test.ts` passes.

### Step 13: server.test session row

In `mcp/src/__tests__/server.test.ts`, add a test that creates a temp dir, calls createMcpServer(toAbsolutePath(tmpDir)), connects with InMemoryTransport, then uses createProjectScope(toAbsolutePath(tmpDir)) to get scope and runs a query on scope.db: `SELECT session_id, installation_ok, installation_notes FROM server_sessions ORDER BY started_at DESC LIMIT 1`. Assert one row exists and installation_ok is 0 or 1 and installation_notes is a string (possibly empty).

**Verify:** `pnpm test mcp/src/__tests__/server.test.ts` passes.

### Step 14: sqlite-status-store.test

In `shared/src/storage/__tests__/sqlite-status-store.test.ts`, ensure the test db has migration 003 applied (open-database already runs it when used by CLI/MCP; for the test that constructs db in-memory, run migration001, migration002, migration003 in setup). Assert that getSummary() return value includes installationOk and installationNotes (and that they are null when server_sessions is empty, or have values when a row exists with those columns set).

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-status-store.test.ts` passes.

### Step 15: migration-runner test for 003

In `shared/src/storage/__tests__/sqlite-migration-runner.test.ts`, add a test that applies migration001, migration002, and migration003 to a fresh db, then runs pragma table_info(server_sessions) and asserts the result includes column names installation_ok and installation_notes.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-migration-runner.test.ts` passes.

### Step 16: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                  | Description                                                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| all_missing_returns_false_and_notes        | runStartupSelfCheck with empty project root returns installationOk false and notes listing all three issues.                                                                |
| all_present_returns_true                   | With .cursor/rules/aic.mdc, hooks.json (sessionStart with AIC-compile-context.cjs), and hook script, runStartupSelfCheck returns installationOk true, installationNotes "". |
| only_trigger_missing_notes_mention_trigger | With only hooks and script present, notes include "trigger rule not found — run aic init".                                                                                  |
| startSession_persists_row                  | SqliteSessionStore startSession with installationOk true and installationNotes "" persists row with installation_ok 1, installation_notes "".                               |
| server_sessions_row_has_integrity          | After createMcpServer and connect, server_sessions has one row with non-null installation_ok and installation_notes.                                                        |
| getSummary_includes_installation           | SqliteStatusStore getSummary returns installationOk and installationNotes (null when no session row).                                                                       |
| migration_003_adds_columns                 | Applying migration 003 adds installation_ok and installation_notes to server_sessions.                                                                                      |

## Acceptance Criteria

- [ ] All files created or modified per Files table
- [ ] SessionTracker startSession has installationOk, installationNotes; SqliteSessionStore INSERT matches
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
