# AIC MVP Progress

**Status:** Phase H started (golden snapshot tests done)
**Phase:** 0 (MVP)
**Overall:** ~98%

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

| Component          | Status | Package              |
| ------------------ | ------ | -------------------- |
| TiktokenAdapter    | Done   | shared/src/adapters/ |
| FastGlobAdapter    | Done   | shared/src/adapters/ |
| IgnoreAdapter      | Done   | shared/src/adapters/ |
| TypeScriptProvider | Done   | shared/src/adapters/ |
| GenericProvider    | Done   | shared/src/adapters/ |

### Phase E — Storage

| Component            | Status | Package             |
| -------------------- | ------ | ------------------- |
| SqliteCacheStore     | Done   | shared/src/storage/ |
| SqliteTelemetryStore | Done   | shared/src/storage/ |
| SqliteConfigStore    | Done   | shared/src/storage/ |
| SqliteGuardStore     | Done   | shared/src/storage/ |

### Phase F — MCP Server

| Component               | Status | Package          |
| ----------------------- | ------ | ---------------- |
| Server composition root | Done   | mcp/src/         |
| compile handler         | Done   | mcp/src/         |
| inspect handler         | Done   | mcp/src/         |
| Zod schemas (MCP)       | Done   | mcp/src/schemas/ |

### Phase G — CLI

| Component         | Status | Package           |
| ----------------- | ------ | ----------------- |
| compile command   | Done   | cli/src/commands/ |
| inspect command   | Done   | cli/src/commands/ |
| status command    | Done   | cli/src/commands/ |
| init command      | Done   | cli/src/commands/ |
| Zod schemas (CLI) | Done   | cli/src/schemas/  |

### Phase H — Integration Tests

| Component             | Status      | Package     |
| --------------------- | ----------- | ----------- |
| Golden snapshot tests | Done        | shared/src/ |
| Full pipeline test    | Not started | shared/src/ |

---

## Daily Log

### 2026-02-26

**Components:** compile handler, CompilationRunner interface, CompilationRequestSchema (MCP), inspect handler, InspectRunner, RepoMapSupplier, InspectRequestSchema, Zod schemas (CLI), compile command, inspect command, status command, init command, StatusRunner, StatusStore, openDatabase, SqliteStatusStore, Golden snapshot tests
**Completed:**

