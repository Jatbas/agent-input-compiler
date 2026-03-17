# Task 189: Documentation update (W13)

> **Status:** Pending
> **Phase:** Phase W (mvp-progress.md)
> **Layer:** documentation
> **Depends on:** W07 (Wire ScopeRegistry into server), W16 (Normalize project_root)

## Goal

Update all documentation and the architect rule file so they describe the global database at `~/.aic/aic.sqlite`, per-project isolation via `project_id` FK and `projectId: ProjectId` in stores, ScopeRegistry-based lazy scopes, and the availability of cross-project view via `aic_projects` and global `aic_status`. Remove or replace every statement that says there is no global database, that projects are hermetically isolated with no shared state, or that the per-project filter is `project_root`.

## Architecture Notes

- W07 and W16 are Done: ScopeRegistry is wired, stores use `projectId: ProjectId` and `WHERE project_id = ?`. Documentation and rules must match this.
- Use timeless capability descriptions; do not reference "Phase W" or task numbers in user-facing or long-lived prose where a capability description suffices.
- Change Specification uses exact current text and exact target text so the executor applies edits without interpretation.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `documentation/implementation-spec.md` |
| Modify | `documentation/project-plan.md` |
| Modify | `documentation/security.md` |
| Modify | `documentation/documentation-review.md` |
| Modify | `documentation/mvp-progress.md` |
| Modify | `.cursor/rules/AIC-architect.mdc` |

## Change Specification

### Change 1: implementation-spec.md — §8 Multi-Project Behaviour (diagram and bullets)

**Current text:**

```
Project-A/          Project-B/
├── aic.config.json ├── aic.config.json
├── aic-rules/      └── .aic/
│   └── team.json       ├── aic.sqlite
│   (optional)          └── cache/
└── .aic/
    ├── aic.sqlite
    └── cache/
```

- Each project is hermetically isolated
- `projectRoot` argument to `aic_compile` allows operating on any project
- No shared state, no global database, no cross-project data leakage

**Required change:** Replace with global DB layout and correct isolation description (project_id FK).

**Target text:**

```
~/.aic/
└── aic.sqlite          (single global database)

Project-A/              Project-B/
├── aic.config.json     ├── aic.config.json
├── aic-rules/          └── .aic/
│   └── team.json           ├── project-id
│   (optional)               └── cache/
└── .aic/
    ├── project-id
    └── cache/
```

- One global database at `~/.aic/aic.sqlite`; per-project data isolated via `project_id` FK in store queries.
- `projectRoot` argument to `aic_compile` allows operating on any project; the server uses `ScopeRegistry.getOrCreate(projectRoot)` to get or create the project scope.
- No cross-project data leakage: all per-project stores filter with `WHERE project_id = ?`.

---

### Change 2: implementation-spec.md — §8b Step 3 (add ScopeRegistry and lazy scopes)

**Current text:**

```
3. Open SQLite database (~/.aic/aic.sqlite)
   └─ Create .aic/ with 0700 if missing
   └─ Run pending schema migrations (MigrationRunner)
   └─ Record server session (insert server_sessions row)
   └─ Mark orphaned sessions as crash (stopped_at IS NULL → stop_reason = 'crash')
         │
         ▼
4. Build shared infrastructure
```

**Required change:** After opening the DB, state that the server creates a ScopeRegistry; per-project scopes are created lazily on first `getOrCreate(projectRoot)`, not at startup.

**Target text:**

```
3. Open SQLite database (~/.aic/aic.sqlite)
   └─ Create .aic/ with 0700 if missing
   └─ Run pending schema migrations (MigrationRunner)
   └─ Record server session (insert server_sessions row)
   └─ Mark orphaned sessions as crash (stopped_at IS NULL → stop_reason = 'crash')
   └─ Create ScopeRegistry (per-project scopes created lazily on first getOrCreate(projectRoot))
         │
         ▼
4. Build shared infrastructure
```

---

### Change 3: implementation-spec.md — Phase W intro paragraph (project_root → project_id, add current state)

**Current text:**

Single global MCP server registered in `~/.cursor/mcp.json`. One server process handles all workspace folders. Each `aic_compile` call specifies its `projectRoot`; the server creates or reuses a `ProjectScope` per project. The database is global at `~/.aic/aic.sqlite` with a `project_root` column on tables that need per-project filtering. Per-project files (`aic.config.json`, `.cursor/rules/AIC.mdc`, `.cursor/hooks/`) remain in each project directory. A stable project ID in `.aic/project-id` survives folder renames. The implementation is split into 14 tasks (W01–W14) with explicit dependencies; see `mvp-progress.md` §Phase W for the task table and dependency order.

**Required change:** State that per-project tables use `project_id` FK (not `project_root` column) and that stores take `projectId: ProjectId`; add one sentence on current state post–W16.

