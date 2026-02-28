# AIC Progress

**Current phase:** 0.5 (Quality Release)
**Version target:** 0.2.0
**Phase I (Live Wiring):** 20/23 done (1 deferred)

---

## Phase 0.5 — Quality Release

### Phase I — Live Wiring & Bug Fixes

Prerequisite for everything else. Quick fixes to make the tool fully functional.

| Component                       | Status   | Package                          |
| ------------------------------- | -------- | -------------------------------- |
| FileSystemRepoMapSupplier       | Done     | shared/src/adapters/             |
| createFullPipelineDeps          | Done     | shared/src/bootstrap             |
| Wire real RepoMap in MCP/CLI    | Done     | mcp/, cli/                       |
| Wire real InspectRunner (CLI)   | Done     | cli/src/main.ts                  |
| Telemetry write on compile      | Done     | shared/src/core/ + mcp + cli     |
| Guard findings write on scan    | Done     | shared/src/storage/              |
| Config loading from aic.config  | Done     | shared/src/config/ + mcp + cli   |
| Real token counting in repo map | Done     | shared/src/adapters/             |
| WhitespaceNormalizer exclusions | Done     | shared/src/pipeline/             |
| 002-server-sessions migration   | Done     | shared/src/storage/migrations/   |
| SessionTracker interface        | Done     | shared/src/core/interfaces/      |
| SqliteSessionStore              | Done     | shared/src/storage/              |
| sessionStart compile hook       | Done     | .cursor/hooks/                   |
| preToolUse gate hook            | Done     | .cursor/hooks/                   |
| beforeSubmitPrompt logging hook | Done     | .cursor/hooks/                   |
| afterFileEdit tracking hook     | Done     | .cursor/hooks/                   |
| stop quality check hook         | Done     | .cursor/hooks/                   |
| Startup self-check (integrity)  | Done     | mcp/src/                         |
| Auto-install trigger rule       | Done     | mcp/src/                         |
| Server lifecycle hooks          | Done     | mcp/src/                         |
| Telemetry conversation tracking | Deferred | — (see KL-004)                   |
| Telemetry triggerSource field   | Todo     | shared/src/core/types/ + storage |
| Claude Code integration layer   | Todo     | .claude/hooks/                   |
| Subagent context injection (CC) | Todo     | .claude/hooks/                   |

### Phase J — Intent & Selection Quality

Highest-impact work. The core value of AIC is picking the right files — if selection is wrong, nothing else matters. Language providers also ensure the summarisation ladder produces semantically safe output per language (correct indentation, signatures, symbol extraction).

| Component                        | Status | Package              |
| -------------------------------- | ------ | -------------------- |
| Richer intent keyword extraction | Todo   | shared/src/pipeline/ |
| Intent-aware file discovery      | Todo   | shared/src/pipeline/ |
| Import graph signal (TS/JS)      | Todo   | shared/src/pipeline/ |
| GenericImportProvider (Py/Go/Rs) | Todo   | shared/src/adapters/ |
| PythonProvider (AST-safe)        | Todo   | shared/src/adapters/ |
| GoProvider                       | Todo   | shared/src/adapters/ |
| RustProvider                     | Todo   | shared/src/adapters/ |
| JavaProvider                     | Todo   | shared/src/adapters/ |
| RubyProvider                     | Todo   | shared/src/adapters/ |
| PhpProvider                      | Todo   | shared/src/adapters/ |
| CssProvider                      | Todo   | shared/src/adapters/ |
| HtmlJsxProvider                  | Todo   | shared/src/adapters/ |
| ShellScriptProvider              | Todo   | shared/src/adapters/ |
| SwiftProvider                    | Todo   | shared/src/adapters/ |
| KotlinProvider                   | Todo   | shared/src/adapters/ |
| DartProvider                     | Todo   | shared/src/adapters/ |

### Phase K — Quality & Benchmarks

Need measurement before optimizing further. Benchmarks prove Phase J worked and guide Phase L.

| Component                      | Status | Package     |
| ------------------------------ | ------ | ----------- |
| Real-project integration tests | Todo   | shared/src/ |
| Selection quality benchmarks   | Todo   | test/       |
| Token reduction benchmarks     | Todo   | test/       |

### Phase L — Transformers & Guard

Incremental output quality improvements, measured by Phase K benchmarks. New transformers must be semantically safe — never break indentation (Python/YAML/Makefile), JSX syntax, or templating languages. Each transformer needs file-type safety tests.