- Golden snapshot tests: fixture repo test/benchmarks/repos/1 (src/auth/service.ts, src/index.ts); shared/src/integration/**tests**/golden-snapshot.test.ts wires InspectRunner with mock RepoMapSupplier, mock Clock, FileContentReader; toMatchSnapshot() and determinism (three runs deep-equal); snapshot under **snapshots**; eslint ignore test/benchmarks/, knip ignore test/benchmarks/\*\*
- CompilationRunner interface in shared/core/interfaces; run(request) returns Promise<{ compiledPrompt, meta }>
- CompilationRequestSchema (Zod raw shape) in mcp/src/schemas: intent, projectRoot, modelId, editorId, configPath
- compile-handler.ts: createCompileHandler(runner), validate at boundary, map args to CompilationRequest via branded factories, AicError → sanitizeError + McpError(InternalError), unknown → McpError(Internal error)
- server.ts: stub CompilationRunner, server.tool("aic_compile", CompilationRequestSchema, createCompileHandler(stubRunner))
- Server tests: valid_args_returns_stub_content (callTool with intent+projectRoot, assert compiledPrompt "Not implemented", meta defined), invalid_args_returns_32602 (callTool with {}, assert rejects)
- InspectRequest and PipelineTrace in shared/core/types/inspect-types.ts; RepoMapSupplier and InspectRunner interfaces in core/interfaces
- InspectRunner in shared/pipeline: Steps 1–8 (classify, resolve, allocate, getRepoMap, selectContext, guard.scan, transform, ladder, assemble), tokenSummary and rulePacks built; no FileContentReader; stub RepoMapSupplier in server
- InspectRequestSchema (Zod raw shape) in mcp/schemas; handleInspect in mcp/handlers (parsed args → InspectRequest → runner.inspect, AicError sanitized, path.join for dbPath)
- server.ts: InspectRunner wired with stub RepoMapSupplier (StorageError reject), server.tool("aic_inspect", InspectRequestSchema, handleInspect); aic_inspect_invalid_params and aic_inspect_stub_error tests
- Zod schemas (CLI): CompilationArgsSchema, InspectArgsSchema, InitArgsSchema, StatusArgsSchema in cli/src/schemas/ with z.infer types; four test files (valid/missing/over-max, defaults, upgrade); cli tsconfig exclude adjusted so **tests** are in project for ESLint
- compile command: cli/src/main.ts (Commander aic compile <intent> --root/--config/--db, Zod parse, stub CompilationRunner, exit 0/1/2); cli/src/commands/compile.ts (compileCommand(args, runner), re-validate, build CompilationRequest, runner.run(), stdout compiledPrompt, AicError sanitize); compile.test.ts (valid_args_stdout_stub, invalid_args_throws, runner_throws_aic_error); shared/package.json exports for @aic/shared/\* subpath resolution
- inspect command: cli/src/commands/inspect.ts (inspectCommand(args, runner), InspectArgsSchema.parse, build InspectRequest with dbPath default path.join(projectRoot, ".aic", "aic.sqlite"), runner.inspect(), JSON.stringify({ trace }) to stdout, AicError sanitize); main.ts (inspect subcommand, stub PipelineTrace, inspectStubRunner, exit 0/1/2); inspect.test.ts (valid_args_stdout_stub, invalid_args_throws, runner_throws_aic_error)
- status command: StatusRequest and StatusAggregates in shared/core/types/status-types.ts; StatusStore and StatusRunner interfaces in core/interfaces; openDatabase in shared/storage (Database + SqliteMigrationRunner + migration001); SqliteStatusStore.getSummary() (compilation_log, telemetry_events, guard_findings aggregates); statusCommand in cli/commands/status.ts (no-db / no-compilations messages, formatStatusOutput with Config/Trigger/Database lines, Rules health stub); main.ts status subcommand with real StatusRunner (openDatabase, SqliteStatusStore); sqlite-status-store.test.ts and status.test.ts (valid_args_stdout_stub, no_database_message_exit0, no_compilations_message, runner_throws_aic_error)
- init command: InitArgsSchema extended with BaseArgsSchema (projectRoot, configPath, dbPath, upgrade); initCommand in cli/commands/init.ts (scaffold aic.config.json, .aic/ 0700, .gitignore create/append, --upgrade backup and v1 identity); main.ts init subcommand; init.test.ts (config_created_and_aic_dir_0700, gitignore cases, config_already_exists, upgrade_backs_up); init-args.test.ts projectRoot required

### 2026-02-25

**Components:** TiktokenAdapter, TokenCounter interface, FastGlobAdapter, GlobProvider interface, IgnoreAdapter, IgnoreProvider interface, TypeScriptProvider, GenericProvider, SqliteCacheStore, SqliteTelemetryStore, SqliteConfigStore, SqliteGuardStore, MCP server composition root
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
- GenericProvider in adapters (LanguageProvider fallback): empty extensions, parseImports/extractSignaturesWithDocs return []; extractSignaturesOnly (regex function/class/def/fn), extractNames (regex export patterns); never throws
- SqliteCacheStore: CacheStore impl with cache_metadata table and cache-dir JSON blobs; ESLint override for node:fs/node:path in sqlite-cache-store.ts only; set/get/invalidate/invalidateAll; expiry via SQL; tests for set-then-get, missing key, invalidate, invalidateAll, expiry, missing blob, corrupt blob
- SqliteTelemetryStore: TelemetryStore impl writing to telemetry_events; write() with full column mapping and token_reduction_pct; in-memory tests for write persists row, multiple writes, token_reduction_pct (tokensRaw > 0 and 0), duplicate id throws
- SqliteConfigStore: ConfigStore impl with config_history table; getLatestHash (ORDER BY created_at DESC LIMIT 1), writeSnapshot (INSERT OR REPLACE with Clock); in-memory tests for empty null, write then getLatestHash, latest wins
- SqliteGuardStore: GuardStore impl with guard_findings table; write (DELETE then INSERT per finding, replace semantics), queryByCompilation (ORDER BY created_at); in-memory tests for write-then-query, query unknown [], replace same compilation_id, empty findings
- MCP server composition root (mcp/src/server.ts): ensureAicDir (0700), createFileContentReader, createRulePackProvider, createDefaultBudgetConfig, createProjectScope (db, migrations, stores), createMcpServer (adapters + pipeline wired, stub aic_compile/aic_inspect/last-compilation); main() with StdioServerTransport; tests with InMemoryTransport (list_tools, stub_compile, idempotency, permissions)

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
