# AIC Progress

**Current phase:** 0.5 (Quality Release)
**Version target:** 0.2.0
**Phase I (Live Wiring):** 22/24 done (1 deferred)

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
| Telemetry triggerSource field   | Done     | shared/src/core/types/ + storage |
| Claude Code integration layer   | Done     | .claude/hooks/                   |
| Subagent context injection (CC) | Done     | .claude/hooks/                   |
| Compilation perf: lazy scan     | Done     | shared/src/adapters/ + mcp + cli |

### Phase J — Intent & Selection Quality

Highest-impact work. The core value of AIC is picking the right files — if selection is wrong, nothing else matters. Language providers also ensure the summarisation ladder produces semantically safe output per language (correct indentation, signatures, symbol extraction).

| Component                        | Status | Package              |
| -------------------------------- | ------ | -------------------- |
| Richer intent keyword extraction | Done   | shared/src/pipeline/ |
| Intent-aware file discovery      | Done   | shared/src/pipeline/ |
| Import graph signal (TS/JS)      | Done   | shared/src/pipeline/ |
| GenericImportProvider (Py/Go/Rs) | Done   | shared/src/adapters/ |
| PythonProvider (AST-safe)        | Done   | shared/src/adapters/ |
| GoProvider                       | Done   | shared/src/adapters/ |
| RustProvider                     | Done   | shared/src/adapters/ |
| JavaProvider                     | Done   | shared/src/adapters/ |
| RubyProvider                     | Done   | shared/src/adapters/ |
| PhpProvider                      | Done   | shared/src/adapters/ |
| CssProvider                      | Done   | shared/src/adapters/ |
| HtmlJsxProvider                  | Done   | shared/src/adapters/ |
| ShellScriptProvider              | Done   | shared/src/adapters/ |
| SwiftProvider                    | Done   | shared/src/adapters/ |
| KotlinProvider                   | Done   | shared/src/adapters/ |
| DartProvider                     | Done   | shared/src/adapters/ |

### Phase K — Quality & Benchmarks

Need measurement before optimizing further. Benchmarks prove Phase J worked and guide Phase L.

| Component                      | Status | Package     |
| ------------------------------ | ------ | ----------- |
| Real-project integration tests | Done   | shared/src/ |
| Selection quality benchmarks   | Done   | test/       |
| Token reduction benchmarks     | Done   | test/       |

### Phase L — Transformers & Guard

Incremental output quality improvements, measured by Phase K benchmarks. New transformers must be semantically safe — never break indentation (Python/YAML/Makefile), JSX syntax, or templating languages. Each transformer needs file-type safety tests.

| Component                  | Status | Package              |
| -------------------------- | ------ | -------------------- |
| LicenseHeaderStripper      | Done   | shared/src/pipeline/ |
| Base64InlineDataStripper   | Done   | shared/src/pipeline/ |
| LongStringLiteralTruncator | Done   | shared/src/pipeline/ |
| DocstringTrimmer           | Done   | shared/src/pipeline/ |
| CssVariableSummarizer      | Done   | shared/src/pipeline/ |
| TypeDeclarationCompactor   | Done   | shared/src/pipeline/ |
| TestStructureExtractor     | Todo   | shared/src/pipeline/ |
| ImportDeduplicator         | Todo   | shared/src/pipeline/ |
| HtmlToMarkdownTransformer  | Todo   | shared/src/pipeline/ |
| SvgDescriber               | Todo   | shared/src/pipeline/ |
| YamlCompactor              | Todo   | shared/src/pipeline/ |
| MinifiedCodeSkipper        | Todo   | shared/src/pipeline/ |
| AutoGeneratedSkipper       | Todo   | shared/src/pipeline/ |
| EnvExampleRedactor         | Todo   | shared/src/pipeline/ |
| SchemaFileCompactor        | Todo   | shared/src/pipeline/ |
| Transformer safety tests   | Todo   | shared/src/pipeline/ |
| Guard `warn` severity      | Todo   | shared/src/pipeline/ |

