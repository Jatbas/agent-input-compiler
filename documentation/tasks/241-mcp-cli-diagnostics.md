# Task 1774134420: MCP binary diagnostic CLI

> **Status:** Pending
> **Phase:** 1.0 OSS Release (ad-hoc — restores fast shell diagnostics alongside MCP)
> **Layer:** mcp (+ shared storage entrypoint)
> **Depends on:** None
> **Research:** none

## Goal

Add `status`, `last`, `chat-summary`, and `projects` subcommands to the `@jatbas/aic` binary that reuse the same payload logic as `aic_status`, `aic_last`, project-level chat aggregates, and `aic_projects`, print human-readable terminal tables to stdout, open the global database in SQLite read-only mode, and leave `serve` / default / `init` behavior unchanged; then update canonical Prompt Commands to instruct shell execution via `npx @jatbas/aic` instead of MCP tools.

## Architecture Notes

- ADR-009: Zod stays at MCP boundary; CLI argv parsing uses a finite manual parser for four subcommands plus `init` — no new Zod schemas for argv.
- ADR-010: Use `toAbsolutePath`, `toProjectId`, `toConversationId`, `NodePathAdapter` for paths and IDs at the mcp boundary.
- Reuse `SqliteStatusStore` query methods; extract shared payload assembly so MCP tools call the same functions as CLI (no duplicated SQL).
- `getLastPayload` conversation scoping via `lastConversationIdRef` exists only in long-lived MCP; CLI always uses project-level last compilation (same as MCP when the ref is still `null`).
- CLI `chat-summary` prints project-scoped aggregates from `getSummary()` for the resolved `projectId`, formatted with the same column labels as the chat summary prompt command (project path, compilation counts, token totals, rates, last compilation, top task classes).
- `getUpdateInfo` gains a `persistSideEffects` flag defaulting to `true`; CLI passes `false` so npm registry reads still run but `.aic` cache and message files are not written.
- Export `listProjectsFromDb(db: ExecutableDb)` from `sqlite-status-store.ts` by refactoring `listProjects()` so CLI does not need a dummy `ProjectId` for global listing.
- argv dispatch uses a `Record<string, CliHandler>` handler map (no `if` / `else if` chain with three or more branches).
- Relative time strings use `Clock.durationMs` between `ISOTimestamp` values and `clock.now()` — no `new Date()` or `Date.now()` in `mcp/src`.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `shared/src/storage/open-database.ts` (add `openDatabaseReadOnly`) |
| Create | `shared/src/storage/lookup-project-id-by-root.ts` (`lookupProjectIdByNormalisedRoot`) |
| Modify | `shared/src/storage/sqlite-status-store.ts` (export `listProjectsFromDb`, delegate `listProjects`) |
| Modify | `shared/src/storage/__tests__/sqlite-status-store.test.ts` (cover `listProjectsFromDb`) |
| Modify | `mcp/src/latest-version-check.ts` (`getUpdateInfo` side-effect flag) |
| Modify | `mcp/src/__tests__/latest-version-check.test.ts` (new behavior for `persistSideEffects: false`) |
| Create | `mcp/src/diagnostic-payloads.ts` |
| Create | `mcp/src/format-diagnostic-output.ts` |
| Create | `mcp/src/cli-diagnostics.ts` |
| Create | `mcp/src/__tests__/cli-diagnostics.test.ts` |
| Modify | `mcp/src/server.ts` (extract payload builders, wire tools, argv branch) |
| Modify | `mcp/src/install-trigger-rule.ts` (Prompt Commands → shell) |
| Modify | `.cursor/rules/AIC-architect.mdc` (Prompt Commands → shell) |
| Modify | `.claude/CLAUDE.md` (Prompt Commands → shell) |
| Modify | `integrations/claude/install.cjs` (`CLAUDE_MD_TEMPLATE` Prompt Commands → shell) |

## Wiring Specification

Classes the executor already instantiates in `createMcpServer` today (signatures unchanged except where steps add extracted helpers):

```typescript
// @jatbas/aic-core/adapters/node-path-adapter.js
export class NodePathAdapter implements ProjectRootNormaliser {
  constructor();
  normalise(raw: string): AbsolutePath;
}

// @jatbas/aic-core/storage/sqlite-status-store.js
export class SqliteStatusStore implements StatusStore, GlobalStatusQueries {
  constructor(projectId: ProjectId, db: ExecutableDb, clock: Clock);
  getGlobalSummary(): GlobalStatusAggregates;
  getSummary(): StatusAggregates;
  getConversationSummary(conversationId: ConversationId): ConversationSummary | null;
  getProjectIdForConversation(conversationId: ConversationId): ProjectId | null;
  getProjectRoot(projectId: ProjectId): AbsolutePath | null;
  listProjects(): readonly ProjectListItem[];
}

// @jatbas/aic-core/config/load-config-from-file.js
export class LoadConfigFromFile {
  constructor();
  load(projectRoot: AbsolutePath, configPath: FilePath | null): LoadConfigResult;
}
```

