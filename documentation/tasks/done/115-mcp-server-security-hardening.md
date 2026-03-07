# Task 115: MCP Server Security Hardening

> **Status:** Done
> **Phase:** Phase R — MCP Server Security Hardening
> **Layer:** mcp + shared/storage
> **Depends on:** Schema hardening, Compilation timeout enforcement, Tool-invocation audit log, aic://last compiledPrompt removal (all in this task)

## Goal

Harden the AIC MCP server against path traversal, unconstrained input, missing timeout, absent audit trail, and prompt exposure: add path containment guards for projectRoot/configPath, constrain and sanitize intent/conversationId/modelId, enforce 30s compilation timeout, add tool_invocation_log and ToolInvocationLogStore, wrap aic_chat_summary in try/catch, and remove compiledPrompt from aic://last in favor of promptSummary.

## Architecture Notes

- ADR-007: UUIDv7 for tool_invocation_log id. ADR-008: ISOTimestamp for created_at.
- Path guards live in mcp/src/ (validation boundary per ADR-009); core/pipeline do not import them.
- ToolInvocationLogStore follows existing storage pattern (interface in core, impl in storage, composition root builds entry with scope.idGenerator and scope.clock).
- params_shape stores only key → typeof value (string like {"intent":"string"}), never raw intent or paths.
- Single task for all seven gaps per user scope; no new external dependencies.

## Files

