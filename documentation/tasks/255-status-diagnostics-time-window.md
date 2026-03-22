# Task 255: Status diagnostics time window (CLI + MCP)

> **Status:** Pending
> **Phase:** Phase M — Reporting & Resources
> **Layer:** mcp
> **Depends on:** aic_status tool (Done); Shell diagnostics status subcommand (Done)

## Goal

Add rolling **7 / 15 / 30 day** windows for project-level status aggregates in `aic_status` JSON, `npx @jatbas/aic status`, and the human-readable status table, with default behavior unchanged when no window is requested.

## Architecture Notes

- ADR-008: timestamps as `ISOTimestamp`; lower bound computed with `Clock.addMinutes(-days * 24 * 60)`, never `datetime('now')` in SQL.
- ADR-009: validate MCP args with Zod in `mcp/src/schemas/`; core types hold no Zod.
- SQL stays in `shared/src/storage/sqlite-status-store.ts` only; add `AND created_at >= ?` with bound `notBeforeInclusive` on every `compilation_log` query that feeds status aggregates for the scoped summary, including global `projectsBreakdown` join counts when that breakdown is returned.
- `server_sessions` rows used for `installationOk` / `installationNotes` are not filtered by the window.
- `compilationsToday` keeps calendar-day semantics: same `date(created_at) = date(clock.now())` predicate, plus the window predicate when a window is active.
- `listProjectsFromDb` and `aic_projects` stay all-time (no change).
- README.md is out of scope (per MVP progress row).
- `StatusRequest` in `status-types.ts` names an unrelated config shape; the new MCP Zod file is `status-request.schema.ts` exporting `StatusRequestSchema` — keep names distinct when implementing.

## Files

| Action | Path |
| ------ | ---- |
| Create | `mcp/src/schemas/status-request.schema.ts` |
| Modify | `shared/src/core/types/status-types.ts` (add `StatusSummaryFilter`, `StatusTimeRangeDays`) |
| Modify | `shared/src/core/interfaces/status-store.interface.ts` |
| Modify | `shared/src/core/interfaces/global-status-queries.interface.ts` |
| Modify | `shared/src/storage/sqlite-status-store.ts` |
| Modify | `mcp/src/diagnostic-payloads.ts` |
| Modify | `mcp/src/format-diagnostic-output.ts` |
| Modify | `mcp/src/server.ts` |
| Modify | `mcp/src/cli-diagnostics.ts` |
| Modify | `shared/src/storage/__tests__/sqlite-status-store.test.ts` |
| Modify | `mcp/src/__tests__/format-diagnostic-output.test.ts` |
| Modify | `mcp/src/__tests__/server.test.ts` |
| Modify | `mcp/src/__tests__/cli-diagnostics.test.ts` |
| Modify | `documentation/implementation-spec.md` |
| Modify | `documentation/installation.md` |
| Modify | `documentation/architecture.md` |
| Modify | `.cursor/rules/AIC-architect.mdc` |
| Modify | `.cursor/rules/AIC.mdc` |
| Modify | `.claude/CLAUDE.md` |
| Modify | `integrations/claude/install.cjs` (`CLAUDE_MD_TEMPLATE` prompt-command block) |
| Modify | `integrations/cursor/install.cjs` |
| Modify | `mcp/src/install-trigger-rule.ts` |

## Interface / Signature

```typescript
// shared/src/core/types/status-types.ts — add (preserve existing exports)
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";

export type StatusTimeRangeDays = 7 | 15 | 30;

export interface StatusSummaryFilter {
  readonly notBeforeInclusive: ISOTimestamp;
}
```

```typescript
// shared/src/core/interfaces/status-store.interface.ts — full file target shape
import type {
  ConversationSummary,
  StatusAggregates,
  StatusSummaryFilter,
} from "@jatbas/aic-core/core/types/status-types.js";
import type { ConversationId } from "@jatbas/aic-core/core/types/identifiers.js";

export interface StatusStore {
  getSummary(filter?: StatusSummaryFilter): StatusAggregates;
  getConversationSummary(conversationId: ConversationId): ConversationSummary | null;
}
```