Exported entry signatures after the task:

```typescript
// mcp/src/server.ts
export function createMcpServer(
  projectRoot: AbsolutePath,
  db: ExecutableDb,
  clock: Clock,
  additionalProviders?: readonly LanguageProvider[],
  batchExitRef?: BatchExitRef,
): McpServer & { close(): Promise<void>; getEditorId(): EditorId };

export async function main(): Promise<void>;

// shared/src/storage/open-database.ts
export function openDatabase(dbPath: string, clock: Clock): ExecutableDb;
export function openDatabaseReadOnly(dbPath: string): ExecutableDb;
export function closeDatabase(db: ExecutableDb): void;

// shared/src/storage/lookup-project-id-by-root.ts
export function lookupProjectIdByNormalisedRoot(
  db: ExecutableDb,
  normalisedRoot: string,
): ProjectId | null;

// shared/src/storage/sqlite-status-store.ts
export function listProjectsFromDb(db: ExecutableDb): readonly ProjectListItem[];

// mcp/src/latest-version-check.ts
export async function getUpdateInfo(
  projectRoot: AbsolutePath,
  packageName: string,
  currentVersion: string,
  clock: Clock,
  options: { readonly persistSideEffects: boolean } | undefined,
): Promise<UpdateInfo>;

// mcp/src/cli-diagnostics.ts
export function runCliDiagnosticsAndExit(argv: readonly string[]): void;
```

External library (verified `node_modules/@types/better-sqlite3/index.d.ts`):

```typescript
import Database from "better-sqlite3";
// Constructor: new Database(filename: string, options?: Database.Options)
// Database.Options: { readonly?: boolean; fileMustExist?: boolean; ... }
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// shared/src/core/types/status-types.ts
export interface StatusAggregates {
  readonly compilationsTotal: number;
  readonly compilationsToday: number;
  readonly cacheHitRatePct: number | null;
  readonly avgReductionPct: number | null;
  readonly totalTokensRaw: number;
  readonly totalTokensCompiled: number;
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
    readonly editorId: string;
    readonly modelId: string | null;
  } | null;
  readonly installationOk: boolean | null;
  readonly installationNotes: string | null;
}

export interface GlobalStatusAggregates extends StatusAggregates {
  readonly projectsBreakdown?: readonly ProjectListItem[];
}

export interface ProjectListItem {
  readonly projectId: ProjectId;
  readonly projectRoot: AbsolutePath;
  readonly lastSeenAt: string;
  readonly compilationCount: number;
}

export interface ConversationSummary {
  readonly conversationId: string;
  readonly projectRoot: string;
  readonly compilationsInConversation: number;
  readonly cacheHitRatePct: number | null;
  readonly avgReductionPct: number | null;
  readonly totalTokensRaw: number;
  readonly totalTokensCompiled: number;
  readonly totalTokensSaved: number | null;
  readonly lastCompilationInConversation: {
    readonly intent: string;
    readonly filesSelected: number;
    readonly filesTotal: number;
    readonly tokensCompiled: number;
    readonly tokenReductionPct: number;
    readonly created_at: string;
    readonly editorId: string;
    readonly modelId: string | null;
  } | null;
  readonly topTaskClasses: readonly {
    readonly taskClass: string;
    readonly count: number;
  }[];
}
```

