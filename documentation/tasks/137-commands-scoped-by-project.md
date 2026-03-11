# Task 137: Commands scoped by project

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** mcp + storage + core
> **Depends on:** W07 (Wire ScopeRegistry into server)

## Goal

Scope AIC commands by project: `aic://status` aggregates globally with per-project breakdown when multiple projects exist; `aic://last` filters by the project of the most recent `aic_compile` in the conversation; `aic_chat_summary` includes `projectRoot` in the response; new `aic_projects` tool lists all projects. `SqliteStatusStore` gains global/cross-project query methods behind a new `GlobalStatusQueries` interface.

## Architecture Notes

- ADR-007: ProjectId and projects table; no new migration — use existing schema.
- ISP: Max 5 methods per interface; new `GlobalStatusQueries` interface (5 methods) so `StatusStore` stays at 2.
- Composition root wires `lastConversationIdRef` and passes `setLastConversationId` to compile handler so `aic://last` can scope by conversation without resource parameters.
- `.cursor/rules/AIC-architect.mdc` prompt commands: add "show aic projects" formatting.

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/core/interfaces/global-status-queries.interface.ts` |
| Modify | `shared/src/core/types/status-types.ts` (add GlobalStatusAggregates, ProjectListItem, LastCompilationSnapshot; add projectRoot to ConversationSummary) |
| Modify | `shared/src/storage/sqlite-status-store.ts` (implement GlobalStatusQueries) |
| Modify | `mcp/src/server.ts` (lastConversationIdRef, aic://status use getGlobalSummary, aic://last scoped by conversation, aic_chat_summary projectRoot, aic_projects tool) |
| Modify | `mcp/src/handlers/compile-handler.ts` (add setLastConversationId parameter, call after building request) |
| Modify | `shared/src/storage/__tests__/sqlite-status-store.test.ts` (tests for new methods) |
| Modify | `mcp/src/__tests__/server.test.ts` (aic://status global, aic://last scoped, aic_chat_summary projectRoot, aic_projects) |
| Modify | `.cursor/rules/AIC-architect.mdc` (add show aic projects prompt command) |

## Interface / Signature

```typescript
// StatusStore unchanged — shared/src/core/interfaces/status-store.interface.ts
import type {
  ConversationSummary,
  StatusAggregates,
} from "@jatbas/aic-core/core/types/status-types.js";
import type { ConversationId } from "@jatbas/aic-core/core/types/identifiers.js";

export interface StatusStore {
  getSummary(): StatusAggregates;
  getConversationSummary(conversationId: ConversationId): ConversationSummary | null;
}
```

```typescript
// New — shared/src/core/interfaces/global-status-queries.interface.ts
import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ConversationId } from "@jatbas/aic-core/core/types/identifiers.js";
import type {
  GlobalStatusAggregates,
  ProjectListItem,
  LastCompilationSnapshot,
} from "@jatbas/aic-core/core/types/status-types.js";

export interface GlobalStatusQueries {
  getGlobalSummary(): GlobalStatusAggregates;
  getProjectIdForConversation(conversationId: ConversationId): ProjectId | null;
  getLastCompilationForProject(projectId: ProjectId): LastCompilationSnapshot | null;
  getProjectRoot(projectId: ProjectId): AbsolutePath | null;
  listProjects(): readonly ProjectListItem[];
}
```

```typescript
// SqliteStatusStore: existing constructor + existing 2 methods + implement GlobalStatusQueries (5 methods)
export class SqliteStatusStore implements StatusStore, GlobalStatusQueries {
  constructor(
    private readonly projectId: ProjectId,
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}

  getSummary(): StatusAggregates { ... }
  getConversationSummary(conversationId: ConversationId): ConversationSummary | null { ... }