| Component                 | Status | Package              |
| ------------------------- | ------ | -------------------- |
| CssVariableSummarizer     | Todo   | shared/src/pipeline/ |
| TypeDeclarationCompactor  | Todo   | shared/src/pipeline/ |
| TestStructureExtractor    | Todo   | shared/src/pipeline/ |
| ImportDeduplicator        | Todo   | shared/src/pipeline/ |
| HtmlToMarkdownTransformer | Todo   | shared/src/pipeline/ |
| SvgDescriber              | Todo   | shared/src/pipeline/ |
| YamlCompactor             | Todo   | shared/src/pipeline/ |
| MinifiedCodeSkipper       | Todo   | shared/src/pipeline/ |
| AutoGeneratedSkipper      | Todo   | shared/src/pipeline/ |
| Transformer safety tests  | Todo   | shared/src/pipeline/ |
| Guard `warn` severity     | Todo   | shared/src/pipeline/ |

### Phase M — Reporting & Resources

User-facing polish. Comes last because it doesn't improve the core algorithm.

| Component                        | Status | Package  |
| -------------------------------- | ------ | -------- |
| `aic://session-summary` resource | Todo   | mcp/src/ |
| `aic report` (static HTML)       | Todo   | cli/src/ |
| Budget utilization in status     | Todo   | cli/src/ |

---

## Known Limitations & Future Work

| ID     | Area      | Description                                                                                                                                                                                                                                                                                                                                                                                 | Target  |
| ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| KL-001 | Storage   | No data retention policy for `compilation_log`, `telemetry_events`, `guard_findings`, `server_sessions`. Tables grow unbounded. At current rates (~18 rows/day), this is negligible for months; becomes relevant at enterprise scale.                                                                                                                                                       | Phase 1 |
| KL-002 | Storage   | No `repomap_cache` pruning. Cached repo maps for deleted/moved projects remain indefinitely.                                                                                                                                                                                                                                                                                                | Phase 1 |
| KL-003 | Storage   | `anonymous_telemetry_log` outbound queue has no TTL or max-size cap.                                                                                                                                                                                                                                                                                                                        | Phase 1 |
| KL-004 | Telemetry | No conversation-level grouping of compilations. MCP tool calls do not carry editor conversation IDs; session-level grouping via `compilation_log.session_id` is the current granularity. True conversation tracking requires the Phase 1+ agentic session layer or MCP protocol extensions. Cursor hooks already log `conversation_id` to `.aic/prompt-log.jsonl` for external correlation. | Phase 1 |

---

## Phase 0 — MVP (complete)

### Implementation Order

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

| Component             | Status | Package     |
| --------------------- | ------ | ----------- |
| Golden snapshot tests | Done   | shared/src/ |
| Full pipeline test    | Done   | shared/src/ |

---

## Daily Log

### 2026-02-28

**Components:** 002-server-sessions migration, SessionTracker interface, SqliteSessionStore
**Completed:**

- 002-server-sessions migration (task 031): migration 002-server-sessions.ts creates server_sessions table (session_id, started_at, stopped_at, stop_reason, pid, version); open-database runs [migration001, migration002]; migration-runner test applies_002_and_creates_server_sessions_table
- SessionTracker interface (task 032): SessionTracker interface in core/interfaces (startSession, stopSession, backfillCrashedSessions); STOP_REASON and StopReason in core/types/enums.ts
- SqliteSessionStore (task 033): SqliteSessionStore in storage implements SessionTracker; startSession INSERT, stopSession UPDATE by session_id, backfillCrashedSessions UPDATE WHERE stopped_at IS NULL with STOP_REASON.CRASH; five tests (persists row, stopSession updates row, backfill marks open sessions, empty backfill no-op, duplicate startSession throws)
- Startup self-check (integrity) (task 034): migration 003 adds installation_ok, installation_notes to server_sessions; SessionTracker.startSession extended with installationOk, installationNotes; runStartupSelfCheck in mcp/src checks trigger rule, hooks.json sessionStart, hook script; createMcpServer runs self-check, startSession, backfillCrashedSessions on startup; StatusAggregates and SqliteStatusStore getSummary expose installationOk/installationNotes from latest server_sessions; status command displays Installation line (OK / notes / —); tests for startup-self-check, server_sessions row integrity, getSummary installation, migration_003_adds_columns
- Auto-install trigger rule (task 035): installTriggerRule in mcp/src writes .cursor/rules/aic.mdc from template when missing (idempotent, no overwrite); createMcpServer calls installTriggerRule before runStartupSelfCheck; three tests (trigger_missing_creates_file, trigger_exists_does_not_overwrite, trigger_missing_creates_rules_dir)
- Server lifecycle hooks (task 036): registerShutdownHandler in mcp/src/server.ts registers SIGINT/SIGTERM; calls sessionTracker.stopSession(sessionId, clock.now(), STOP_REASON.GRACEFUL) then process.exit(0); createMcpServer wires it after backfillCrashedSessions; try/catch in handler so teardown with closed DB does not throw; test shutdown_handler_calls_stopSession_with_graceful

