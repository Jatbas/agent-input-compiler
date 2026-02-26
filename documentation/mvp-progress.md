# AIC MVP Progress

**Status:** Phase A foundation complete — ready for Phase B (core interfaces)  
**Phase:** 0 (MVP)  
**Overall:** ~15%

---

## Implementation Order

### Phase A — Foundation

| Component                    | Status | Package                        |
| ---------------------------- | ------ | ------------------------------ |
| MigrationRunner              | Done   | shared/src/storage/            |
| 001-initial-schema migration | Done   | shared/src/storage/migrations/ |
| UUIDv7 generator             | Done   | shared/src/adapters/           |
| Clock implementation         | Done   | shared/src/adapters/           |
| AicError hierarchy           | Done   | shared/src/core/errors/        |
| sanitizeError utility        | Done   | shared/src/core/errors/        |

### Phase B — Core Interfaces

| Component                  | Status      | Package                     |
| -------------------------- | ----------- | --------------------------- |
| IntentClassifier (port)    | Not started | shared/src/core/interfaces/ |
| RulePackResolver (port)    | Not started | shared/src/core/interfaces/ |
| BudgetAllocator (port)     | Not started | shared/src/core/interfaces/ |
| ContextSelector (port)     | Not started | shared/src/core/interfaces/ |
| ContextGuard (port)        | Not started | shared/src/core/interfaces/ |
| ContentTransformer (port)  | Not started | shared/src/core/interfaces/ |
| SummarisationLadder (port) | Not started | shared/src/core/interfaces/ |
| PromptAssembler (port)     | Not started | shared/src/core/interfaces/ |
| Clock (port)               | Not started | shared/src/core/interfaces/ |
| CacheStore (port)          | Not started | shared/src/core/interfaces/ |
| TelemetryStore (port)      | Not started | shared/src/core/interfaces/ |
| ConfigStore (port)         | Not started | shared/src/core/interfaces/ |
| GuardStore (port)          | Not started | shared/src/core/interfaces/ |

### Phase C — Pipeline Steps 1–8

| Component                  | Status      | Package              |
| -------------------------- | ----------- | -------------------- |
| IntentClassifier impl      | Not started | shared/src/pipeline/ |
| RulePackResolver impl      | Not started | shared/src/pipeline/ |
| BudgetAllocator impl       | Not started | shared/src/pipeline/ |
| HeuristicSelector impl     | Not started | shared/src/pipeline/ |
| ContextGuard impl          | Not started | shared/src/pipeline/ |
| ContentTransformerPipeline | Not started | shared/src/pipeline/ |
| SummarisationLadder impl   | Not started | shared/src/pipeline/ |
| PromptAssembler impl       | Not started | shared/src/pipeline/ |

### Phase D — Adapters

| Component          | Status      | Package              |
| ------------------ | ----------- | -------------------- |
| TiktokenAdapter    | Not started | shared/src/adapters/ |
| FastGlobAdapter    | Not started | shared/src/adapters/ |
| IgnoreAdapter      | Not started | shared/src/adapters/ |
| TypeScriptProvider | Not started | shared/src/adapters/ |
| GenericProvider    | Not started | shared/src/adapters/ |

### Phase E — Storage

| Component            | Status      | Package             |
| -------------------- | ----------- | ------------------- |
| SqliteCacheStore     | Not started | shared/src/storage/ |
| SqliteTelemetryStore | Not started | shared/src/storage/ |
| SqliteConfigStore    | Not started | shared/src/storage/ |
| SqliteGuardStore     | Not started | shared/src/storage/ |

### Phase F — MCP Server

| Component               | Status      | Package          |
| ----------------------- | ----------- | ---------------- |
| Server composition root | Not started | mcp/src/         |
| compile handler         | Not started | mcp/src/         |
| inspect handler         | Not started | mcp/src/         |
| Zod schemas (MCP)       | Not started | mcp/src/schemas/ |

### Phase G — CLI

| Component         | Status      | Package           |
| ----------------- | ----------- | ----------------- |
| compile command   | Not started | cli/src/commands/ |
| inspect command   | Not started | cli/src/commands/ |
| status command    | Not started | cli/src/commands/ |
| init command      | Not started | cli/src/commands/ |
| Zod schemas (CLI) | Not started | cli/src/schemas/  |

### Phase H — Integration Tests

| Component             | Status      | Package     |
| --------------------- | ----------- | ----------- |
| Golden snapshot tests | Not started | shared/src/ |
| Full pipeline test    | Not started | shared/src/ |

---

## Daily Log

### 2026-02-23

**Components:** Project scaffolding
**Completed:**

- Renamed documentation files to kebab-case (`project-plan.md`, `mvp-specification-phase0.md`)
- Added file naming conventions to Cursor rules and CLAUDE.md
- Configured pnpm workspaces (`shared`, `cli`, `mcp`)
- Created per-package `tsconfig.json` with project references
- Created `vitest.config.ts` with workspace path aliases
- Scaffolded all source directories with `.gitkeep` files
- Created `mvp-progress.md` and `update-mvp-progress` Cursor skill
- Created `001-initial-schema.ts` migration with all 8 MVP tables
- Added ESLint file naming rule (`eslint-plugin-check-file`, kebab-case)
- Added comment linter rules (`ban-ts-comment`, `no-warning-comments`, `spaced-comment`)
- Added `noInlineConfig` anti-bypass — agents cannot disable ESLint rules inline
- Renamed `SECURITY.md` to `security.md`, updated all cross-references
- Added database/migration enforcement rules to Cursor rules and CLAUDE.md
- Added comment policy (no JSDoc unless cross-package API, explain why not what)
- MigrationRunner interface (ExecutableDb, Migration, MigrationRunner) in core/interfaces
- SqliteMigrationRunner in shared/src/storage with bootstrap and ordered apply
- Clock interface in core/interfaces for applied_at timestamps
- Tests for SqliteMigrationRunner (apply, idempotent second run, all MVP tables created)
- IdGenerator interface and UuidV7Generator adapter (RFC 9562, zero-dependency)
- SystemClock adapter implementing Clock
- AicError base and subclasses (Config, GuardBlockedAll, BudgetExceeded, NoFilesSelected, Model, Storage, Timeout)
- sanitizeError utility (strip paths, env vars; AicError code passthrough)
- Tests for UuidV7Generator and sanitizeError