  getGlobalSummary(): GlobalStatusAggregates { ... }
  getProjectIdForConversation(conversationId: ConversationId): ProjectId | null { ... }
  getLastCompilationForProject(projectId: ProjectId): LastCompilationSnapshot | null { ... }
  getProjectRoot(projectId: ProjectId): AbsolutePath | null { ... }
  listProjects(): readonly ProjectListItem[] { ... }
}
```

## Dependent Types

### Tier 0 — verbatim (new types in status-types.ts)

```typescript
// Add to shared/src/core/types/status-types.ts
// LastCompilationSnapshot: same shape as StatusAggregates["lastCompilation"]
export type LastCompilationSnapshot = NonNullable<StatusAggregates["lastCompilation"]>;

export interface ProjectListItem {
  readonly projectId: ProjectId;
  readonly projectRoot: AbsolutePath;
  readonly lastSeenAt: string;
  readonly compilationCount: number;
}

export interface GlobalStatusAggregates {
  readonly compilationsTotal: number;
  readonly compilationsToday: number;
  readonly cacheHitRatePct: number | null;
  readonly avgReductionPct: number | null;
  readonly totalTokensRaw: number;
  readonly totalTokensCompiled: number;
  readonly totalTokensSaved: number | null;
  readonly telemetryDisabled: boolean;
  readonly guardByType: Readonly<Record<string, number>>;
  readonly topTaskClasses: readonly { readonly taskClass: string; readonly count: number }[];
  readonly lastCompilation: LastCompilationSnapshot | null;
  readonly installationOk: boolean | null;
  readonly installationNotes: string | null;
  readonly projectsBreakdown?: readonly ProjectListItem[];
}
```

ConversationSummary: add `readonly projectRoot: string;` to the existing interface.

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| ProjectScope | shared/src/storage/create-project-scope.ts | projectId, projectRoot, db, clock, … | scope passed to handlers |
| ExecutableDb | core/interfaces/executable-db.interface.ts | prepare(), run(), all() | SQL execution |
| Clock | core/interfaces/clock.interface.ts | now() | timestamps |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| ProjectId | core/types/identifiers.ts | toProjectId(raw) |
| ConversationId | core/types/identifiers.ts | toConversationId(raw) |
| AbsolutePath | core/types/paths.ts | toAbsolutePath(raw) |

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Types and GlobalStatusQueries interface

In `shared/src/core/types/status-types.ts`: add `LastCompilationSnapshot` as `type LastCompilationSnapshot = NonNullable<StatusAggregates["lastCompilation"]>`. Add `ProjectListItem` interface (projectId, projectRoot, lastSeenAt, compilationCount). Add `GlobalStatusAggregates` interface (same fields as StatusAggregates plus optional `projectsBreakdown?: readonly ProjectListItem[]`). Add `projectRoot: string` to `ConversationSummary`. Import `ProjectId` and `AbsolutePath` in status-types if not already present.

Create `shared/src/core/interfaces/global-status-queries.interface.ts` with the `GlobalStatusQueries` interface (five methods: getGlobalSummary, getProjectIdForConversation, getLastCompilationForProject, getProjectRoot, listProjects). Use named imports from identifiers, paths, and status-types.

**Verify:** pnpm typecheck passes; status-types exports the new types; global-status-queries.interface.ts exists and exports GlobalStatusQueries.

### Step 2: Implement global methods in SqliteStatusStore

In `shared/src/storage/sqlite-status-store.ts`: implement `GlobalStatusQueries`. Import `GlobalStatusQueries`, `GlobalStatusAggregates`, `ProjectListItem`, `LastCompilationSnapshot` and `toAbsolutePath`. Add `getGlobalSummary()`: run aggregates over compilation_log (and related tables) without WHERE project_id; when more than one project exists (SELECT COUNT(DISTINCT project_id) > 1), populate projectsBreakdown via SELECT p.project_id, p.project_root, p.last_seen_at, COUNT(cl.id) FROM projects p LEFT JOIN compilation_log cl ON cl.project_id = p.project_id AND (trigger_source IS NULL OR trigger_source != TRIGGER_SOURCE.INTERNAL_TEST) GROUP BY p.project_id. Add `getProjectIdForConversation(conversationId)`: SELECT project_id FROM compilation_log WHERE conversation_id = ? AND (trigger_source IS NULL OR trigger_source != ?) ORDER BY created_at DESC LIMIT 1; return toProjectId(row.project_id) or null. Add `getLastCompilationForProject(projectId)`: same last-compilation query as getSummary() but WHERE project_id = ?; return mapped row or null. Add `getProjectRoot(projectId)`: SELECT project_root FROM projects WHERE project_id = ?; return toAbsolutePath(row.project_root) or null. Add `listProjects()`: SELECT p.project_id, p.project_root, p.last_seen_at, COUNT(cl.id) as compilation_count FROM projects p LEFT JOIN compilation_log cl ON cl.project_id = p.project_id AND (cl.trigger_source IS NULL OR cl.trigger_source != ?) GROUP BY p.project_id; map to ProjectListItem[]. Declare class as `implements StatusStore, GlobalStatusQueries`. In getConversationSummary return value, include projectRoot: pass this.projectRoot (or resolve from this.projectId via getProjectRoot(this.projectId)) — use the store’s projectId to get project_root from projects table and add to the returned ConversationSummary object.

**Verify:** pnpm typecheck passes; SqliteStatusStore implements both interfaces.

### Step 3: lastConversationIdRef and setLastConversationId in compile handler

In `mcp/src/server.ts`: before wiring the compile handler, add `const lastConversationIdRef: { current: string | null } = { current: null }`. Define `setLastConversationId = (id: string | null): void => { lastConversationIdRef.current = id; }`. Pass `setLastConversationId` as an additional argument to `createCompileHandler` (after existing args).

In `mcp/src/handlers/compile-handler.ts`: add parameter `setLastConversationId: (id: string | null) => void` to `createCompileHandler`. After building `request` (and before or after recordToolInvocation), call `setLastConversationId(resolvedConversationId ?? null)`.

**Verify:** createCompileHandler signature includes setLastConversationId; server passes the ref setter; compile handler calls it with the resolved conversation id.

### Step 4: aic://status, aic://last, aic_chat_summary scoped by project

In `mcp/src/server.ts`: For the `aic://status` resource handler: create a single `SqliteStatusStore(startupScope.projectId, startupScope.db, startupScope.clock)` and call `getGlobalSummary()` on it (cast store to GlobalStatusQueries or use the same instance). Build the JSON payload from the global summary (same keys as today plus projectsBreakdown when present). Keep projectEnabled from `configLoader.load(startupScope.projectRoot, null)`.