**Target text:**

Single global MCP server registered in `~/.cursor/mcp.json`. One server process handles all workspace folders. Each `aic_compile` call specifies its `projectRoot`; the server creates or reuses a `ProjectScope` per project. The database is global at `~/.aic/aic.sqlite`; per-project tables use a `project_id` FK to `projects(project_id)`. Per-project stores take `projectId: ProjectId` and filter with `WHERE project_id = ?`. Per-project files (`aic.config.json`, `.cursor/rules/AIC.mdc`, `.cursor/hooks/`) remain in each project directory. A stable project ID in `.aic/project-id` survives folder renames. The implementation is split into 14 tasks (W01–W14) with explicit dependencies; see `mvp-progress.md` §Phase W for the task table and dependency order.

---

### Change 4: implementation-spec.md — After W05, add W15–W16 current state note

**Current text:**

```typescript
// After:
db.prepare(
  "SELECT * FROM compilation_log WHERE project_root = ? ORDER BY created_at DESC LIMIT 1",
).get(this.projectRoot);
```

**W06. ScopeRegistry class:**

**Required change:** Insert a short **W15–W16 (current state)** subsection after the W05 example and before W06, stating that stores now use `projectId: ProjectId` and `WHERE project_id = ?`; the `project_root` column is deprecated.

**Target text:**

```typescript
// After:
db.prepare(
  "SELECT * FROM compilation_log WHERE project_root = ? ORDER BY created_at DESC LIMIT 1",
).get(this.projectRoot);
```

**W15–W16 (current state):** Per-project stores now take `projectId: ProjectId` (not `projectRoot: AbsolutePath`) and use `WHERE project_id = ?` in all queries. The `project_root` column is deprecated (NULL on new rows). See task 133-normalize-project-root-stores.md and migration 013.

**W06. ScopeRegistry class:**

---

### Change 5: implementation-spec.md — W13 table row for §8 and for AIC-architect

**Current text:**

| `implementation-spec.md`          | §8 (line ~1006)                  | "Each project is hermetically isolated" / "No shared state, no global database, no cross-project data leakage" | Replace with: single global DB at `~/.aic/aic.sqlite` with `project_root` column for logical isolation. Per-project files remain local. No cross-project data leakage (queries always filter by `project_root`). |

**Required change:** Update required change to say `project_id` FK, not `project_root` column.

**Target text:**

| `implementation-spec.md`          | §8 (line ~1006)                  | "Each project is hermetically isolated" / "No shared state, no global database, no cross-project data leakage" | Replace with: single global DB at `~/.aic/aic.sqlite` with `project_id` FK for logical isolation. Per-project files remain local. No cross-project data leakage (queries always filter by `project_id`). |

---

**Current text (same table, AIC-architect row):**

| `.cursor/rules/AIC-architect.mdc` | Database / storage rules         | References per-project DB assumptions                                                                          | Update storage rules to reference global DB path and `project_root` column requirement                                                                           |

**Required change:** Update to reference `project_id` and global DB path.

**Target text:**

| `.cursor/rules/AIC-architect.mdc` | Database / storage rules         | References per-project DB assumptions                                                                          | Update storage rules to reference global DB path (`~/.aic/aic.sqlite`) and `project_id`-based isolation in store queries                                                                           |

---

### Change 6: implementation-spec.md — W13 executor grep list

**Current text:**

This task depends on W07 (ScopeRegistry wired into server) being complete so all code references are accurate. The task executor should grep for "no global database", "hermetically isolated", "no shared state", "{projectRoot}/.aic/aic.sqlite", and "per-project isolation" across all documentation to catch any additional references.

**Required change:** Add "project_root" as per-project filter to the grep list so executor catches stale filter descriptions.

**Target text:**

This task depends on W07 (ScopeRegistry wired into server) and W16 (project_id normalization) being complete so all code references are accurate. The task executor should grep for "no global database", "hermetically isolated", "no shared state", "{projectRoot}/.aic/aic.sqlite", "per-project isolation", and "filter by project_root" (or "WHERE project_root") across all documentation to catch any additional references and update them to global DB and `project_id` as appropriate.

---

### Change 7: project-plan.md — Non-goals table row "Cross-project shared database"

**Current text:**

| **Cross-project shared database** | Per-project isolation is a core principle (ADR-005); global state adds coupling and privacy risk                                                     |

**Required change:** Global DB is now a feature; isolation is preserved via `project_id` FK, not separate databases.

**Target text:**

| **Cross-project shared database** | A single global DB at `~/.aic/aic.sqlite` is used; per-project isolation is preserved via `project_id` FK (ADR-005). No cross-project data leakage. |

---

### Change 8: project-plan.md — Multi-project table row "Isolation"

**Current text:**

| **Isolation**        | Projects never share state; no global database or config                                |