```typescript
// mcp/src/latest-version-check.ts
export interface UpdateInfo {
  readonly updateAvailable: string | null;
  readonly currentVersion: string;
  readonly updateMessage: string | null;
}
```

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `ExecutableDb` | `shared/src/core/interfaces/executable-db.interface.ts` | 2 | `exec`, `prepare` |
| `Clock` | `shared/src/core/interfaces/clock.interface.ts` | 3 | `now`, `addMinutes`, `durationMs` |
| `LoadConfigResult` | `shared/src/config/load-config-from-file.ts` | fields | `config.enabled` for `projectEnabled` |
| `McpServer` | `@modelcontextprotocol/sdk/server/mcp.js` | 3 | `tool`, `connect`, `server` |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts` | `toAbsolutePath(raw)` |
| `ProjectId` | `shared/src/core/types/identifiers.ts` | `toProjectId(raw)` |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | `toISOTimestamp(raw)` |

## Config Changes

- **shared/package.json:** no change (`exports` already `./*` → `./dist/*`).
- **mcp/package.json:** no change.
- **eslint.config.mjs:** no change.

## Steps

### Step 1: Read-only database open

In `shared/src/storage/open-database.ts`, add `openDatabaseReadOnly(dbPath: string): ExecutableDb` that constructs `better-sqlite3` with `{ readonly: true, fileMustExist: true }`, casts to `ExecutableDb`, and does not run `PRAGMA journal_mode`, `PRAGMA busy_timeout`, or `SqliteMigrationRunner`.

**Verify:** `pnpm exec tsc --noEmit -p shared` passes.

### Step 2: Project lookup by normalised root

Add `shared/src/storage/lookup-project-id-by-root.ts` exporting `lookupProjectIdByNormalisedRoot(db, normalisedRoot)` running `SELECT project_id FROM projects WHERE project_root = ? LIMIT 1`, returning `toProjectId` or `null`.

**Verify:** `pnpm exec tsc --noEmit -p shared` passes.

### Step 3: Global project list helper

In `shared/src/storage/sqlite-status-store.ts`, extract the SQL and row mapping used by `listProjects()` into an exported function `listProjectsFromDb(db: ExecutableDb): readonly ProjectListItem[]`. Implement `listProjects()` as `return listProjectsFromDb(this.db)`.

**Verify:** `pnpm exec tsc --noEmit -p shared` passes.

### Step 4: Storage tests for listProjectsFromDb

In `shared/src/storage/__tests__/sqlite-status-store.test.ts`, add one test that inserts two projects and asserts `listProjectsFromDb(db)` returns both rows with expected `compilationCount`.

**Verify:** `pnpm test shared/src/storage/__tests__/sqlite-status-store.test.ts` passes.

### Step 5: getUpdateInfo side-effect control

In `mcp/src/latest-version-check.ts`, add trailing parameter `options: { readonly persistSideEffects: boolean } | undefined` to `getUpdateInfo`. When `options` is `undefined` or `options.persistSideEffects` is `true`, keep current behavior. When `options.persistSideEffects` is `false`, read an existing cache file only when `readValidCache` returns a value, call a fetch helper that never writes `version-check-cache.json`, never call `writeMessageFile`, never call `ensureAicDir`, and return the same `UpdateInfo` shape as today.

**Verify:** `pnpm exec tsc --noEmit -p mcp` passes.

### Step 6: latest-version-check tests

In `mcp/src/__tests__/latest-version-check.test.ts`, add one test with a temp project root and `persistSideEffects: false` where no cache file exists before the call, `fetch` returns a newer semver, and after `getUpdateInfo` completes the path `$projectRoot/.aic/version-check-cache.json` does not exist.

**Verify:** `pnpm test mcp/src/__tests__/latest-version-check.test.ts` passes.

### Step 7: Diagnostic payload builders

Create `mcp/src/diagnostic-payloads.ts` exporting pure functions that assemble the same object shapes `createMcpServer` currently builds for `getStatusPayload`, `getLastPayload`, and the `aic_chat_summary` zero-id placeholder, plus a `buildProjectsPayload(db)` that returns `listProjectsFromDb(db)`. Accept explicit inputs (`ExecutableDb`, `Clock`, `AbsolutePath` project root, `ProjectId`, `UpdateInfo`, install scope values, `LoadConfigFromFile` instance, `NodePathAdapter`, budget max tokens, `conversationIdForLast: string | null`). Replace the inline closures inside `createMcpServer` with calls to these functions. Preserve the exact JSON field names and nesting expected by existing `server.test.ts` assertions.

**Verify:** `pnpm test mcp/src/__tests__/server.test.ts` passes.

### Step 8: Terminal formatters

Create `mcp/src/format-diagnostic-output.ts` exporting four functions that take the payload types above plus `Clock` and return single strings using fixed-width column layout, commas in large integers, one decimal place for percentages, `—` for nulls, and relative time via `clock.durationMs` for ISO timestamps. Include the same one-line headers the Prompt Commands section specifies (`Status = …`, `Chat = …`, `Last = …`, `Projects = …`).

**Verify:** `pnpm exec eslint mcp/src/format-diagnostic-output.ts` passes.

### Step 9: CLI runner

Create `mcp/src/cli-diagnostics.ts` exporting `runCliDiagnosticsAndExit(argv: readonly string[])`. Resolve global DB path `path.join(os.homedir(), ".aic", "aic.sqlite")`. If the file is missing, write a single stderr line and exit `1`. Open with `openDatabaseReadOnly`. Build `SystemClock`, `NodePathAdapter`, `LoadConfigFromFile`, read package name/version like `readPackageVersion` in `server.ts`. For `status`, resolve `projectRoot = toAbsolutePath(process.cwd())`, `projectId = lookupProjectIdByNormalisedRoot(db, normaliser.normalise(projectRoot))`; if `projectId` is `null`, write stderr that the project is unknown to AIC and exit `1`. Await `getUpdateInfo(projectRoot, packageName, packageVersion, clock, { persistSideEffects: false })`, assemble status payload via diagnostic builders, print `formatStatusTable`, `closeDatabase`, exit `0`. For `last`, same `projectId` resolution rule, pass `conversationId: null` into the last payload builder, print `formatLastTable`, exit `0`. For `chat-summary`, parse `--project` when present (next argv token) else use `process.cwd()`; resolve absolute path, normalise, lookup `projectId`, same exit `1` on miss; use `getSummary` via builders, print `formatChatSummaryTable`, exit `0`. For `projects`, print `formatProjectsTable(listProjectsFromDb(db))`, exit `0`. Unknown subcommand: stderr usage line, exit `1`.

**Verify:** `pnpm exec tsc --noEmit -p mcp` passes.

### Step 10: Wire argv in server entry

In `mcp/src/server.ts`, extend the `isEntry` block: keep `init` first; add handler map for `status`, `last`, `chat-summary`, `projects` calling `runCliDiagnosticsAndExit(process.argv.slice(2))`; `serve` and undefined `argv[2]` continue to call `main()` unchanged.

**Verify:** `pnpm test mcp/src/__tests__/server.test.ts` passes.

### Step 11: CLI integration tests

Add `mcp/src/__tests__/cli-diagnostics.test.ts` that assigns `process.env["HOME"]` to a temp directory, creates `$HOME/.aic/aic.sqlite` with `openDatabase` from `shared` using a writable file path, runs migrations, inserts a `projects` row whose `project_root` column equals `new NodePathAdapter().normalise(toAbsolutePath(projectTmpDir))`, sets `process.chdir(projectTmpDir)`, mocks `process.exit` and captures stdout from `runCliDiagnosticsAndExit(["status"])`, asserts captured output includes `Status =` and the mocked exit was called with code `0`.

**Verify:** `pnpm test mcp/src/__tests__/cli-diagnostics.test.ts` passes.

### Step 12: Prompt Commands documentation sync

Update Prompt Commands bullets in `mcp/src/install-trigger-rule.ts`, `.cursor/rules/AIC-architect.mdc`, `.claude/CLAUDE.md`, and `integrations/claude/install.cjs` (`CLAUDE_MD_TEMPLATE`) so each command instructs running Bash with `npx @jatbas/aic status`, `npx @jatbas/aic last`, `npx @jatbas/aic chat-summary --project <absolute workspace root>`, and `npx @jatbas/aic projects`, then relaying stdout using the same formatting rules (labels, commas, percentages, relative time, em dash). Remove MCP tool names from those four bullets. Keep `aic_compile` / hook language elsewhere unchanged.

**Verify:** Open `.cursor/rules/AIC-architect.mdc`, `.claude/CLAUDE.md`, `integrations/claude/install.cjs` (`CLAUDE_MD_TEMPLATE` region), and `mcp/src/install-trigger-rule.ts`. Under each `## Prompt Commands` heading, confirm every bullet uses `npx @jatbas/aic` and none of the four bullets names `aic_status`, `aic_last`, `aic_chat_summary`, or `aic_projects` as MCP tools.

### Step 13: Final verification

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`.

**Verify:** all pass with zero warnings and no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| `listProjectsFromDb_matches_listProjects` | Storage helper returns identical data to store method |
| `getUpdateInfo_no_persist_skips_cache_write` | False flag leaves cache file absent |
| `cli_status_unknown_project_exits_1` | stderr + exit code when project row missing |
| `cli_projects_prints_header` | stdout contains projects header line |
| `server_tools_json_unchanged` | Existing MCP tool JSON tests still pass |

## Acceptance Criteria

- [ ] All files created or modified per Files table
- [ ] `main()` and MCP stdio transport unchanged for default and `serve`
- [ ] `init` behavior unchanged
- [ ] MCP tools return identical JSON shapes to pre-change behavior (`server.test.ts`)
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in `mcp/src` outside allowed patterns
- [ ] No `let` in production code (only `const`; control-flag exception per rules)
- [ ] Single-line comments only where comments are needed

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.

## Follow-up Items

- None