For the `aic://last` resource handler: read `lastConversationIdRef.current`. If null, keep current behaviour (summary from startup scope, lastCompilation from that scope). If non-null, create a StatusStore instance (same as today), call `getProjectIdForConversation(toConversationId(lastConversationIdRef.current))`; if null, fall back to startup scope last; else call `getLastCompilationForProject(projectId)` and return that as lastCompilation in the payload (with same shape as today).

For the `aic_chat_summary` tool handler: obtain a store that implements GlobalStatusQueries (the same SqliteStatusStore created with startupScope.projectId). Call `projectId = store.getProjectIdForConversation(conversationId)` when conversationId is non-null. If projectId is null, use existing zero payload. Else call `projectRoot = store.getProjectRoot(projectId)` and create `new SqliteStatusStore(projectId, startupScope.db, startupScope.clock)` and call `getConversationSummary(conversationId)` on it. Add `projectRoot: projectRoot ?? ""` (or the string value of projectRoot) to the payload object (the ConversationSummary returned from the store must include projectRoot from Step 2).

**Verify:** aic://status returns global aggregates; aic://last returns last compilation for the conversation’s project when set; aic_chat_summary response includes projectRoot.

### Step 5: aic_projects tool

In `mcp/src/server.ts`: register a new tool with `server.tool("aic_projects", "List all known AIC projects (project ID, path, last seen, compilation count).", z.object({}), (args) => { ... })`. Handler: create a store with GlobalStatusQueries (SqliteStatusStore with startupScope.projectId, db, clock), call `listProjects()`, return `Promise.resolve({ content: [{ type: "text", text: JSON.stringify(list) }] })`. Use an empty schema (no parameters).