### Phase M — Reporting & Resources

User-facing polish. Comes last because it doesn't improve the core algorithm.

| Component                                    | Status | Package      |
| -------------------------------------------- | ------ | ------------ |
| `aic://session-summary` resource             | Done   | mcp/src/     |
| `aic://last-compilation` resource (fix stub) | Done   | mcp/src/     |
| Conversation tracking: schema + plumbing     | Todo   | shared + mcp |
| Conversation tracking: summary + prompt cmd  | Todo   | shared + mcp |
| Budget utilization in status                 | Todo   | cli/src/     |
| `aic report` (static HTML)                   | Todo   | cli/src/     |

---

## Known Limitations & Future Work

| ID     | Area      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Target    |
| ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| KL-001 | Storage   | No data retention policy for `compilation_log`, `telemetry_events`, `guard_findings`, `server_sessions`. Tables grow unbounded. At current rates (~18 rows/day), this is negligible for months; becomes relevant at enterprise scale.                                                                                                                                                                                                                                                                                                                                                                                                                                          | Phase 1   |
| KL-002 | Storage   | Repo map cache has TTL pruning via `CacheStore.purgeExpired()` on MCP/CLI startup. No orphan pruning: cached repo maps for deleted or moved projects remain until expiry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Phase 1   |
| KL-003 | Storage   | `anonymous_telemetry_log` outbound queue has no TTL or max-size cap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Phase 1   |
| KL-004 | Telemetry | No conversation-level grouping of compilations. Need: (1) migration adding nullable `conversation_id TEXT` column to `compilation_log`, (2) add `conversationId` to `CompilationLogEntry` and `CompilationRequest`, (3) MCP handler + CLI pass the value through from hooks/args, (4) `SqliteStatusStore` gains `getConversationSummary(conversationId)` returning per-conversation aggregates, (5) expose as MCP resource `aic://conversation-summary/{id}` or tool param, (6) wire "show aic chat summary" prompt command. Cursor hooks already have `conversation_id` available via hook context — pass it as an `aic_compile` argument. Claude Code hooks can do the same. | Phase 0.5 |
| KL-005 | Delivery  | Hook-based context delivery for Claude Code. Claude Code's `UserPromptSubmit` hook can inject compiled context as `additionalContext` before Claude processes the message — eliminating the fragile trigger rule and tool-call round-trip. See `documentation/future/claude-code-hook-integration.md` for the full plan. `TRIGGER_SOURCE.HOOK` enum value already added. Blocked on hooks API stability (PostToolUse `additionalContext` bug anthropics/claude-code#24788).                                                                                                                                                                                                    | Phase 1   |

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

### 2025-03-03

**Components:** CssVariableSummarizer, aic://session-summary resource, aic://last-compilation resource
**Completed:**

- aic://last-compilation resource (task 068): Replaced stub in mcp/src/server.ts with real handler using SqliteStatusStore(scope.db, scope.clock), getSummary(); returns JSON { compilationCount, lastCompilation }; two tests (last_compilation_resource_returns_json, last_compilation_resource_empty_db) with InMemoryTransport, aic_compile then readResource / readResource only; lint, typecheck, test, knip (no new findings), lint:clones 0.
- aic://session-summary resource (task 065): MCP resource at aic://session-summary returning StatusAggregates as application/json; handler in mcp/src/server.ts instantiates SqliteStatusStore(scope.db, scope.clock), getSummary(), JSON.stringify; two tests (session_summary_resource_returns_json, session_summary_resource_empty_db) with InMemoryTransport and client.readResource; lint, typecheck, test, knip (no new findings), lint:clones 0.
- CssVariableSummarizer (task 064): ContentTransformer that keeps :root block compacted and replaces other rule bodies with [N declarations]; fileExtensions = [".css", ".scss"]; brace-counting scan; wired after lockFileSkipper in create-pipeline-deps; seven tests (root_block_kept_compacted, root_plus_rules_summarized, multiple_rules_summarized, empty_content_returns_unchanged, no_blocks_unchanged, safety_css_structure_preserved, safety_scss_structure_preserved); token and selection benchmarks unchanged. Verification: 17/17 dimensions pass (one fix during implementation: findTopLevelBlocks refactored from .push() to reduce for immutability).

