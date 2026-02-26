# AIC MVP Progress

**Status:** Phase D adapters (TypeScriptProvider done)  
**Phase:** 0 (MVP)  
**Overall:** ~65%

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

| Component                  | Status | Package                     |
| -------------------------- | ------ | --------------------------- |
| IntentClassifier (port)    | Done   | shared/src/core/interfaces/ |
| RulePackResolver (port)    | Done   | shared/src/core/interfaces/ |
| BudgetAllocator (port)     | Done   | shared/src/core/interfaces/ |
| ContextSelector (port)     | Done   | shared/src/core/interfaces/ |
| ContextGuard (port)        | Done   | shared/src/core/interfaces/ |
| ContentTransformer (port)  | Done   | shared/src/core/interfaces/ |
| SummarisationLadder (port) | Done   | shared/src/core/interfaces/ |
| PromptAssembler (port)     | Done   | shared/src/core/interfaces/ |
| Clock (port)               | Done   | shared/src/core/interfaces/ |
| CacheStore (port)          | Done   | shared/src/core/interfaces/ |
| TelemetryStore (port)      | Done   | shared/src/core/interfaces/ |
| ConfigStore (port)         | Done   | shared/src/core/interfaces/ |
| GuardStore (port)          | Done   | shared/src/core/interfaces/ |

### Phase C — Pipeline Steps 1–8

| Component                  | Status | Package              |
| -------------------------- | ------ | -------------------- |
| IntentClassifier impl      | Done   | shared/src/pipeline/ |
| RulePackResolver impl      | Done   | shared/src/pipeline/ |
| BudgetAllocator impl       | Done   | shared/src/pipeline/ |
| HeuristicSelector impl     | Done   | shared/src/pipeline/ |
| ContextGuard impl          | Done   | shared/src/pipeline/ |
| ContentTransformerPipeline | Done   | shared/src/pipeline/ |
| SummarisationLadder impl   | Done   | shared/src/pipeline/ |
| PromptAssembler impl       | Done   | shared/src/pipeline/ |

### Phase D — Adapters

| Component          | Status      | Package              |
| ------------------ | ----------- | -------------------- |
| TiktokenAdapter    | Done        | shared/src/adapters/ |
| FastGlobAdapter    | Done        | shared/src/adapters/ |
| IgnoreAdapter      | Done        | shared/src/adapters/ |
| TypeScriptProvider | Done        | shared/src/adapters/ |
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

### 2026-02-25

**Components:** TiktokenAdapter, TokenCounter interface, FastGlobAdapter, GlobProvider interface, IgnoreAdapter, IgnoreProvider interface, TypeScriptProvider
**Completed:**

- TokenCounter interface in core/interfaces; TiktokenAdapter in adapters with tiktoken cl100k_base and word_count × 1.3 fallback
- ESLint restriction so only tiktoken-adapter.ts may import tiktoken
- Unit tests: empty, non-empty, deterministic, fallback (mock tiktoken throw)
- GlobProvider interface in core/interfaces; FastGlobAdapter in adapters (fast-glob sync API, path.relative for cwd-relative paths)
- ESLint restriction so only fast-glob-adapter.ts may import fast-glob
- Unit tests: empty patterns, matching pattern, negation, deterministic order, error propagation (file-as-cwd)
- IgnoreProvider interface in core/interfaces; IgnoreAdapter in adapters (.gitignore via ignore package sync API)
- ESLint restriction so only ignore-adapter.ts may import ignore
- Unit tests: accepts when not ignored, accepts when ignored, missing .gitignore
- TypeScriptProvider in adapters (LanguageProvider for .ts/.tsx/.js/.jsx): parseImports (regex), extractSignaturesWithDocs/Only (ts.createSourceFile + AST), extractNames (exported symbols + SYMBOL_KIND); ESLint restriction so only typescript-provider.ts may import typescript

### 2026-02-24

**Components:** Phase B core interfaces, Phase C core pipeline types, IntentClassifier, RulePackResolver, BudgetAllocator, HeuristicSelector, ContextGuard, ContentTransformerPipeline, SummarisationLadder, PromptAssembler
**Completed:**

- Phase B domain types (task-classification, rule-pack, selected-file, guard-types, transform-types, repo-map, compilation-types, telemetry-types)
- Phase B port interfaces (intent-classifier, rule-pack-resolver, budget-allocator, context-selector, context-guard, guard-scanner, content-transformer, content-transformer-pipeline, summarisation-ladder, prompt-assembler, cache-store, telemetry-store, config-store, guard-store)
- ISP split: moved CachedCompilation to compilation-types.ts, TelemetryEvent to telemetry-types.ts
- Phase C domain types (ImportRef, CodeChunk, ExportedSymbol) and types barrel exports
- Phase C port interfaces (LanguageProvider, RulePackProvider, BudgetConfig, FileContentReader)
- IntentClassifier, RulePackResolver, BudgetAllocator pipeline implementations and tests
- HeuristicSelector (four-signal scoring, include/exclude/boost/penalize), ContextGuard, ExclusionScanner, SecretScanner, PromptInjectionScanner and tests
- WhitespaceNormalizer, CommentStripper, JsonCompactor, LockFileSkipper; ContentTransformerPipeline, SummarisationLadder, PromptAssembler and tests

### 2026-02-23

**Components:** Project scaffolding, Phase B core interfaces
**Completed:**

- Phase B domain types (task-classification, rule-pack, selected-file, guard-types, transform-types, repo-map, compilation-types, telemetry-types)
- Phase B port interfaces (intent-classifier, rule-pack-resolver, budget-allocator, context-selector, context-guard, guard-scanner, content-transformer, content-transformer-pipeline, summarisation-ladder, prompt-assembler, cache-store, telemetry-store, config-store, guard-store)
- Types barrel and ISP split for CachedCompilation/TelemetryEvent into core/types
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