**Verify:** Tool "aic_projects" appears in listTools; calling it returns JSON array of projects.

### Step 6: AIC-architect.mdc show aic projects

In `.cursor/rules/AIC-architect.mdc`: in the Prompt Commands section, add a row for **"show aic projects"**: when the user says this (or similar), call the MCP tool `aic_projects` (no arguments). Start the reply with one short line: **Projects = known AIC projects.** Display a formatted table with columns: Project ID, Path, Last seen, Compilation count. Use same general formatting rules (human-readable labels, commas for numbers, relative time for last seen, — for null).

**Verify:** Rule file contains the new prompt command and table.

### Step 7: Tests

In `shared/src/storage/__tests__/sqlite-status-store.test.ts`: add tests. getGlobalSummary_empty_db: run migration, create store, call getGlobalSummary(); expect compilationsTotal 0, projectsBreakdown absent or empty. getGlobalSummary_multiple_projects: insert two rows into projects, insert compilations for both; call getGlobalSummary(); expect global sums correct and projectsBreakdown length 2. getProjectIdForConversation_missing: call with unknown conversationId; expect null. getProjectIdForConversation_returns_most_recent_project: insert two compilation_log rows with same conversation_id, different project_id, different created_at; expect returned projectId is the one with later created_at. getLastCompilationForProject: insert one compilation for project A; call getLastCompilationForProject(projectA); expect that compilation; call for other projectId; expect null. getProjectRoot: insert project; expect getProjectRoot(projectId) returns that project_root; unknown projectId returns null. listProjects: no projects → []; two projects with compilations → two items with compilationCount.

In `mcp/src/__tests__/server.test.ts`: add or extend tests. aic://status returns projectsBreakdown when multiple projects exist (insert two projects and compilations, read aic://status, parse JSON, assert projectsBreakdown is present and length 2). aic://last after aic_compile with conversationId returns last for that project (call aic_compile with conversationId, then read aic://last, assert lastCompilation matches project). aic_chat_summary includes projectRoot in response (call aic_compile with conversationId, then aic_chat_summary with that conversationId, assert payload has projectRoot). aic_projects returns list (call aic_projects tool, assert content is JSON array with at least one project when DB has projects).

**Verify:** pnpm test passes for sqlite-status-store.test.ts and server.test.ts.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| getGlobalSummary_empty_db | No rows → zero totals, null rates, no or empty projectsBreakdown |
| getGlobalSummary_multiple_projects | Two projects with compilations → global sums correct, projectsBreakdown length 2 |
| getProjectIdForConversation_missing | Unknown conversationId → null |
| getProjectIdForConversation_returns_most_recent_project | Two compilations same conversation different projects → returns project_id of most recent |
| getLastCompilationForProject | Returns last compilation for given projectId; other project → null |
| getProjectRoot | Existing project_id → project_root; unknown → null |
| listProjects | Empty → []; two projects → two items with compilationCount |
| status_resource_global_with_breakdown | aic://status returns projectsBreakdown when multiple projects |
| last_resource_scoped_by_conversation | aic://last after aic_compile with conversationId returns last for that project |
| aic_chat_summary_includes_projectRoot | Response includes projectRoot field |
| aic_projects_returns_list | aic_projects tool returns JSON array of projects |

## Acceptance Criteria

- [ ] All files created/modified per Files table
- [ ] GlobalStatusQueries interface and new types match signatures exactly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] aic://status aggregates globally; projectsBreakdown when multiple projects
- [ ] aic://last scoped by last conversation’s project
- [ ] aic_chat_summary includes projectRoot
- [ ] aic_projects tool lists projects with compilation count

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