### 2026-02-27

**Components:** FileSystemRepoMapSupplier, createFullPipelineDeps, Wire real InspectRunner (CLI), Phase 0.5 planning, Telemetry write on compile, Guard findings write on scan, Config loading from aic.config, Real token counting in repo map
**Completed:**

- Config loading from aic.config (task 028): ResolvedConfig type and defaultResolvedConfig; ConfigLoader and LoadConfigResult interfaces; LoadConfigFromFile with Zod schema (contextBudget.maxTokens/perTaskClass, contextSelector.heuristic.maxFiles); applyConfigResult for snapshot write and budget/heuristic build; ESLint override for shared/src/config/\*\* (node:fs, node:path, zod); createPipelineDeps/createFullPipelineDeps accept optional heuristicSelectorConfig; MCP and CLI load config, write snapshot when file present, pass budget and heuristic to createFullPipelineDeps; five tests (missing file, valid file, invalid JSON/schema, explicit path)
- Real token counting in repo map (task 029): FileSystemRepoMapSupplier now takes FileContentReader and TokenCounter; real token count via getContent + countTokens with bytes/4 fallback on read or count failure; createFullPipelineDeps wires fileContentReader and tiktokenAdapter into FileSystemRepoMapSupplier; five adapter tests (real token count, getContent throw fallback, binary excluded, totalTokens sum, empty project)
- WhitespaceNormalizer exclusions (task 030): excludedExtensions constructor param and early return in transform (extension from filePath via lastIndexOf/slice, case-insensitive); WHITESPACE_EXCLUDED_EXTENSIONS in create-pipeline-deps (.md, .mdx, .py, .yml, .yaml); four tests (excluded unchanged, non-excluded normalized, empty list normalizes all, case-insensitive)
- FileSystemRepoMapSupplier adapter (GlobProvider + IgnoreProvider + fs.stat, binary extension filter, language detection, bytes/4 token estimate)
- createFullPipelineDeps in bootstrap (eliminates MCP/CLI wiring duplication, jscpd clean)
- Wire real RepoMapSupplier in MCP server and CLI (replace stub that always threw StorageError)
- MCP server tests updated: valid_args_returns_compiled_prompt, aic_inspect_returns_trace (were testing stub errors)
- Workspace MCP config (.cursor/mcp.json) for live testing in Cursor
- Live test: aic_compile on 208-file repo, 303K→8K tokens (97.3% reduction), 1s; aic_inspect returns full trace
- Phase 0.5 roadmap added to mvp-progress.md
- Wire real InspectRunner in CLI (createInspectRunner, createScopeAndDeps to satisfy 0% jscpd; inspect action uses real pipeline)
- Telemetry write on compile: TelemetryDeps type, buildTelemetryEvent, writeCompilationTelemetry (shared); compile-handler and compile command write after successful run (try/catch, non-fatal); MCP and CLI pass telemetry deps from scope; tests for buildTelemetryEvent, compileCommand with telemetryDeps, createCompileHandler with deps
- Guard findings write on scan: CompilationLogEntry type, CompilationLogStore interface, SqliteCompilationLogStore; CompilationRunner records compilation_log and writes guard findings on every run (cache hit and miss); createProjectScope adds compilationLogStore; MCP and CLI pass guardStore, compilationLogStore, idGenerator to CompilationRunner; tests for store and runner (cache miss/cache hit record+write)

### 2026-02-26

**Components:** compile handler, CompilationRunner interface, CompilationRequestSchema (MCP), inspect handler, InspectRunner, RepoMapSupplier, InspectRequestSchema, Zod schemas (CLI), compile command, inspect command, status command, init command, StatusRunner, StatusStore, openDatabase, SqliteStatusStore, Golden snapshot tests, Full pipeline test, StringHasher, Sha256Adapter, CompilationRunner, ensureAicDir, createProjectScope, loadRulePackFromPath, createProjectFileReader
**Completed:**

- Full pipeline test (task 024): StringHasher interface and Sha256Adapter; Clock addMinutes/durationMs and SystemClock; CompilationRunner (cache key from intent+projectRoot+fileTreeHash+configHash, runPipelineSteps, cache get/set); runPipelineSteps and token-summary in core; InspectRunner/CompilationRunner refactored to (deps, clock) and (deps, clock, cacheStore, configStore, stringHasher); createPipelineDeps in bootstrap; ensureAicDir and createProjectScope in shared; MCP and CLI wire CompilationRunner via createProjectScope and createPipelineDeps; full-pipeline integration test (snapshot, determinism, cache hit); shared load-rule-pack and project-file-reader-adapter to remove CLI/MCP clone.
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