### 2025-03-02

**Components:** KotlinProvider, DartProvider, Real-project integration tests, Token reduction benchmarks, LicenseHeaderStripper, Base64InlineDataStripper, LongStringLiteralTruncator, DocstringTrimmer, TypeDeclarationCompactor
**Completed:**

- TypeDeclarationCompactor (task 063): ContentTransformer that collapses multi-line type/interface/enum/declare declarations in .d.ts to single-line form; fileExtensions = [".d.ts"]; getExtension in content-transformer-pipeline returns ".d.ts" for paths ending in ".d.ts"; wired after lockFileSkipper in create-pipeline-deps; line-based scan with brace counting; eight tests (multi_line_type_collapsed, multi_line_interface_collapsed, multi_line_enum_collapsed, declare_block_collapsed, single_line_unchanged, empty_content_returns_unchanged, no_declaration_content_unchanged, safety_d_ts_structure_preserved); token benchmark unchanged (1192).
- DocstringTrimmer (task 062): ContentTransformer that replaces Python \"\"\"...\"\"\", '''...''', and JSDoc /\*_ ... _/ docstrings longer than 200 chars with placeholder preserving delimiter and original length; fileExtensions = []; wired fourth in create-pipeline-deps (after longStringLiteralTruncator, before whitespaceNormalizer); regex-based replace with callback; nine tests (long_python_double_docstring_trimmed, long_python_single_docstring_trimmed, long_jsdoc_block_trimmed, short_docstring_unchanged, empty_content_returns_unchanged, no_docstring_pattern_unchanged, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token benchmark pass; baseline unchanged.
- LongStringLiteralTruncator (task 061): ContentTransformer that replaces double- and single-quoted string literals longer than 200 chars with placeholder preserving quote type and original length; fileExtensions = []; wired third in create-pipeline-deps (after base64InlineDataStripper, before whitespaceNormalizer); regex-based replace with callback; nine tests (long_double_quoted_truncated, long_single_quoted_truncated, short_literal_unchanged, empty_content_returns_unchanged, escaped_quotes_inside_preserved, multiple_long_literals_both_replaced, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token and selection benchmarks pass; baseline unchanged.
- Base64InlineDataStripper (task 060): ContentTransformer that replaces data URLs (data:<mime>;base64,<payload>) with "[base64 inline data stripped]"; fileExtensions = []; wired second in create-pipeline-deps (after LicenseHeaderStripper); regex global replace; seven tests (strips_data_url_base64, no_data_url_returns_unchanged, empty_content_returns_unchanged, multiple_data_urls_replaced, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token baseline unchanged (fixture has no data URLs).
- LicenseHeaderStripper (task 059): ContentTransformer that strips leading comment blocks containing License/Copyright/Permission/SPDX (case-insensitive); stops at first blank line so only the license paragraph is removed; fileExtensions = []; wired first in create-pipeline-deps transformers; eight tests (c-style, hash, no keyword, empty, body not stripped, safety Python/YAML/JSX); token baseline 1198 → 1192.
- Real-project integration tests (task 056): shared/src/integration/**tests**/real-project-integration.test.ts wires real createProjectScope, createCachingFileContentReader, createFullPipelineDeps (real RepoMapSupplier), LoadConfigFromFile, applyConfigResult, initLanguageProviders; rulePackProvider from loadRulePackFromPath and createProjectFileReader (no mcp import); projectRoot = toAbsolutePath(process.cwd()); three tests (real_project_compile_succeeds, real_project_compile_output_has_expected_structure, real_project_second_run_cache_hit) with 30s timeout.
- KotlinProvider (task 052): LanguageProvider for .kt with regex only; parseImports for `import package.Class` and `import package.*` (source = path, isRelative when source starts with "."); extractSignaturesWithDocs returns []; extractSignaturesOnly for fun/class/object lines as CodeChunk (SYMBOL_TYPE.FUNCTION or CLASS); extractNames for same as ExportedSymbol[] (SYMBOL_KIND.FUNCTION or CLASS); createRegexLanguageProviderClass (Null Object); wired in initLanguageProviders (projectHasExtension .kt). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- DartProvider (task 053): LanguageProvider for .dart with regex only; parseImports for `import '...'` and `import "..."` (source = path or package URI, isRelative when source starts with "." or contains "/"); extractSignaturesWithDocs returns []; extractSignaturesOnly for void/class/typedef and ReturnType name( lines as CodeChunk (SYMBOL_TYPE.FUNCTION or CLASS); extractNames for same as ExportedSymbol[] (SYMBOL_KIND.FUNCTION or CLASS); createRegexLanguageProviderClass (Null Object); wired in initLanguageProviders (projectHasExtension .dart). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- Token reduction benchmarks (task 058): enriched test/benchmarks/repos/1 with transformer-exercisable content (license headers, comments, package.json, package-lock.json, src/auth/config.json, src/styles.css); updated test/benchmarks/expected-selection/1.json for pipeline selection; test/benchmarks/baseline.json (empty then entry "1" on first run); shared/src/integration/**tests**/token-reduction-benchmark.test.ts wires CompilationRunner with fixture root, token_reduction_task1_matches_or_establishes_baseline (establish or assert ≤5% token increase, ≤2× duration); updated full-pipeline and golden-snapshot snapshots for enriched fixture.

### 2026-03-02

**Components:** HtmlJsxProvider, ShellScriptProvider, SwiftProvider, Selection quality benchmarks
**Completed:**

- HtmlJsxProvider (task 049): LanguageProvider for .html with regex only; parseImports for `<script src="...">` and `<link href="...">` (source = URL/path, isRelative when "." or "/"); extractSignaturesWithDocs returns []; extractSignaturesOnly for opening tags `<[a-zA-Z][a-zA-Z0-9]*` as CodeChunk with SYMBOL_TYPE.CLASS; extractNames returns []; tryOrEmpty (Null Object); wired in initLanguageProviders (projectHasExtension .html). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_empty, invalid_returns_empty).
- ShellScriptProvider (task 050): LanguageProvider for .sh and .bash with regex only; parseImports for source "file" and . "file" (source = path, isRelative when path starts with "."); extractSignaturesWithDocs returns []; extractSignaturesOnly for function name (function \w+ or \w+ () {) as CodeChunk with SYMBOL_TYPE.FUNCTION; extractNames for same function names as ExportedSymbol[] with SYMBOL_KIND.FUNCTION; tryOrEmpty (Null Object); manual class for two extensions; wired in initLanguageProviders (projectHasExtension .sh || .bash). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- SwiftProvider (task 051): LanguageProvider for .swift with regex only; parseImports for import Module and import struct/class/enum/protocol Module.Class (source = module path, isRelative false); extractSignaturesWithDocs returns []; extractSignaturesOnly for func/class/struct/enum lines as CodeChunk (FUNCTION or CLASS); extractNames for same as ExportedSymbol[] (SYMBOL_KIND.FUNCTION or CLASS); createRegexLanguageProviderClass + tryOrEmpty (Null Object); wired in initLanguageProviders (projectHasExtension .swift). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- Selection quality benchmarks (task 057): test/benchmarks/expected-selection/1.json baseline with intent and selectedPaths for canonical task 1; shared/src/integration/**tests**/selection-quality-benchmark.test.ts wires real createProjectScope, createCachingFileContentReader, createFullPipelineDeps, initLanguageProviders, LoadConfigFromFile, applyConfigResult; rulePackProvider from loadRulePackFromPath and createProjectFileReader (no mcp import); InspectRunner with fixture root test/benchmarks/repos/1; selection_quality_task1_matches_baseline asserts order-independent set equality of selected paths against committed baseline.

### 2026-03-01

**Components:** PythonProvider (AST-safe), ModelDetector, ModelDetectorDispatch, compile-handler getModelId, EditorModelConfigReader, EditorModelConfigReaderAdapter, Config model override, GoProvider, RustProvider, JavaProvider, RubyProvider, PhpProvider, CssProvider, cache purge
**Completed:**

- CssProvider (task 048): LanguageProvider for .css with regex only; parseImports for @import url("...") and @import "..." (source = URL/path, isRelative when "." or "/"); extractSignaturesWithDocs returns []; extractSignaturesOnly for selector-like lines (e.g. .class, #id) as CodeChunk with SYMBOL_TYPE.CLASS; extractNames returns []; tryOrEmpty (Null Object); wired in initLanguageProviders (projectHasExtension .css). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_empty, invalid_returns_empty).
- PhpProvider (task 047): LanguageProvider for .php with regex only; parseImports for require/include/require_once/include_once and use Namespace\\Class (path or namespace, isRelative when path starts with "." or "./"); extractSignaturesWithDocs returns []; extractSignaturesOnly for function/class lines; extractNames for class/function; tryOrEmpty returns [] (Null Object); wired in initLanguageProviders (projectHasExtension .php). Shared regex-language-provider-helpers (parseImportsFromPatterns, extractSignaturesFromLineMatchers, extractNamesFromMatchers, tryOrEmpty, createRegexLanguageProviderClass) used by RubyProvider, PhpProvider, and GenericImportProvider; 0% jscpd. Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- RubyProvider (task 046): LanguageProvider for .rb with regex only (no new dependency); parseImports for require/load with quoted paths and isRelative when path starts with "."; extractSignaturesWithDocs returns []; extractSignaturesOnly for def/class lines as CodeChunk; extractNames for class/module/def self; try/catch returns [] (Null Object); wired in initLanguageProviders (projectHasExtension .rb); shared EMPTY_RELATIVE_PATH in core/types/paths and language-provider-common.ts re-exports to eliminate jscpd clone with generic-import-provider; four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- Cache purge on session end: removed per-run purgeExpired from CompilationRunner; MCP shutdown handler (registerShutdownHandler) now accepts CacheStore and calls purgeExpired before stopSession so .aic/cache expired blobs are cleaned when the MCP server exits (SIGINT/SIGTERM). CLI still purges at scope creation (once per command).
- RustProvider (task 044): LanguageProvider for .rs via defineTreeSitterProvider and tree-sitter-rust; parseImports (use_declaration), extractSignaturesWithDocs/Only (function_item, function_signature_item, impl_item, struct_item), extractNames (pub items and impl); wired in initLanguageProviders (projectHasExtension .rs); ESLint restricts tree-sitter-rust to rust-provider.ts; tree-sitter-provider-shared barrel and tree-sitter-node-utils helpers (docCommentBefore, buildSignatureChunk, walkTreeCollectImports, singleImportRef, oneImportRefFromNode) to eliminate clones with go-provider; five tests (parseImports_returns_refs, extractSignaturesWithDocs_returns_chunks, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_rust_returns_empty).
- JavaProvider (task 045): LanguageProvider for .java via defineTreeSitterProvider and tree-sitter-java; parseImports (import_declaration), extractSignaturesWithDocs/Only (method_declaration, class_declaration, interface_declaration), extractNames (public modifier); wired in initLanguageProviders (projectHasExtension .java); ESLint restricts tree-sitter-java to java-provider.ts; createSignatureCollectors in tree-sitter-node-utils to eliminate clones with go-provider; five tests (parseImports_returns_refs, extractSignaturesWithDocs_returns_chunks, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_java_returns_empty). Fixed server.test.ts CacheStore mock for typecheck.
- PythonProvider (task 042): LanguageProvider for .py using tree-sitter and tree-sitter-python; parseImports (import_statement, import_from_statement), extractSignaturesWithDocs/Only (function_definition, class_definition with docstring), extractNames; try/catch returns []; wired in create-pipeline-deps after TypeScriptProvider, before GenericImportProvider; ESLint restricts tree-sitter and tree-sitter-python to python-provider.ts only; tests skip when tree-sitter native build unavailable (Node 24); server.test.ts skips when server module fails to load.
- KL-006 (partial): ModelDetector interface and ModelEnvHints type in core; ModelDetectorDispatch adapter with Record<EditorId, DetectFn> (ANTHROPIC_MODEL, CURSOR_MODEL); createCompileHandler accepts getModelId(editorId), uses it when args.modelId is null; MCP server wires ModelDetectorDispatch and passes getModelId to handler. compilation_log.model_id now populated when env vars set. Full EditorAdapter/registry and file-based detection deferred.
- File-based model detection (task 054): EditorModelConfigReader interface in core; EditorModelConfigReaderAdapter in adapters (homeDir-injected, reads ~/.cursor/settings.json and ~/.claude/settings.json key "model" via path.join, fs.existsSync, fs.readFileSync, JSON.parse); MCP server creates adapter with process.env["HOME"] ?? os.homedir(), builds ModelEnvHints with env ?? editorConfigReader.read(EDITOR_ID.\*) fallback; six adapter tests (cursor/claude_code/generic, missing file, malformed JSON, missing model key).
- Config model override (task 055): ResolvedConfig gains optional model.id; AicConfigSchema and buildResolvedConfig pass model; applyConfigResult returns modelId (config.model?.id ?? null); createCompileHandler gains modelIdOverride, resolution order args.modelId ?? modelIdOverride ?? getModelId(editorId); MCP destructures configModelId and passes to handler; two tests (config_model_override_in_handler, config_override_takes_precedence_over_detector); getRequestCaptured helper in compile-handler test for type narrowing.
- GoProvider (task 043 re-execution): LanguageProvider for .go via defineTreeSitterProvider and tree-sitter-go; parseImports (import_declaration/import_spec), extractSignaturesWithDocs/Only (function_declaration, method_declaration, type_spec), extractNames (exported Go names); wired in initLanguageProviders (projectHasExtension .go); ESLint restricts tree-sitter-go to go-provider.ts; five tests (parseImports_returns_refs, extractSignaturesWithDocs_returns_chunks, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_go_returns_empty).

### 2026-02-28

**Components:** 002-server-sessions migration, SessionTracker interface, SqliteSessionStore, Richer intent keyword extraction, Compilation perf: lazy scan, Intent-aware file discovery, GenericImportProvider, Import graph signal (TS/JS)
**Completed:**

- Import graph signal (TS/JS) (task 040): ImportProximityScorer interface and ImportGraphProximityScorer; resolveImportSpec in paths.ts (pure, no node:path); HeuristicSelector takes scorer, uses getScores in scoreCandidate (depth 0→1.0, 1→0.6, 2→0.3, 3+→0.1); wired in create-pipeline-deps; shared getProvider and pathRelevance to eliminate clones; paths.test.ts and import-graph-proximity-scorer.test.ts; stub scorer in heuristic-selector, compilation-runner, full-pipeline, golden tests; import_proximity_increases_score test
- GenericImportProvider (task 040): LanguageProvider for .py, .go, .rs, .java with regex parseImports (Python import/from, Go import single and group, Rust use, Java import), extractSignaturesWithDocs returns [], extractSignaturesOnly/extractNames run all four language extractors and merge; registered in create-pipeline-deps before GenericProvider; eight tests (parseImports per language, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, never_throws, extensions and id)
- Intent-aware file discovery (task 039): IntentAwareFileDiscoverer interface and pipeline implementation; filter repo.files by excludePatterns then includePatterns or keyword match; empty filter returns repo unchanged; wired in run-pipeline-steps (discover after getRepoMap, pass discoveredRepoMap to selectContext) and create-pipeline-deps; five tests (keyword filter, include patterns, exclude patterns, general task no filter, empty filter returns original)
- 002-server-sessions migration (task 031): migration 002-server-sessions.ts creates server_sessions table (session_id, started_at, stopped_at, stop_reason, pid, version); open-database runs [migration001, migration002]; migration-runner test applies_002_and_creates_server_sessions_table
- SessionTracker interface (task 032): SessionTracker interface in core/interfaces (startSession, stopSession, backfillCrashedSessions); STOP_REASON and StopReason in core/types/enums.ts
- SqliteSessionStore (task 033): SqliteSessionStore in storage implements SessionTracker; startSession INSERT, stopSession UPDATE by session_id, backfillCrashedSessions UPDATE WHERE stopped_at IS NULL with STOP_REASON.CRASH; five tests (persists row, stopSession updates row, backfill marks open sessions, empty backfill no-op, duplicate startSession throws)
- Startup self-check (integrity) (task 034): migration 003 adds installation_ok, installation_notes to server_sessions; SessionTracker.startSession extended with installationOk, installationNotes; runStartupSelfCheck in mcp/src checks trigger rule, hooks.json sessionStart, hook script; createMcpServer runs self-check, startSession, backfillCrashedSessions on startup; StatusAggregates and SqliteStatusStore getSummary expose installationOk/installationNotes from latest server_sessions; status command displays Installation line (OK / notes / —); tests for startup-self-check, server_sessions row integrity, getSummary installation, migration_003_adds_columns
- Auto-install trigger rule (task 035): installTriggerRule in mcp/src writes .cursor/rules/aic.mdc from template when missing (idempotent, no overwrite); createMcpServer calls installTriggerRule before runStartupSelfCheck; three tests (trigger_missing_creates_file, trigger_exists_does_not_overwrite, trigger_missing_creates_rules_dir)
- Server lifecycle hooks (task 036): registerShutdownHandler in mcp/src/server.ts registers SIGINT/SIGTERM; calls sessionTracker.stopSession(sessionId, clock.now(), STOP_REASON.GRACEFUL) then process.exit(0); createMcpServer wires it after backfillCrashedSessions; try/catch in handler so teardown with closed DB does not throw; test shutdown_handler_calls_stopSession_with_graceful
- Telemetry triggerSource field (task 037): TRIGGER_SOURCE enum and TriggerSource in core/types/enums.ts; optional triggerSource on CompilationRequest and CompilationLogEntry; migration 005 adds trigger_source to compilation_log; buildLogEntry/recordCompilationAndFindings/run pass triggerSource; SqliteCompilationLogStore INSERT trigger_source; MCP schema optional triggerSource, handler defaults to tool_gate when omitted so compilation_log.trigger_source is populated; CLI schema default "cli", compile command sets request.triggerSource; tests for store, runner, MCP, CLI
- Richer intent keyword extraction (task 038): expanded KEYWORDS in intent-classifier.ts (REFACTOR: migrate, extract, inline, rename, dedupe, consolidate, split, merge; BUGFIX: debug, trace, wrong, fail, exception, patch, resolve; FEATURE: extend, support, enable, wire, integrate; DOCS: changelog, docstring, api doc; TEST: stub, unittest, integration test, e2e, fixture); five new test cases; integration snapshots updated for confidence/token values
- Compilation perf: lazy scan — FileSystemRepoMapSupplier no longer reads file contents or tokenizes during scan (uses bytes/4 estimate); removed fileContentReader and tokenCounter from constructor; createCachingFileContentReader adapter with mtime-based cache eliminates repeated readFileSync for same file across pipeline steps; wired in MCP server.ts and CLI main.ts; tests updated (4 tests, 214 total pass)

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