**Required change:** Projects share the global database; isolation is column-level via `project_id`.

**Target text:**

| **Isolation**        | Single global database at `~/.aic/aic.sqlite`; per-project isolation via `project_id` FK. Config remains per-project (local). |

---

### Change 9: project-plan.md — ADR-007 add ProjectId sentence (optional)

**Current text:**

- **Decision:** All entity primary keys (compilation_log, guard_findings, telemetry_events, session_state, anonymous_telemetry_log) use UUIDv7 stored as `TEXT(36)` in SQLite

**Required change:** Add that project identity uses the `ProjectId` branded type (UUIDv7) for per-project store scoping.

**Target text:**

- **Decision:** All entity primary keys (compilation_log, guard_findings, telemetry_events, session_state, anonymous_telemetry_log) use UUIDv7 stored as `TEXT(36)` in SQLite. Project identity uses the `ProjectId` branded type (UUIDv7) stored in `projects.project_id`; per-project stores scope queries by `project_id`.

---

### Change 10: security.md — SOC 2 Readiness table "Security" / "Local-first, no shared state"

**Current text:**

| **Security**        | Local-first, no shared state                            |   ✅ MVP   |

**Required change:** Reflect single global DB with project-level isolation.

**Target text:**

| **Security**        | Local-first; single global DB at `~/.aic/aic.sqlite` with project-level isolation via `project_id`   |   ✅ MVP   |

---

### Change 11: documentation-review.md — DR-09 fix and recommendation

**Current text:**

**DR-09: Telemetry data can't cross project boundaries.**
"show aic status" shows stats for one project. A team lead managing 5 repos wants a cross-project view. ADR-005 explicitly excludes this (per-project isolation).
_Fix:_ Acknowledge this limitation in the documentation. Suggest a workaround (using "show aic status" per project). Note that a Phase 2 aggregation layer is planned.

**Required change:** Cross-project view is now available via `aic_projects` and global `aic_status`; update fix.

**Target text:**

**DR-09: Telemetry data can't cross project boundaries.**
"show aic status" shows stats for one project. A team lead managing 5 repos wants a cross-project view. ADR-005 explicitly excludes this (per-project isolation).
_Fix:_ Cross-project view is now available: the `aic_projects` MCP tool lists all projects (ID, path, last seen, compilation count), and `aic_status` aggregates across all projects with a per-project breakdown when multiple projects exist. Document these in the user-facing docs and prompt-command rules.

---

### Change 12: documentation-review.md — DR-09 summary table row

**Current text:**

| DR-09 | No cross-project visibility                   | Low      | Lead          | Low            |

**Required change:** State that cross-project visibility is now provided.

**Target text:**

| DR-09 | No cross-project visibility                   | Low      | Lead          | Addressed (aic_projects + global aic_status) |

---

### Change 13: documentation-review.md — "Note cross-project limitation" action

**Current text:**

- DR-09: Note cross-project limitation

**Required change:** Replace with resolved status.

**Target text:**

- DR-09: Cross-project view available via aic_projects and global aic_status (document in user docs)

---

### Change 14: project-plan.md — SOC 2 / Security row "no shared state"

**Current text:**

| **Security**        | Access control                | ✅ Local-first, no shared state  |   MVP   |

(Line ~3327; table may have more columns. Match the cell that reads "Local-first, no shared state".)

**Required change:** Align with global DB and project-level isolation.

**Target text:**

| **Security**        | Access control                | ✅ Local-first; single global DB with project-level isolation  |   MVP   |

---

### Change 15: mvp-progress.md — Notes "Store changes" bullet

**Current text:**

- **Store changes:** 9 store classes gain `projectRoot: AbsolutePath` constructor param (W04) and `WHERE project_root = ?` SQL filtering (W05). `SqliteSessionStore` is excluded — it operates on `server_sessions` which is server-level data, not per-project.

**Required change:** After W16, stores use projectId and project_id; update the note to current state.

**Target text:**

- **Store changes:** Per-project stores take `projectId: ProjectId` (W16) and use `WHERE project_id = ?` in all queries. `SqliteSessionStore` is excluded — it operates on `server_sessions` which is server-level data, not per-project.

---

### Change 16: .cursor/rules/AIC-architect.mdc — Add critical reminder for database

**Current text:**

- **Database:** All SQL lives exclusively in `shared/src/storage/`. Every schema change requires a migration file in `shared/src/storage/migrations/`. Never run raw DDL outside the `MigrationRunner`.

**Required change:** Add a second bullet that the database is global and isolation is via project_id.

**Target text:**

- **Database:** All SQL lives exclusively in `shared/src/storage/`. Every schema change requires a migration file in `shared/src/storage/migrations/`. Never run raw DDL outside the `MigrationRunner`.
- **Global DB:** The database is a single file at `~/.aic/aic.sqlite`. Per-project isolation is enforced via `project_id` in store queries (all per-project stores take `projectId: ProjectId` and use `WHERE project_id = ?`).