```typescript
// shared/src/core/interfaces/global-status-queries.interface.ts — full file target shape
import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ConversationId } from "@jatbas/aic-core/core/types/identifiers.js";
import type {
  GlobalStatusAggregates,
  ProjectListItem,
  LastCompilationSnapshot,
  StatusSummaryFilter,
} from "@jatbas/aic-core/core/types/status-types.js";

export interface GlobalStatusQueries {
  getGlobalSummary(filter?: StatusSummaryFilter): GlobalStatusAggregates;
  getProjectIdForConversation(conversationId: ConversationId): ProjectId | null;
  getLastCompilationForProject(projectId: ProjectId): LastCompilationSnapshot | null;
  getProjectRoot(projectId: ProjectId): AbsolutePath | null;
  listProjects(): readonly ProjectListItem[];
}
```

```typescript
// shared/src/storage/sqlite-status-store.ts — target public and private API
export class SqliteStatusStore implements StatusStore, GlobalStatusQueries {
  constructor(
    private readonly projectId: ProjectId,
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}

  getConversationSummary(conversationId: ConversationId): ConversationSummary | null;

  private getAggregatesForScope(
    projectId: ProjectId | null,
    notBeforeInclusive: ISOTimestamp | null,
  ): StatusAggregates;

  getGlobalSummary(filter?: StatusSummaryFilter): GlobalStatusAggregates;

  getProjectIdForConversation(conversationId: ConversationId): ProjectId | null;

  getLastCompilationForProject(projectId: ProjectId): LastCompilationSnapshot | null;

  getProjectRoot(projectId: ProjectId): AbsolutePath | null;

  listProjects(): readonly ProjectListItem[];

  getSummary(filter?: StatusSummaryFilter): StatusAggregates;
}
```

```typescript
// mcp/src/schemas/status-request.schema.ts
import { z } from "zod";

const statusRequestShape = {
  timeRangeDays: z.union([z.literal(7), z.literal(15), z.literal(30)]).optional(),
} as const;

export const StatusRequestSchema: typeof statusRequestShape = statusRequestShape;
```

```typescript
// mcp/src/diagnostic-payloads.ts — extend input type and implementation
import type { StatusTimeRangeDays } from "@jatbas/aic-core/core/types/status-types.js";

export function buildStatusPayload(input: {
  readonly projectId: ProjectId;
  readonly db: ExecutableDb;
  readonly clock: Clock;
  readonly configLoader: LoadConfigFromFile;
  readonly projectRoot: AbsolutePath;
  readonly budgetConfig: BudgetConfig;
  readonly updateInfo: UpdateInfo;
  readonly installScope: InstallScope;
  readonly installScopeWarnings: readonly string[];
  readonly timeRangeDays: StatusTimeRangeDays | null;
}): Record<string, unknown> {}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// shared/src/core/types/status-types.ts — StatusAggregates (existing)
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
```

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `Clock` | `shared/src/core/interfaces/clock.interface.ts` | 3 | `now`, `addMinutes`, `durationMs` |
| `ExecutableDb` | `shared/src/core/interfaces/executable-db.interface.ts` | 2 | `exec`, `prepare` |
| `LoadConfigFromFile` | `shared/src/config/load-config-from-file.ts` | 1 | `load` reads `enabled` for `projectEnabled` |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `ISOTimestamp` | `shared/src/core/types/identifiers.ts` | `toISOTimestamp(raw)` |
| `ProjectId` | `shared/src/core/types/identifiers.ts` | `toProjectId(raw)` |

## Config Changes

- **shared/package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Domain types

In `shared/src/core/types/status-types.ts`, add imports for `ISOTimestamp`, define `export type StatusTimeRangeDays = 7 | 15 | 30`, define `export interface StatusSummaryFilter { readonly notBeforeInclusive: ISOTimestamp }`.

**Verify:** `pnpm typecheck` completes with zero errors.

### Step 2: StatusStore interface

Update `shared/src/core/interfaces/status-store.interface.ts` so `getSummary` takes `filter?: StatusSummaryFilter` and returns `StatusAggregates`; add `StatusSummaryFilter` import from `status-types.js`.

**Verify:** `pnpm typecheck` completes with zero errors.

### Step 3: GlobalStatusQueries interface

Update `shared/src/core/interfaces/global-status-queries.interface.ts` so `getGlobalSummary` takes `filter?: StatusSummaryFilter`; add `StatusSummaryFilter` import.

**Verify:** `pnpm typecheck` completes with zero errors.

### Step 4: SqliteStatusStore — `getAggregatesForScope`

In `shared/src/storage/sqlite-status-store.ts`:

- Add `ISOTimestamp` import from identifiers.
- Change `getAggregatesForScope` to `(projectId: ProjectId | null, notBeforeInclusive: ISOTimestamp | null): StatusAggregates`.
- Introduce a private helper that returns the SQL fragment and extra bound parameters for `compilation_log` time filtering: when `notBeforeInclusive` is `null`, fragment is empty and extra params are empty; when non-null, fragment is ` AND created_at >= ? ` and extra params are `[notBeforeInclusive]`.
- Insert the fragment and spread extra params **after** the trigger predicate parameters and **before** any `project_id = ?` parameter on every `compilation_log` query inside `getAggregatesForScope` (counts, cache rate, token sums, telemetry join, guard join, top task classes, last compilation). For `compilationsToday`, keep `date(created_at) = date(?)` with `todayDate` from `this.clock.now().slice(0, 10)` and add the same window fragment so rows outside the window are excluded.

**Verify:** `pnpm exec eslint shared/src/storage/sqlite-status-store.ts` exits 0.

### Step 5: SqliteStatusStore — `getSummary` and `getGlobalSummary`

In the same file:

- `getSummary(filter?: StatusSummaryFilter): StatusAggregates` calls `this.getAggregatesForScope(this.projectId, filter?.notBeforeInclusive ?? null)`.
- `getGlobalSummary(filter?: StatusSummaryFilter): GlobalStatusAggregates` calls `getAggregatesForScope(null, filter?.notBeforeInclusive ?? null)` for `base`, then runs the distinct-project-count query; when `projectCount > 1`, run the `projects` + `LEFT JOIN compilation_log` breakdown query with the trigger filter on the join **and** the same `created_at >= ?` join condition when `notBeforeInclusive` is non-null (bind once per query).

**Verify:** `pnpm typecheck` completes with zero errors.

### Step 6: `buildStatusPayload`

In `mcp/src/diagnostic-payloads.ts`:

- Import `StatusTimeRangeDays` from core types.
- Extend `buildStatusPayload` input with `readonly timeRangeDays: StatusTimeRangeDays | null`.
- When `timeRangeDays` is `null`, call `getGlobalSummary()` with no argument.
- When non-null, build `const notBefore = input.clock.addMinutes(-timeRangeDays * 24 * 60)` and call `getGlobalSummary({ notBeforeInclusive: notBefore })`.
- Spread the summary into the return object and add `timeRangeDays: input.timeRangeDays` (use `null` in JSON when input is `null`).

**Verify:** `pnpm typecheck` completes with zero errors.

### Step 7: Human-readable status table

In `mcp/src/format-diagnostic-output.ts`, inside `formatStatusTable`, after the line `Status = project-level AIC status.`, when `payload["timeRangeDays"]` is `7`, `15`, or `30`, insert a padded row: label `Time range`, value `Last 7 days` / `Last 15 days` / `Last 30 days` using the same `w` width as other rows.

**Verify:** `pnpm exec eslint mcp/src/format-diagnostic-output.ts` exits 0.

### Step 8: MCP schema and server wiring

Create `mcp/src/schemas/status-request.schema.ts` as in Interface / Signature.

In `mcp/src/server.ts`:

- Import `StatusRequestSchema`.
- Replace empty `aicStatusParams` with `StatusRequestSchema`.
- Change the `aic_status` tool handler to parse `z.object(StatusRequestSchema).parse(args)`, derive `timeRangeDays` as `parsed.timeRangeDays ?? null`, pass it into `buildStatusPayload`, and stringify the result.

**Verify:** `pnpm exec eslint mcp/src/server.ts mcp/src/schemas/status-request.schema.ts` exits 0.

### Step 9: CLI argv and `runStatusCli`

In `mcp/src/cli-diagnostics.ts`:

- Import `StatusTimeRangeDays`.
- Add a file-private function `parseStatusTimeRangeDaysFromArgv(argv: readonly string[])`: scan argv while skipping the `--project` flag and its following value; collect tokens that match `^(7|15|30)d$` via `RegExp`; return `{ ok: true, days: null }` when none found; return `{ ok: true, days: N }` when exactly one valid token maps to `N` in `{7,15,30}`; return `{ ok: false }` when two or more range tokens appear or when a token matches `^\d+d$` but is not `7d`/`15d`/`30d`.
- Update `runStatusCli` to call the parser on `argv`, write a one-line stderr usage message and exit `1` when `{ ok: false }`, else pass `days` into `buildStatusPayload` as `timeRangeDays`.
- Update the stderr usage string for the status subcommand to document `7d`, `15d`, `30d` after `status`.