| Action | Path                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `mcp/src/validate-project-root.ts`                                                                                                     |
| Create | `mcp/src/__tests__/validate-project-root.test.ts`                                                                                      |
| Create | `shared/src/storage/migrations/010-tool-invocation-log.ts`                                                                             |
| Create | `shared/src/core/interfaces/tool-invocation-log-store.interface.ts`                                                                    |
| Create | `shared/src/core/types/tool-invocation-log-entry.ts`                                                                                   |
| Create | `shared/src/storage/sqlite-tool-invocation-log-store.ts`                                                                               |
| Create | `shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts`                                                                |
| Modify | `mcp/src/schemas/compilation-request.ts` (configPath max/regex, conversationId max/regex, modelId max/regex)                           |
| Modify | `mcp/src/schemas/inspect-request.schema.ts` (configPath max/regex)                                                                     |
| Modify | `mcp/src/schemas/conversation-summary-request.ts` (conversationId max/regex)                                                           |
| Modify | `mcp/src/handlers/compile-handler.ts` (path guards, intent sanitization, timeout, audit record)                                        |
| Modify | `mcp/src/handlers/inspect-handler.ts` (path guards, audit record)                                                                      |
| Modify | `mcp/src/server.ts` (aic_chat_summary try/catch, aic://last promptSummary, wire ToolInvocationLogStore and record for all three tools) |

## Interface / Signature

```typescript
// Path guard module — no class; two exported functions.
// mcp/src/validate-project-root.ts
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";
import type { FilePath } from "@aic/shared/core/types/paths.js";

export function validateProjectRoot(raw: string): AbsolutePath;
export function validateConfigPath(raw: string, projectRoot: AbsolutePath): FilePath;
```

```typescript
// shared/src/core/interfaces/tool-invocation-log-store.interface.ts
import type { ToolInvocationLogEntry } from "#core/types/tool-invocation-log-entry.js";

export interface ToolInvocationLogStore {
  record(entry: ToolInvocationLogEntry): void;
}
```

```typescript
// shared/src/storage/sqlite-tool-invocation-log-store.ts
import type { ExecutableDb } from "#core/interfaces/executable-db.interface.js";
import type { ToolInvocationLogStore } from "#core/interfaces/tool-invocation-log-store.interface.js";
import type { ToolInvocationLogEntry } from "#core/types/tool-invocation-log-entry.js";

export class SqliteToolInvocationLogStore implements ToolInvocationLogStore {
  constructor(private readonly db: ExecutableDb) {}
  record(entry: ToolInvocationLogEntry): void;
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// shared/src/core/types/tool-invocation-log-entry.ts
import type { UUIDv7, ISOTimestamp, SessionId } from "#core/types/identifiers.js";

export interface ToolInvocationLogEntry {
  readonly id: UUIDv7;
  readonly createdAt: ISOTimestamp;
  readonly toolName: string;
  readonly sessionId: SessionId;
  readonly paramsShape: string;
}
```

### Tier 1 — signature + path

| Type               | Path                                  | Members         | Purpose                             |
| ------------------ | ------------------------------------- | --------------- | ----------------------------------- |
| `AbsolutePath`     | shared/src/core/types/paths.js        | toAbsolutePath  | validateProjectRoot return          |
| `FilePath`         | shared/src/core/types/paths.js        | toFilePath      | validateConfigPath return           |
| `StatusAggregates` | shared/src/core/types/status-types.js | lastCompilation | aic://last promptSummary.tokenCount |

### Tier 2 — path-only

| Type           | Path                                 | Factory                      |
| -------------- | ------------------------------------ | ---------------------------- |
| `UUIDv7`       | shared/src/core/types/identifiers.js | scope.idGenerator.generate() |
| `ISOTimestamp` | shared/src/core/types/identifiers.js | scope.clock.now()            |
| `SessionId`    | shared/src/core/types/identifiers.js | getSessionId()               |

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1.1: Path guard module (Gap 1)

Create `mcp/src/validate-project-root.ts`. Export `validateProjectRoot(raw: string): AbsolutePath`: resolve `raw` with `path.resolve(raw)`; if the resolved path does not start with `os.homedir()` or starts with any of `/etc`, `/usr`, `/bin`, `/sbin`, or on Windows `C:\\Windows`, throw `new McpError(ErrorCode.InvalidParams, "Invalid projectRoot")`; otherwise return `toAbsolutePath(resolved)`. Export `validateConfigPath(raw: string, projectRoot: AbsolutePath): FilePath`: resolve `raw` as `path.resolve(projectRoot, raw)` when `!path.isAbsolute(raw)` else `path.resolve(raw)`; apply the same homedir and sensitive-prefix checks; on violation throw the same McpError; otherwise return `toFilePath(resolved)`. Use `path` from `node:path` and `os` from `node:os`; import `McpError`, `ErrorCode` from `@modelcontextprotocol/sdk/types.js` and `toAbsolutePath`, `toFilePath` from `@aic/shared/core/types/paths.js`.

**Verify:** File exists; `pnpm typecheck` passes.

### Step 1.2: Path guard tests

Create `mcp/src/__tests__/validate-project-root.test.ts` with tests: validate_project_root_accepts_homedir_subpath (path under os.homedir() returns AbsolutePath), validate_project_root_rejects_escape (resolved path outside homedir throws McpError with ErrorCode.InvalidParams), validate_project_root_rejects_sensitive_prefix (resolved path under /etc or /usr throws same), validate_config_path_accepts_relative_under_project (relative path under validated projectRoot returns FilePath), validate_config_path_rejects_escape (configPath resolving outside containment throws).

**Verify:** File exists; tests run and pass.

### Step 1.3: Compilation request schema

In `mcp/src/schemas/compilation-request.ts`: set `configPath` to `z.string().max(4096).regex(/\.json$/).nullable().default(null)`; set `conversationId` to `z.string().max(128).regex(/^[\x20-\x7E]+$/).nullable().optional()`; set `modelId` to `z.string().max(256).regex(/^[\x20-\x7E]+$/).nullable().default(null)`.

**Verify:** Schema has new constraints; `pnpm typecheck` passes.

### Step 1.4: Inspect request schema

In `mcp/src/schemas/inspect-request.schema.ts`: set `configPath` to `z.string().max(4096).regex(/\.json$/).nullable().default(null)`.

**Verify:** Schema updated; `pnpm typecheck` passes.

### Step 1.5: Conversation-summary request schema

In `mcp/src/schemas/conversation-summary-request.ts`: set `conversationId` to `z.string().max(128).regex(/^[\x20-\x7E]+$/).optional()`.

**Verify:** Schema updated; `pnpm typecheck` passes.

### Step 1.6: Compile handler path guards and intent sanitization

In `mcp/src/handlers/compile-handler.ts`: after parsing and before building `request`, call `validateProjectRoot(args.projectRoot)` and use its return value as `request.projectRoot` instead of `toAbsolutePath(args.projectRoot)`. When `args.configPath !== null`, call `validateConfigPath(args.configPath, request.projectRoot)` and use its return for `request.configPath`; otherwise keep `null`. Sanitize intent before building request: set `intent` to `args.intent.replace(/[\x00-\x08\x0B-\x1F]/g, "")` and use that value in `request.intent`. Import `validateProjectRoot` and `validateConfigPath` from `../validate-project-root.js`.

**Verify:** Handler calls path guards and sanitizes intent; `pnpm typecheck` passes.

### Step 1.7: Inspect handler path guards

In `mcp/src/handlers/inspect-handler.ts`: replace `toAbsolutePath(args.projectRoot)` with a call to `validateProjectRoot(args.projectRoot)`; when `args.configPath` is non-null, call `validateConfigPath(args.configPath, projectRoot)` for `configPath` instead of `toFilePath(args.configPath)`. Import `validateProjectRoot` and `validateConfigPath` from `../validate-project-root.js`.

**Verify:** Handler calls path guards; `pnpm typecheck` passes.

### Step 2: aic_chat_summary error handler (Gap 4)

In `mcp/src/server.ts`, wrap the entire body of the `aic_chat_summary` tool callback (from `const parsed = ...` through `return Promise.resolve(...)`) in a try block. Add a catch block that throws `new McpError(ErrorCode.InternalError, "Internal error")`. Import `McpError` and `ErrorCode` from `@modelcontextprotocol/sdk/types.js` if not already present.

**Verify:** Handler has try/catch; catch throws McpError with InternalError. Test aic_chat_summary_catch_returns_internal_error asserts this.

### Step 3: Compilation timeout (Gap 5)

In `mcp/src/handlers/compile-handler.ts`, add a local helper `function rejectAfter(ms: number): Promise<never>` that returns `new Promise((_, reject) => setTimeout(() => reject(new TimeoutError("Compilation timed out after 30s")), ms))`. Replace `await runner.run(request)` with `await Promise.race([runner.run(request), rejectAfter(30_000)])`. Import `TimeoutError` from `@aic/shared/core/errors/timeout-error.js`.

**Verify:** `runner.run` is wrapped in `Promise.race` with `rejectAfter(30_000)`; TimeoutError is imported and used. Test compile_timeout_rejects_after_30s asserts rejection with TimeoutError.

### Step 4: Migration 010 tool_invocation_log (Gap 6)

Create `shared/src/storage/migrations/010-tool-invocation-log.ts`. Export `migration: Migration` with `id: "010-tool-invocation-log"`. In `up(db)`, run `db.exec` with SQL: `CREATE TABLE IF NOT EXISTS tool_invocation_log (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, tool_name TEXT NOT NULL, session_id TEXT NOT NULL, params_shape TEXT NOT NULL)`. Implement `down(db)` with `db.exec("DROP TABLE IF EXISTS tool_invocation_log")`. Import type `Migration` from `#core/interfaces/migration.interface.js`.

**Verify:** Migration file exists; up creates the five columns; down drops the table.

### Step 5.1: ToolInvocationLogEntry type

Create `shared/src/core/types/tool-invocation-log-entry.ts` with interface `ToolInvocationLogEntry`: readonly id (UUIDv7), createdAt (ISOTimestamp), toolName (string), sessionId (SessionId), paramsShape (string). Import types from `#core/types/identifiers.js`.

**Verify:** File exists; `pnpm typecheck` passes.

### Step 5.2: ToolInvocationLogStore interface

Create `shared/src/core/interfaces/tool-invocation-log-store.interface.ts` with method `record(entry: ToolInvocationLogEntry): void`. Import type from `#core/types/tool-invocation-log-entry.js`.

**Verify:** File exists; `pnpm typecheck` passes.

### Step 5.3: SqliteToolInvocationLogStore

Create `shared/src/storage/sqlite-tool-invocation-log-store.ts`: class `SqliteToolInvocationLogStore` implementing `ToolInvocationLogStore`, constructor `(private readonly db: ExecutableDb)`, method `record(entry)` that runs `db.prepare("INSERT INTO tool_invocation_log (id, created_at, tool_name, session_id, params_shape) VALUES (?, ?, ?, ?, ?)").run(entry.id, entry.createdAt, entry.toolName, entry.sessionId, entry.paramsShape)`.

**Verify:** File exists; `pnpm typecheck` passes.

### Step 5.4: SqliteToolInvocationLogStore test

Create `shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts`: use in-memory Database, run migration 010 up, instantiate `SqliteToolInvocationLogStore(db)`, build an entry with `toUUIDv7`, `toISOTimestamp`, `toSessionId`, call `record(entry)`, then `db.prepare("SELECT * FROM tool_invocation_log WHERE id = ?").get(entry.id)` and assert one row with correct columns. Test sqlite_tool_invocation_log_store_record.

**Verify:** Test file exists; test runs and passes.

### Step 5.5: Wire ToolInvocationLogStore in server

In `mcp/src/server.ts`: after `scope` is created (where scope is the return of createProjectScope(projectRoot)), add `const toolInvocationLogStore = new SqliteToolInvocationLogStore(scope.db)`. Extend `createCompileHandler` to accept `toolInvocationLogStore`, `clock: Clock`, and `idGenerator: IdGenerator` as additional parameters (after `modelIdOverride`). Extend `handleInspect` to accept `toolInvocationLogStore`, `clock`, `idGenerator`, and `getSessionId` after `inspectRunner`. When registering tools, pass `toolInvocationLogStore`, `scope.clock`, `scope.idGenerator`, and `getSessionId` into both. Inside the compile handler, after path validation and building `request`, build `paramsShape = JSON.stringify(Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v])))` and call `toolInvocationLogStore.record({ id: idGenerator.generate(), createdAt: clock.now(), toolName: "aic_compile", sessionId: getSessionId(), paramsShape })`. Inside `handleInspect`, after path validation, build `paramsShape` from `args` the same way and call `toolInvocationLogStore.record` with `toolName: "aic_inspect"`. In the `aic_chat_summary` callback, after parse, build `paramsShape` from parsed and call `toolInvocationLogStore.record({ id: scope.idGenerator.generate(), createdAt: scope.clock.now(), toolName: "aic_chat_summary", sessionId: getSessionId(), paramsShape })`.

Create `shared/src/storage/__tests__/sqlite-tool-invocation-log-store.test.ts`: use in-memory Database, run migration 010 up, instantiate `SqliteToolInvocationLogStore(db)`, build an entry with `toUUIDv7`/`toISOTimestamp`/`toSessionId`, call `record(entry)`, then `db.prepare("SELECT * FROM tool_invocation_log WHERE id = ?").get(entry.id)` and assert one row with correct columns.

**Verify:** Server instantiates the store and calls record for all three tools with params_shape built from typeof only; `pnpm typecheck` and tests pass.

### Step 6: aic://last remove compiledPrompt (Gap 7)

In `mcp/src/server.ts`, in the `aic://last` resource handler: remove the `lastPromptPath` variable and all `fs.readFileSync`/`fs.existsSync` logic for last-compiled-prompt.txt. Remove `compiledPrompt` from the JSON response. Add `promptSummary: { tokenCount: summary.lastCompilation?.tokensCompiled ?? null, guardPassed: null }` to the JSON returned. Keep `compilationCount` and `lastCompilation` as they are.

**Verify:** Resource handler does not read last-compiled-prompt.txt; response includes promptSummary with tokenCount and guardPassed; response does not include compiledPrompt. Test aic_last_no_compiled_prompt asserts promptSummary present and compiledPrompt absent.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                           | Description                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| validate_project_root_accepts_homedir_subpath       | Valid path under os.homedir() returns AbsolutePath                                                        |
| validate_project_root_rejects_escape                | Path resolving outside homedir throws McpError InvalidParams                                              |
| validate_project_root_rejects_sensitive_prefix      | Path under /etc or /usr throws McpError InvalidParams                                                     |
| validate_config_path_accepts_relative_under_project | Relative path under validated projectRoot returns FilePath                                                |
| validate_config_path_rejects_escape                 | configPath resolving outside containment throws McpError InvalidParams                                    |
| sqlite_tool_invocation_log_store_record             | record(entry) then SELECT yields one row with correct id, created_at, tool_name, session_id, params_shape |
| aic_chat_summary_catch_returns_internal_error       | When getConversationSummary throws, handler returns McpError InternalError                                |
| compile_timeout_rejects_after_30s                   | Promise.race with rejectAfter(30_000) rejects with TimeoutError when runner never resolves                |
| aic_last_no_compiled_prompt                         | aic://last response has promptSummary.tokenCount and no compiledPrompt field                              |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Path guards validateProjectRoot and validateConfigPath throw on escape or sensitive prefix
- [ ] All three schemas have configPath/conversationId/modelId constraints as specified
- [ ] compile-handler sanitizes intent and uses Promise.race with 30s timeout
- [ ] aic_chat_summary wrapped in try/catch returning McpError on throw
- [ ] Migration 010 creates tool_invocation_log; ToolInvocationLogStore records after validation for all three tools with params_shape as typeof-only
- [ ] aic://last returns promptSummary only; no compiledPrompt or fs read of last-compiled-prompt.txt
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