---

## Writing Standards

- **Tone:** Match existing tone of each document — formal, technical, developer reference.
- **Audience:** Implementation spec and project plan = developers; security = mixed; documentation-review = internal; rules = agents.
- **Terminology:** Use "global database" for `~/.aic/aic.sqlite`; "project_id" / "projectId" for current store scoping; "ScopeRegistry" for lazy per-project scope creation; retain "project_root" only where describing historical migrations or schema.
- **Formatting:** Preserve existing table and list formatting; no phase or task identifiers in timeless prose.
- **Temporal robustness:** Describe capabilities (e.g. "Cross-project view is available via aic_projects") rather than "Phase W added X".

## Config Changes

None.

## Steps

### Step 1: Apply changes to implementation-spec.md

Apply Change 1 (§8 diagram and bullets), Change 2 (§8b Step 3), Change 3 (Phase W intro), Change 4 (W15–W16 note after W05), Change 5 (W13 table two rows), Change 6 (W13 executor grep list). Use the exact target text from the Change Specification. Do not add phase or task numbers in user-facing bullets.

**Verify:** Grep `documentation/implementation-spec.md` for "No shared state", "no global database", "hermetically isolated" — zero matches. Grep for "project_id" and "projectId" — matches in §8, Phase W intro, and W15–W16 note.

### Step 2: Apply changes to project-plan.md

Apply Change 7 (non-goals row), Change 8 (multi-project Isolation row), Change 9 (ADR-007 sentence).

**Verify:** Grep `documentation/project-plan.md` for "Projects never share state" and "no global database or config" — zero matches in the multi-project table.

### Step 3: Apply changes to security.md

Apply Change 10 (SOC 2 Security row).

**Verify:** The row reads "single global DB" and "project-level isolation via project_id".

### Step 4: Apply changes to documentation-review.md

Apply Change 11 (DR-09 fix paragraph), Change 12 (DR-09 table row), Change 13 (action list item).

**Verify:** DR-09 section states cross-project view is available; table and action list updated.

### Step 5: Apply changes to project-plan.md (second pass) and mvp-progress.md

Apply Change 14 (project-plan SOC 2 Security row at ~line 3327). Apply Change 15 (mvp-progress.md Notes "Store changes" bullet).

**Verify:** project-plan.md no longer has "no shared state" in the SOC 2 Security row; mvp-progress Notes say projectId and WHERE project_id.

### Step 6: Apply changes to .cursor/rules/AIC-architect.mdc

Apply Change 16 (add Global DB critical reminder after Database bullet).

**Verify:** Two bullets under Database/global DB: one for SQL location and migrations, one for global path and project_id isolation.

### Step 7: Factual verification

Grep the codebase for: `projectId: ProjectId` in `shared/src/storage/*.ts`, `WHERE project_id` in `shared/src/storage/*.ts`, `~/.aic/aic.sqlite` or global DB path in `mcp/src/server.ts`. Confirm at least one match per pattern. Record result.

### Step 8: Consistency verification

Grep all of `documentation/` for: "no global database", "hermetically isolated", "no shared state" (as a standalone phrase), "filter by project_root", "WHERE project_root". Any match outside historical migration or DDL context must be updated or justified. Record findings; fix any non-historical matches.

### Step 9: Final verification

Run: `pnpm lint && pnpm typecheck` (no doc-only task test). Confirm all changed files are saved and all Change Specification items applied. Optionally spawn a subagent to read the edited sections and confirm congruency with the goal (global DB, project_id, ScopeRegistry, cross-project view).

## Tests

| Test case | Description |
| --------- | ----------- |
| Factual accuracy | Technical claims in edited sections match codebase (projectId, project_id, global DB path) |
| No stale isolation claims | No remaining "no global database", "hermetically isolated", "no shared state" in current-architecture prose |
| Cross-doc consistency | project-plan, security, documentation-review, and rules align with implementation-spec on global DB and project_id |

## Acceptance Criteria

- [ ] All six files modified per Files table
- [ ] Every Change Specification item applied with exact target text (or documented deviation)
- [ ] No "No shared state", "no global database", or "hermetically isolated" in §8 or multi-project descriptions
- [ ] implementation-spec §8 diagram shows single global DB; bullets mention project_id and ScopeRegistry
- [ ] project-plan non-goals and Isolation row updated; ADR-007 optionally mentions ProjectId
- [ ] security.md SOC 2 row updated; documentation-review DR-09 updated; AIC-architect has Global DB reminder
- [ ] mvp-progress.md Notes "Store changes" updated to projectId / project_id
- [ ] Factual verification (Step 7) and consistency verification (Step 8) completed and recorded

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