**Verify:** `pnpm exec eslint mcp/src/cli-diagnostics.ts` exits 0.

### Step 10: Storage tests

In `shared/src/storage/__tests__/sqlite-status-store.test.ts`:

- Replace `stubClock.addMinutes` with an implementation that mutates a `Date` constructed from `2025-06-15T12:00:00.000Z` by `setUTCMinutes` and returns `toISOTimestamp(d.toISOString())`.
- Add `sqlite_status_store_window_filters_old_compilations`: insert two `compilation_log` rows for `TEST_PROJECT_ID` with `created_at` `2025-06-14T12:00:00.000Z` and `2025-06-01T12:00:00.000Z`, call `getSummary({ notBeforeInclusive: toISOTimestamp("2025-06-08T12:00:00.000Z") })`, assert `compilationsTotal === 1`.

**Verify:** `env CHANGED_PKGS=both pnpm exec vitest run shared/src/storage/__tests__/sqlite-status-store.test.ts` exits 0.

### Step 11: Formatter test

In `mcp/src/__tests__/format-diagnostic-output.test.ts`, add `format_status_table_shows_time_range_row`: build payload with `timeRangeDays: 7` plus minimal keys used by `formatStatusTable`, assert stdout contains `Time range` and `Last 7 days`.

**Verify:** `pnpm exec vitest run mcp/src/__tests__/format-diagnostic-output.test.ts` exits 0.

### Step 12: Server MCP test

In `mcp/src/__tests__/server.test.ts`, add `aic_status_accepts_timeRangeDays`: create server with in-memory DB, call `aic_status` with `arguments: { timeRangeDays: 7 }`, parse JSON text, assert `timeRangeDays === 7` and `typeof compilationsTotal === "number"`.

**Verify:** `pnpm exec vitest run mcp/src/__tests__/server.test.ts` exits 0.

### Step 13: CLI test

In `mcp/src/__tests__/cli-diagnostics.test.ts`, add `cli_status_7d_ok`: mirror `cli_status_respects_project_flag_when_cwd_unknown` fixture, run `runCliDiagnosticsAndExit(["status", "7d", "--project", pathA])`, assert exit `0` and joined stdout contains `Time range`.

**Verify:** `pnpm exec vitest run mcp/src/__tests__/cli-diagnostics.test.ts` exits 0.

### Step 14: Documentation and templates

Update prose only (no README.md):

- `documentation/implementation-spec.md`: document `aic_status` JSON field `timeRangeDays`, rolling window definition, and that default omits window (field `null`).
- `documentation/installation.md` and `documentation/architecture.md`: document `npx @jatbas/aic status [7d|15d|30d]` alongside existing status examples.
- `.cursor/rules/AIC-architect.mdc` and `.claude/CLAUDE.md`: extend the **show aic status** prompt-command row with the Nd suffix and formatted **Time range** row behavior.
- `.cursor/rules/AIC.mdc`: extend `aic_status` bullet to allow `timeRangeDays` and the same formatting rules.
- `integrations/claude/install.cjs` and `integrations/cursor/install.cjs`: sync prompt-command text with the architect rule.
- `mcp/src/install-trigger-rule.ts`: sync the **show aic status** line with `status [7d|15d|30d]`.

**Verify:** From the repository root, run `rg -n "timeRangeDays|7d|15d|30d" documentation/implementation-spec.md documentation/installation.md documentation/architecture.md .cursor/rules/AIC-architect.mdc .cursor/rules/AIC.mdc .claude/CLAUDE.md integrations/claude/install.cjs integrations/cursor/install.cjs mcp/src/install-trigger-rule.ts` and confirm the command exits 0 with at least one match line per listed path.

### Step 15: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

**Verify:** all pass with zero warnings and no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| `sqlite_status_store_window_filters_old_compilations` | Windowed `getSummary` excludes `compilation_log` rows before `notBeforeInclusive`. |
| `format_status_table_shows_time_range_row` | `formatStatusTable` prints **Time range** when `timeRangeDays` is `7`. |
| `aic_status_accepts_timeRangeDays` | MCP `aic_status` returns valid JSON with `timeRangeDays: 7`. |
| `cli_status_7d_ok` | CLI `status 7d` exits 0 and prints **Time range** for a registered project. |

## Acceptance Criteria

- [ ] All files created or modified per Files table
- [ ] `StatusStore` / `GlobalStatusQueries` signatures match `SqliteStatusStore` public API
- [ ] All four test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what
- [ ] README.md not modified

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
