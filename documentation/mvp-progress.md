# AIC Progress

**Current phase:** 1.0 (OSS Release)
**Version target:** 1.0.0
**Phase 1.0:** 18/43 done
**Previous:** 0.2.0 (Quality Release) — Complete

---

## Phase 1.0 — OSS Release

Specification Compiler, agentic session tracking, research-backed quality and security upgrades, Claude Code hook-based delivery, OSS release prep.

### Phase N — Specification Compiler

Compile project specifications and documentation into structured context alongside code. Rules, ADRs, and design docs are selected and compressed through the same pipeline, ensuring the model has both code and spec awareness.

| Component                          | Status | Package              | Description                                                                 |
| ---------------------------------- | ------ | -------------------- | --------------------------------------------------------------------------- |
| Spec file discovery and scoring    | Done   | shared/src/pipeline/ | Discovers and scores project ADRs, rules, and design docs alongside code    |
| Spec-aware summarisation tier      | Done   | shared/src/adapters/ | Heading-based tier compression for .md/.mdc spec files                      |
| Spec injection in prompt assembler | Done   | shared/src/pipeline/ | Injects a ## Specification section with project rules and ADRs into context |

### Phase O — Agentic Session Tracking

Session-level intelligence for multi-step agent workflows. Deduplication prevents re-compiling identical context across turns; conversation compression maintains quality over long sessions; adaptive budget adjusts allocation based on session history.

| Component                                    | Status | Package              | Deps                | Description                                                        |
| -------------------------------------------- | ------ | -------------------- | ------------------- | ------------------------------------------------------------------ |
| Session-level compilation deduplication      | Done   | shared/src/pipeline/ | —                   | Avoids re-sending files already shown in the current agent session |
| Conversation context compression             | Done   | shared/src/pipeline/ | Session-level dedup | Summarises prior conversation steps into compact session context   |
| Adaptive budget allocation (session history) | Done   | shared/src/pipeline/ | Session-level dedup | Adjusts token budget based on accumulated session token usage      |
| Session tracking storage (migration)         | Done   | shared/src/storage/  | —                   | Persistent session state across turns (migration + store)          |

### Phase P — Context Quality, Token Efficiency & Compilation Performance

Context quality and compilation performance beyond the base heuristic pipeline. Delivered: symbol-level intent matching (ContextBench 2025), bidirectional import graph with reverse dependency walking (InlineCoder/RIG 2026 — 12.2% accuracy gain), adaptive scoring weights per task class, structural context map (RIG 2026 — 57.8% efficiency gain), granular file-level transformation cache, async parallel file I/O, and fast-glob double-stat elimination. Remaining: chunk-level file inclusion (SWE-Pruner 2025 — 23-54% token reduction via task-aware line-level pruning) and cached RepoMap with file watcher for near-zero subsequent scan latency. All implemented within AIC's hexagonal architecture via new classes/interfaces (OCP).

| Component                                       | Status | Package              | Deps                     | Description                                                                     |
| ----------------------------------------------- | ------ | -------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| Adaptive scoring weights per task class         | Done   | shared/src/pipeline/ | —                        | Per-task-class weight profiles (bugfix → recency, refactor → import proximity)  |
| Reverse dependency walking (bidirectional BFS)  | Done   | shared/src/pipeline/ | —                        | Invert import graph to also score files that import seed files                  |
| Symbol-level intent matching                    | Done   | shared/src/pipeline/ | —                        | Match intent subject tokens against exported symbol names via subjectTokens     |
| Structural context map (RIG-inspired)           | Done   | shared/src/pipeline/ | —                        | Compact project architecture summary injected before code context               |
| Chunk-level file inclusion                      | Done   | shared/src/pipeline/ | Symbol-level intent (#1) | Include only relevant functions/blocks instead of whole files                   |
| Granular file-level transformation cache        | Done   | shared/src/storage/  | —                        | Per-file L0–L3 output cached by content hash; skip unchanged files on recompile |
| Scan: eliminate double-stat via fast-glob stats | Done   | shared/src/adapters/ | —                        | Use fast-glob `stats: true` to avoid second `fs.statSync` pass over all files   |
| Scan: async parallel file system I/O            | Done   | shared/src/adapters/ | Eliminate double-stat    | Replace `fg.sync`/`fs.statSync` with async + `Promise.all` for parallel I/O     |
| Scan: cached RepoMap with file watcher          | Done   | shared/src/adapters/ | Async parallel I/O       | `fs.watch` keeps RepoMap in memory; subsequent `getRepoMap()` returns instantly |

### Phase Q — Research-Backed Quality & Security

Research-driven improvements to context retrieval quality, token efficiency, security, and prompt assembly. Motivated by: ContextBench (2026) for process-level evaluation at file/block/line granularity; SWE-Pruner (Jan 2026) for task-aware line-level pruning (23–54% additional token reduction); InlineCoder (Jan 2026) for confidence estimation via deterministic proxies; "Lost in the Middle" (2023–2026) for prompt assembly ordering; and emerging prompt injection analysis targeting coding assistant tool execution. Builds on Phase P foundations (chunk-level inclusion, symbol matching, import graph). See `documentation/future/rule-enforcement-strategies.md` for the Middleware Enforcer design (Phase 2+).

| Component                                              | Status  | Package              | Deps             | Description                                                                              |
| ------------------------------------------------------ | ------- | -------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| Constraints preamble in prompt assembler (LitM)        | Done    | shared/src/pipeline/ | —                | Duplicate top-3 constraints as short preamble before bulk context to mitigate LitM       |
| `contextCompleteness` confidence signal in CompileMeta | Done    | shared/src/core/     | —                | Unresolved imports, missing symbols, intent token coverage in CompilationMeta            |
| Line-level pruner within matched chunks (SWE-Pruner)   | Done    | shared/src/pipeline/ | Chunk-level (#P) | Score lines within L0 chunks against intent tokens; remove irrelevant, keep syntax       |
| `CommandInjectionScanner` (GuardScanner)               | Pending | shared/src/pipeline/ | —                | Detect `$(...)`, backtick substitution, pipe chains in comments/docs                     |
| `MarkdownInstructionScanner` (GuardScanner)            | Done    | shared/src/pipeline/ | —                | Detect high-risk instruction payloads in markdown/doc files                              |
| Block/line-level gold annotations in benchmark suite   | Pending | test/benchmarks/     | —                | Enrich gold set from path-only to block/line ranges per file for ContextBench-style eval |
| Per-task-class precision/recall metrics in benchmarks  | Pending | test/benchmarks/     | Gold annotations | Precision/recall at file, block, line granularity grouped by task class                  |

### Phase R — Claude Code Hook-Based Delivery

Highest-impact delivery item. Claude Code's hook system exposes all 7 capabilities AIC needs (per-prompt, subagent, pre-compaction) — structurally impossible in Cursor. Eliminates the fragile trigger rule + tool-call round-trip by injecting compiled context via `UserPromptSubmit` → `additionalContext`. `TRIGGER_SOURCE.HOOK` enum value already exists. See `documentation/future/claude-code-hook-integration.md` for full design.

| Component                                      | Status  | Package        | Deps                  | Description                                      |
| ---------------------------------------------- | ------- | -------------- | --------------------- | ------------------------------------------------ |
| `UserPromptSubmit` hook: compile + inject      | Pending | .claude/hooks/ | —                     | Compile context and inject via additionalContext |
| `SubagentStart` hook: compile + inject         | Pending | .claude/hooks/ | UserPromptSubmit hook | Compile and inject when subagent starts          |
| `PreCompaction` hook: re-compile before trim   | Pending | .claude/hooks/ | UserPromptSubmit hook | Re-compile before editor trims context           |
| `SessionEnd` hook: session lifecycle telemetry | Pending | .claude/hooks/ | —                     | Session end telemetry                            |
| `PostToolUse` additionalContext workaround     | Pending | .claude/hooks/ | UserPromptSubmit hook | Workaround when PostToolUse supplies context     |
| Hook-based delivery integration tests          | Pending | mcp/src/       | All R hooks           | Tests for Claude Code hook delivery              |

### Phase S — Claude Code Zero-Install

Editor detection and auto-install so Claude Code users get the same zero-install experience Cursor has. Currently Cursor-only (`installTriggerRule`, `installCursorHooks`). Absorbs KL-006 and Zero-Install Gaps.

| Component                                                 | Status  | Package  | Deps                             | Description                                         |
| --------------------------------------------------------- | ------- | -------- | -------------------------------- | --------------------------------------------------- |
| Editor detection (`detectEditorForInit`)                  | Pending | mcp/src/ | —                                | Detect Claude Code vs Cursor for installer dispatch |
| `installClaudeCodeTriggerRule` (`.claude/CLAUDE.md`)      | Pending | mcp/src/ | Editor detection                 | Auto-create Claude Code trigger rule                |
| `installClaudeCodeHooks` (`.claude/settings.local.json`)  | Pending | mcp/src/ | Editor detection, Phase R        | Auto-install Claude Code hooks                      |
| `createMcpServer` dispatches installer by detected editor | Pending | mcp/src/ | Editor detection, trigger, hooks | One startup path per editor                         |
| Startup self-check covers Claude Code artifacts           | Pending | mcp/src/ | createMcpServer dispatches       | Validate Claude Code artifacts on startup           |

### Phase T — OSS Release Prep

Final polish for public release. npm publish, changelog, benchmarks, visual demo, documentation audit. See `documentation/gaps.md` for detailed descriptions of GAP items.

| Component                                           | Status  | Package | Gap    | Deps      | Description                                   |
| --------------------------------------------------- | ------- | ------- | ------ | --------- | --------------------------------------------- |
| npm publish pipeline (`@aic/mcp`)                   | Pending | mcp/    | —      | Phase N–S | Publish MCP package to npm                    |
| CHANGELOG.md                                        | Pending | ./      | —      | —         | Version history for release                   |
| License headers audit                               | Pending | ./      | —      | —         | Ensure license headers present                |
| Contributing guide (final)                          | Pending | ./      | —      | —         | How to contribute                             |
| Multi-repo benchmark suite (multi-scale datapoints) | Pending | test/   | GAP-11 | —         | Token reduction at multiple project scales    |
| Comparative benchmarks vs. native editor context    | Pending | test/   | GAP-10 | —         | AIC vs native editor context selection        |
| Real `aic_inspect` output in README                 | Done    | ./      | GAP-03 | —         | Real output example in README                 |
| Visual demo (GIF/recording) in README               | Pending | ./      | GAP-09 | Phase N–S | Screen recording of AIC in editor             |
| Present-tense audit of project plan                 | Pending | ./      | GAP-06 | —         | Fix present-tense descriptions of future work |

---

## Phase 0 — MVP (complete)

### Implementation Order

### Phase A — Foundation

| Component                    | Status | Package                        | Description                                        |
| ---------------------------- | ------ | ------------------------------ | -------------------------------------------------- |
| MigrationRunner              | Done   | shared/src/storage/            | Runs ordered DB migrations                         |
| 001-initial-schema migration | Done   | shared/src/storage/migrations/ | MVP tables (cache, telemetry, config, guard, etc.) |
| UUIDv7 generator             | Done   | shared/src/adapters/           | RFC 9562 UUIDv7 for entity IDs                     |
| Clock implementation         | Done   | shared/src/adapters/           | Deterministic time for tests and timestamps        |
| AicError hierarchy           | Done   | shared/src/core/errors/        | Structured errors with machine-readable codes      |
| sanitizeError utility        | Done   | shared/src/core/errors/        | Strips paths and env vars from errors to caller    |

### Phase B — Core Interfaces

| Component                  | Status | Package                     | Description                           |
| -------------------------- | ------ | --------------------------- | ------------------------------------- |
| IntentClassifier (port)    | Done   | shared/src/core/interfaces/ | Classify prompt into task type        |
| RulePackResolver (port)    | Done   | shared/src/core/interfaces/ | Resolve project rule pack             |
| BudgetAllocator (port)     | Done   | shared/src/core/interfaces/ | Allocate token budget per task        |
| ContextSelector (port)     | Done   | shared/src/core/interfaces/ | Select files for context              |
| ContextGuard (port)        | Done   | shared/src/core/interfaces/ | Scan for secrets and prompt injection |
| ContentTransformer (port)  | Done   | shared/src/core/interfaces/ | Transform file content                |
| SummarisationLadder (port) | Done   | shared/src/core/interfaces/ | Tiered compression to fit budget      |
| PromptAssembler (port)     | Done   | shared/src/core/interfaces/ | Assemble final prompt                 |
| Clock (port)               | Done   | shared/src/core/interfaces/ | Time abstraction                      |
| CacheStore (port)          | Done   | shared/src/core/interfaces/ | Compilation cache                     |
| TelemetryStore (port)      | Done   | shared/src/core/interfaces/ | Telemetry events                      |
| ConfigStore (port)         | Done   | shared/src/core/interfaces/ | Config snapshot hash                  |
| GuardStore (port)          | Done   | shared/src/core/interfaces/ | Guard findings per compilation        |

### Phase C — Pipeline Steps 1–8

| Component                  | Status | Package              | Description                                                            |
| -------------------------- | ------ | -------------------- | ---------------------------------------------------------------------- |
| IntentClassifier impl      | Done   | shared/src/pipeline/ | Classifies prompts into bugfix, feature, refactor, docs, test, general |
| RulePackResolver impl      | Done   | shared/src/pipeline/ | Resolves rule pack from project (e.g. .cursor/rules)                   |
| BudgetAllocator impl       | Done   | shared/src/pipeline/ | Allocates token budget by task class                                   |
| HeuristicSelector impl     | Done   | shared/src/pipeline/ | Four-signal scoring: path relevance, import proximity, recency, size   |
| ContextGuard impl          | Done   | shared/src/pipeline/ | Secret leakage + prompt injection detection; blocks excluded patterns  |
| ContentTransformerPipeline | Done   | shared/src/pipeline/ | Runs transformers (comment strip, whitespace, JSON, lock skip, etc.)   |
| SummarisationLadder impl   | Done   | shared/src/pipeline/ | Compresses files L0→L1→L2→L3 to fit budget                             |
| PromptAssembler impl       | Done   | shared/src/pipeline/ | Assembles task + context + constraints + output format                 |

### Phase D — Adapters

| Component          | Status | Package              | Description                                                  |
| ------------------ | ------ | -------------------- | ------------------------------------------------------------ |
| TiktokenAdapter    | Done   | shared/src/adapters/ | cl100k_base token counting with word-count fallback          |
| FastGlobAdapter    | Done   | shared/src/adapters/ | File discovery by glob patterns                              |
| IgnoreAdapter      | Done   | shared/src/adapters/ | .gitignore-based filtering                                   |
| TypeScriptProvider | Done   | shared/src/adapters/ | AST-based imports, signatures, symbols for .ts/.tsx/.js/.jsx |
| GenericProvider    | Done   | shared/src/adapters/ | Regex fallback for unsupported languages                     |

### Phase E — Storage

| Component            | Status | Package             | Description                                    |
| -------------------- | ------ | ------------------- | ---------------------------------------------- |
| SqliteCacheStore     | Done   | shared/src/storage/ | SHA-256 cache key; identical input → cache hit |
| SqliteTelemetryStore | Done   | shared/src/storage/ | Persists compilation telemetry events          |
| SqliteConfigStore    | Done   | shared/src/storage/ | Config snapshot hash for cache invalidation    |
| SqliteGuardStore     | Done   | shared/src/storage/ | Persists guard findings per compilation        |

### Phase F — MCP Server

| Component               | Status | Package          | Description                                    |
| ----------------------- | ------ | ---------------- | ---------------------------------------------- |
| Server composition root | Done   | mcp/src/         | Wires adapters, pipeline, stores, handlers     |
| compile handler         | Done   | mcp/src/         | aic_compile tool: validate, run, return prompt |
| inspect handler         | Done   | mcp/src/         | aic_inspect tool: return pipeline trace        |
| Zod schemas (MCP)       | Done   | mcp/src/schemas/ | Request validation at MCP boundary             |

### Phase G — CLI (Archived)

CLI package removed in Phase M 0.5. Init logic migrated to `mcp/src/init-project.ts`. Status, last, and chat summary served via MCP resources and tools.-.

### Phase H — Integration Tests

| Component             | Status | Package     | Description                              |
| --------------------- | ------ | ----------- | ---------------------------------------- |
| Golden snapshot tests | Done   | shared/src/ | Snapshot pipeline output; determinism    |
| Full pipeline test    | Done   | shared/src/ | End-to-end run, cache hit, token summary |

---

## Phase 0.5 — Quality Release (complete)

### Phase I — Live Wiring & Bug Fixes

Prerequisite for everything else. Quick fixes to make the tool fully functional.

| Component                       | Status | Package                                                     | Description                                                     |
| ------------------------------- | ------ | ----------------------------------------------------------- | --------------------------------------------------------------- |
| FileSystemRepoMapSupplier       | Done   | shared/src/adapters/                                        | Scans project files; glob + ignore; bytes/4 or real token count |
| createFullPipelineDeps          | Done   | shared/src/bootstrap                                        | Single composition point for pipeline deps                      |
| Wire real RepoMap in MCP        | Done   | mcp/                                                        | MCP uses real filesystem repo map                               |
| Wire real InspectRunner (MCP)   | Done   | mcp/src/                                                    | MCP uses real pipeline for inspect                              |
| Telemetry write on compile      | Done   | shared/src/core/ + mcp                                      | Persist compilation telemetry on every compile                  |
| Guard findings write on scan    | Done   | shared/src/storage/                                         | Persist guard findings per compilation                          |
| Config loading from aic.config  | Done   | shared/src/config/ + mcp                                    | aic.config.json: budget, selector, model overrides              |
| Real token counting in repo map | Done   | shared/src/adapters/                                        | Accurate token count during scan (cl100k_base)                  |
| WhitespaceNormalizer exclusions | Done   | shared/src/pipeline/                                        | Skip normalisation for .md, .py, .yml (preserve structure)      |
| 002-server-sessions migration   | Done   | shared/src/storage/migrations/                              | server_sessions table for startup/stop                          |
| SessionTracker interface        | Done   | shared/src/core/interfaces/                                 | startSession, stopSession, backfillCrashedSessions              |
| SqliteSessionStore              | Done   | shared/src/storage/                                         | Persists server session rows                                    |
| sessionStart compile hook       | Done   | .cursor/hooks/                                              | Compile on session start for initial context                    |
| preToolUse gate hook            | Done   | .cursor/hooks/                                              | Injects conversationId/editorId into aic_compile args           |
| beforeSubmitPrompt logging hook | Done   | .cursor/hooks/                                              | Logging hook                                                    |
| afterFileEdit tracking hook     | Done   | .cursor/hooks/                                              | Track file edits                                                |
| stop quality check hook         | Done   | .cursor/hooks/                                              | Quality check on stop                                           |
| Startup self-check (integrity)  | Done   | mcp/src/                                                    | Validates trigger rule, hooks, DB on startup                    |
| Auto-install trigger rule       | Done   | mcp/src/                                                    | Creates .cursor/rules/aic.mdc when missing                      |
| Install Cursor hooks            | Done   | mcp/src/                                                    | Copies AIC hooks to .cursor/hooks/ on startup                   |
| Server lifecycle hooks          | Done   | mcp/src/                                                    | SIGINT/SIGTERM → stopSession, purgeExpired, exit                |
| Telemetry conversation tracking | Done   | shared + mcp (Phase M: schema, summary, `aic_chat_summary`) | conversation_id in log; per-conversation summary                |
| Telemetry triggerSource field   | Done   | shared/src/core/types/ + storage                            | How compilation was triggered (tool, hook, CLI)                 |
| Claude Code integration layer   | Done   | .claude/hooks/                                              | Basic Claude Code hooks                                         |
| Subagent context injection (CC) | Done   | .claude/hooks/                                              | Inject context when Claude Code subagent starts                 |
| Compilation perf: lazy scan     | Done   | shared/src/adapters/ + mcp + cli                            | Defer file content read until needed; bytes/4 in scan           |

### Phase J — Intent & Selection Quality

Highest-impact work. The core value of AIC is picking the right files — if selection is wrong, nothing else matters. Language providers also ensure the summarisation ladder produces semantically safe output per language (correct indentation, signatures, symbol extraction).

| Component                        | Status | Package              | Description                                                      |
| -------------------------------- | ------ | -------------------- | ---------------------------------------------------------------- |
| Richer intent keyword extraction | Done   | shared/src/pipeline/ | Expanded keywords: migrate, debug, changelog, e2e, fixture, etc. |
| Intent-aware file discovery      | Done   | shared/src/pipeline/ | Pre-filters repo by keyword and include/exclude patterns         |
| Import graph signal (TS/JS)      | Done   | shared/src/pipeline/ | BFS over import graph; score by dependency distance              |
| GenericImportProvider (Py/Go/Rs) | Done   | shared/src/adapters/ | Regex imports for .py/.go/.rs/.java before AST providers         |
| PythonProvider (AST-safe)        | Done   | shared/src/adapters/ | tree-sitter: imports, signatures, docstrings, symbols            |
| GoProvider                       | Done   | shared/src/adapters/ | tree-sitter: imports, functions, methods, types                  |
| RustProvider                     | Done   | shared/src/adapters/ | tree-sitter: use, functions, structs, impls                      |
| JavaProvider                     | Done   | shared/src/adapters/ | tree-sitter: imports, methods, classes, interfaces               |
| RubyProvider                     | Done   | shared/src/adapters/ | Regex: require/load, def/class/module                            |
| PhpProvider                      | Done   | shared/src/adapters/ | Regex: require/include/use, function/class                       |
| CssProvider                      | Done   | shared/src/adapters/ | Regex: @import, selector-like lines                              |
| HtmlJsxProvider                  | Done   | shared/src/adapters/ | Regex: script src/link href, tag detection                       |
| ShellScriptProvider              | Done   | shared/src/adapters/ | Regex: source/., function names                                  |
| SwiftProvider                    | Done   | shared/src/adapters/ | Regex: import, func/class/struct/enum                            |
| KotlinProvider                   | Done   | shared/src/adapters/ | Regex: import, fun/class/object                                  |
| DartProvider                     | Done   | shared/src/adapters/ | Regex: import, class/typedef/function                            |

### Phase K — Quality & Benchmarks

Need measurement before optimizing further. Benchmarks prove Phase J worked and guide Phase L.

| Component                      | Status | Package     | Description                                               |
| ------------------------------ | ------ | ----------- | --------------------------------------------------------- |
| Real-project integration tests | Done   | shared/src/ | Full compile on real project; cache hit; output structure |
| Selection quality benchmarks   | Done   | test/       | Baseline selected paths vs intent                         |
| Token reduction benchmarks     | Done   | test/       | Baseline token reduction; regressions                     |

### Phase L — Transformers & Guard

Incremental output quality improvements, measured by Phase K benchmarks. New transformers must be semantically safe — never break indentation (Python/YAML/Makefile), JSX syntax, or templating languages. Each transformer needs file-type safety tests.

| Component                  | Status | Package              | Description                                                                             |
| -------------------------- | ------ | -------------------- | --------------------------------------------------------------------------------------- |
| LicenseHeaderStripper      | Done   | shared/src/pipeline/ | Strips leading license/copyright/SPDX comment blocks                                    |
| Base64InlineDataStripper   | Done   | shared/src/pipeline/ | Replaces data:base64 URLs with placeholder                                              |
| LongStringLiteralTruncator | Done   | shared/src/pipeline/ | Truncates string literals >200 chars                                                    |
| DocstringTrimmer           | Done   | shared/src/pipeline/ | Trims long Python/JSDoc docstrings                                                      |
| CssVariableSummarizer      | Done   | shared/src/pipeline/ | Keeps :root; replaces other rule bodies with "[N declarations]"                         |
| TypeDeclarationCompactor   | Done   | shared/src/pipeline/ | Collapses .d.ts type/interface/enum to single line                                      |
| TestStructureExtractor     | Done   | shared/src/pipeline/ | Strips describe/it/test bodies; keeps names and structure                               |
| ImportDeduplicator         | Done   | shared/src/pipeline/ | Merges duplicate imports per file                                                       |
| HtmlToMarkdownTransformer  | Done   | shared/src/pipeline/ | Converts HTML to Markdown; strips script/style                                          |
| SvgDescriber               | Done   | shared/src/pipeline/ | Replaces SVG with "[SVG: viewBox, N elements, bytes]"                                   |
| YamlCompactor              | Done   | shared/src/pipeline/ | Strips YAML comments; normalises indent; collapses single-key blocks                    |
| MinifiedCodeSkipper        | Done   | shared/src/pipeline/ | Placeholder for .min.js/.min.css, dist/, build/                                         |
| AutoGeneratedSkipper       | Done   | shared/src/pipeline/ | Placeholder when header contains "auto-generated"/"code generated"                      |
| EnvExampleRedactor         | Done   | shared/src/pipeline/ | Redacts KEY=value to KEY= in .env.example/.env.sample/.env.template (secret protection) |
| SchemaFileCompactor        | Done   | shared/src/pipeline/ | Compacts JSON Schema, GraphQL, Prisma, Proto                                            |
| Transformer safety tests   | Done   | shared/src/pipeline/ | Safety tests (indentation, YAML, JSX preserved)                                         |
| Guard `warn` severity      | Done   | shared/src/pipeline/ | Warn on suspicious content without blocking file                                        |

### Phase M — Reporting & Resources

User-facing polish. Comes last because it doesn't improve the core algorithm.

| Component                                                | Status | Package      | Description                                                         |
| -------------------------------------------------------- | ------ | ------------ | ------------------------------------------------------------------- |
| `aic://status` resource (was `aic://session-summary`)    | Done   | mcp/src/     | Compilation stats, token savings, guard summary, installation check |
| `aic://last` resource (was `aic://last-compilation`)     | Done   | mcp/src/     | Last compilation details + full compiled prompt                     |
| Conversation tracking: schema + plumbing                 | Done   | shared + mcp | conversation_id in compilation_log; plumbing through pipeline       |
| Conversation tracking: summary + prompt cmd              | Done   | shared + mcp | Per-conversation aggregates; "show aic chat summary"                |
| Budget utilization in `aic://status`                     | Done   | mcp/src/     | % of token budget used by last compilation                          |
| `aic_chat_summary` tool (was `aic_conversation_summary`) | Done   | mcp/src/     | MCP tool: per-conversation stats by conversationId                  |

### Phase M 0.5 — MCP-only (Drop CLI)

CLI package removed. User questions ("Is it working?", "What just happened?", "How much has it saved me?") are answered via MCP resources and prompt commands inside the editor.

| Component                                   | Status | Delivered as                                                                      | Description                               |
| ------------------------------------------- | ------ | --------------------------------------------------------------------------------- | ----------------------------------------- |
| `aic last`                                  | Done   | `aic://last` resource + "show aic last" prompt command                            | Last compilation summary in editor        |
| `aic last --full`                           | Done   | `compiledPrompt` field in `aic://last` (file: `.aic/last-compiled-prompt.txt`)    | Full compiled prompt on demand            |
| Redesign `aic status`                       | Done   | `aic://status` with `budgetMaxTokens`, `budgetUtilizationPct` + "show aic status" | Project stats + budget utilisation        |
| Remove `aic compile` / `inspect` / `report` | Done   | CLI package removed; MCP tools `aic_compile`, `aic_inspect` are the interface     | MCP-only; no CLI package                  |
| `aic init`                                  | Done   | `npx @aic/mcp init` + auto-init on MCP startup (`ensureAicDir`)                   | One-time or auto project setup            |
| Init logic ported to MCP                    | Done   | `mcp/src/init-project.ts` with test                                               | ensureAicDir, config, trigger rule, hooks |
| Update README                               | Done   | MCP-only branding, prompt command examples, CLI section replaced with Visibility  | README reflects MCP-only UX               |

---

## Daily Log

### 2025-03-06

**Components:** contextCompleteness confidence signal in CompilationMeta, Constraints preamble in prompt assembler (LitM), Line-level pruner within matched chunks (SWE-Pruner), MarkdownInstructionScanner (GuardScanner)
**Completed:**

- MarkdownInstructionScanner (task 104): GuardScanner for .md/.mdc/.mdx that reuses BLOCK/WARN instruction patterns; instruction-patterns.ts with runInstructionPatternScan shared with PromptInjectionScanner (0 clones); wired in create-pipeline-deps; five tests (non_markdown_path_returns_empty, markdown_path_with_block_pattern_returns_block_finding, markdown_path_with_warn_pattern_returns_warn_finding, markdown_path_clean_returns_empty, mdc_and_mdx_paths_scanned). Lint, typecheck, test, lint:clones 0.
- contextCompleteness confidence signal in CompilationMeta (task 101): CompilationMeta extended with readonly contextCompleteness: Confidence; compilation-types import Confidence from scores; buildCacheHitMeta and buildFreshMeta set contextCompleteness: toConfidence(1); STUB_COMPILATION_META and test stubs (build-telemetry-event metaOverrides, compile-handler stubMeta) include contextCompleteness. Lint, typecheck, test, lint:clones 0; knip no new findings.
- Constraints preamble in prompt assembler (LitM) (task 102): buildConstraintsPreamble helper; top 3 constraints as ## Constraints (key) before ## Context; full ## Constraints section unchanged after context; four tests (preamble_emitted, top_three_only, omitted_when_empty, one_or_two). Lint, typecheck, test, lint:clones 0; max-lines-per-function satisfied via helper.
- Line-level pruner within matched chunks (task 103): LineLevelPruner interface and implementation; prune runs after SummarisationLadder when subjectTokens.length > 0; keeps lines matching subject token (case-insensitive), ±1 context window, syntax-only lines, structural keywords (return/break/continue/else/case/default/throw); L0 files without resolvedContent read via FileContentReader; PipelineStepsResult.prunedFiles; inspect-types tokenSummary.afterPrune; compilation-runner buildFreshMeta/recordSessionStepIfNeeded use prunedFiles; ten unit tests; integration snapshots and token-reduction baseline ratcheted. Lint, typecheck, test, lint:clones 0.

### 2026-03-05

**Components:** Closeable interface, file-entry-utils, WatchingRepoMapSupplier, create-pipeline-deps wiring
**Completed:**

- Scan: cached RepoMap with file watcher (task 099): Closeable interface; file-entry-utils.ts (BINARY_EXTENSIONS, EXTENSION_TO_LANGUAGE, languageFromExtension, isBinaryExtension, buildFileEntry) extracted from FileSystemRepoMapSupplier; WatchingRepoMapSupplier decorator (getRepoMap cache + fs.watch, handleWatchEvent/handleWatchError, rebuildRepoMap, invalidateCache, close); watchFn and statFn injected for tests; createFullPipelineDeps wraps FileSystemRepoMapSupplier with WatchingRepoMapSupplier; seven tests (first_call_delegates_and_returns, second_call_same_root_returns_cached, watcher_event_updates_entry, watcher_filename_undefined_invalidates_cache, watch_throws_graceful_fallback, watcher_error_event_invalidates_cache, close_stops_all_watchers). Lint, typecheck, test, knip (no new findings), lint:clones 0.

### 2025-03-05

**Components:** Adaptive budget allocation (session history), Adaptive scoring weights per task class, Reverse dependency walking (bidirectional BFS), Symbol-level intent matching, Structural context map (RIG-inspired), Scan: eliminate double-stat via fast-glob stats, Scan: async parallel file system I/O, Granular file-level transformation cache, Chunk-level file inclusion
**Completed:**

- Chunk-level file inclusion (task 100): SelectedFile.resolvedContent optional; SummarisationLadder.compress(files, budget, subjectTokens?) with chunk-level path when subjectTokens non-empty (matched chunks full, rest signature-only; over budget falls back to demoteLoop/dropToFit); run-pipeline-steps passes task.subjectTokens to both compress calls; PromptAssembler uses file.resolvedContent when present else getContent; fetchContextContents helper; three summarisation-ladder chunk-level tests, one prompt-assembler resolvedContent test; integration snapshots updated. Lint, typecheck, test, lint:clones 0.
- Granular file-level transformation cache (task 096): CachedFileTransform type; FileTransformStore interface; migration 009 file_transform_cache (file_path, content_hash PK); SqliteFileTransformStore get/set/invalidate/purgeExpired; isoToSqliteDatetime/sqliteDatetimeToIso extracted to sqlite-datetime.ts (0 clones); ProjectScope.fileTransformStore; seven store tests. Lint, typecheck, test, lint:clones 0.
- Scan: async parallel file system I/O (task 098): GlobProvider find/findWithStats return Promise; FastGlobAdapter uses async fg() instead of fg.sync; FileSystemRepoMapSupplier getRepoMap awaits findWithStats; projectHasExtension async and awaits glob.find in init-language-providers; file-system-repo-map-supplier and fast-glob-adapter tests updated for async mocks and await. Lint, typecheck, test, lint:clones 0.
- Scan: eliminate double-stat via fast-glob stats (task 097): PathWithStat type; GlobProvider.findWithStats; FastGlobAdapter.findWithStats with fg.sync(..., { stats: true }); FileSystemRepoMapSupplier uses findWithStats, no node:fs; four file-system-repo-map-supplier tests (findWithStats mocks), one fast-glob-adapter findWithStats test. Lint, typecheck, test, lint:clones 0.
- Structural context map (RIG-inspired) (task 095): StructuralMapBuilder interface and implementation; directory tree from repoMap.files up to depth 4, one line per dir "{dir}/ (n files)", sorted; PromptAssembler optional 7th param structuralMap, injects ## Project structure before ## Context; run-pipeline-steps and create-pipeline-deps wire builder; four structural-map-builder tests, two prompt-assembler tests; integration snapshots updated. Lint, typecheck, test, lint:clones 0.
- Symbol-level intent matching (task 093): TaskClassification.subjectTokens; IntentClassifier extractSubjectTokens (STOPWORDS, ALL*CLASSIFIER_KEYWORDS); SymbolRelevanceScorer (ImportProximityScorer) getScores by subjectTokens vs extractNames; HeuristicSelector fourth param symbolRelevanceScorer, DEFAULT_WEIGHTS_BY_TASK_CLASS rebalanced with symbolRelevance 0.2; ScoringWeights.symbolRelevance; create-pipeline-deps wires SymbolRelevanceScorer; intent-classifier tests (subject_tokens*\*), symbol-relevance-scorer tests (5). Golden/full-pipeline snapshots updated. Lint, typecheck, test, lint:clones 0.
- Adaptive budget allocation (session history) (task 090): SessionBudgetContext type; BudgetAllocator.allocate optional sessionContext; session cap via CONTEXT_WINDOW_DEFAULT/RESERVED_RESPONSE_DEFAULT/TEMPLATE_OVERHEAD_DEFAULT; PipelineStepsRequest.conversationTokens; runPipelineSteps passes sessionContext to allocate; compilation-runner forwards request.conversationTokens into pipelineRequest; three new budget-allocator tests (session_cap_applied_when_conversation_tokens_provided, cap_does_not_exceed_base_budget, available_budget_clamped_non_negative). Lint, typecheck, test, knip (no new findings), lint:clones 0.
- Adaptive scoring weights per task class (task 091): ScoringWeights type in heuristic-selector-config; DEFAULT_WEIGHTS_BY_TASK_CLASS (REFACTOR/BUGFIX/DOCS/FEATURE/TEST/GENERAL); selectContext uses config.weights ?? DEFAULT_WEIGHTS_BY_TASK_CLASS[task.taskClass]; four tests (refactor_uses_higher_import_proximity_weight, bugfix_uses_higher_recency_and_import_weights, docs_uses_higher_path_relevance_weight, config_weights_override_per_task_defaults). Lint, typecheck, test, lint:clones 0.
- Reverse dependency walking (bidirectional BFS) (task 092): buildReverseEdges(edges) pure helper; bfsScores(seeds, edges, reverseEdges, allPaths) expands along forward and reverse edges; getScores builds reverseEdges and passes both; depthToScore unchanged (0→1.0, 1→0.6, 2→0.3, 3+→0.1). Test reverse_dependency_scores_importer_of_seed (caller of seed gets 0.6). Lint, typecheck, test, lint:clones 0.

### 2025-03-04

**Components:** Budget utilization in status, `aic report` (static HTML), Drop CLI package (Phase M 0.5), Spec file discovery and scoring, Spec-aware summarisation tier, Session-level compilation deduplication, Spec injection in prompt assembler, Conversation context compression, Session tracking storage (migration)
**Completed:**

- Session tracking storage (migration) (task 089): Migration 008 session_state table; AgenticSessionState.getPreviouslyShownFiles optional fileLastModified param; SqliteAgenticSessionStore (getSteps, recordStep, getPreviouslyShownFiles with modifiedSince from fileLastModified or true); run-pipeline-steps builds fileLastModified from repoMap.files and passes to getPreviouslyShownFiles; open-database runs migration 008; MCP server wires SqliteAgenticSessionStore(scope.db) as 10th CompilationRunner arg; compilation-runner test mocks accept optional second param. Six store tests. Lint, typecheck, test, lint:clones 0.
- Conversation context compression (task 088): ConversationCompressor interface and ConversationCompressorImpl; AgenticSessionState.getSteps(sessionId); PromptAssembler.assemble optional sessionContextSummary, ## Session context block before ## Context when non-empty; runPipelineSteps conversationCompressor in deps, getSteps + compress when sessionId and agenticSessionState present, pass summary to assemble; create-pipeline-deps ConversationCompressorImpl; tests conversation-compressor (5), prompt-assembler session context (2), getSteps on AgenticSessionState mocks in compilation-runner; full-pipeline, golden-snapshot, inspect-runner deps updated with conversationCompressor. Lint, typecheck, test, knip (no new findings), lint:clones 0.
- Spec injection in prompt assembler (task 087): PromptAssembler.assemble optional specFiles param; buildSpecParts helper; ## Specification section before ## Context when specFiles length > 0; run-pipeline-steps isSpecPath/buildSpecRepoMap, spec discover → guard → transform → ladder (spec budget 20% of main), specLadderFiles passed to assemble; PipelineStepsDeps.specFileDiscoverer; create-pipeline-deps and createFullPipelineDeps instantiate SpecFileDiscoverer; tests prompt_assembler_spec_section_emitted, prompt_assembler_no_spec_when_empty, prompt_assembler_spec_getContent_called; integration/unit tests updated with specFileDiscoverer mock. Lint, typecheck, test, lint:clones 0.
- Session-level compilation deduplication (task 086): AgenticSessionState interface and PreviousFile/SessionStep types; SelectedFile.previouslyShownAtStep; runPipelineSteps marks previously shown via getPreviouslyShownFiles when sessionId and agenticSessionState present; PromptAssembler emits placeholder for previously shown files (no getContent); CompilationRunner 10th param agenticSessionState, cache key includes sessionId+stepIndex, recordSessionStepIfNeeded after fresh run; MCP passes null. Four tests (record_step_called, cache_key_includes_session_and_step, prompt_contains_placeholder_when_previous_returned, prompt_assembler_previously_shown_emits_placeholder). Lint, typecheck, test, lint:clones 0.
- Spec-aware summarisation tier (task 085): MarkdownProvider (LanguageProvider) for .md and .mdc; parseImports returns []; extractSignaturesWithDocs = ATX heading sections (heading + content until next heading); extractSignaturesOnly = one CodeChunk per ATX line; extractNames = heading titles as SYMBOL_KIND.CONST; wired in createPipelineDeps after typeScriptProvider. Six tests. Lint, typecheck, test, lint:clones 0.
- Spec file discovery and scoring (task 084): SpecFileDiscoverer interface and implementation; filter by exclude/include/keywords, score by spec path tier (SPEC_PATH_TIERS), pathRelevance, recency, size penalty, heuristic boost/penalize; returns ContextResult; shared min-max-norm.ts for HeuristicSelector and SpecFileDiscoverer (0 clones). Eight tests. Lint, typecheck, test, knip (no new findings), lint:clones 0.
- Budget utilization in status (task 082): statusCommand resolves budget via LoadConfigFromFile.load(projectRoot, configPath ?? null), passes budget (result.config.contextBudget.maxTokens) to formatStatusOutput; formatStatusOutput gains third parameter budget: number and outputs "Budget utilization: X% (last: A/B)" when lastCompilation non-null, "Budget utilization: —" when null, placed after Total tokens saved and before Guard; three tests (budget_utilization_shown_with_default_budget, budget_utilization_dash_when_no_last_compilation, budget_utilization_uses_config_when_present). Lint, typecheck, test, knip (no new findings), lint:clones 0.
- `aic report` (static HTML) (task 083): ReportArgsSchema (BaseArgs + outputPath); reportCommand with formatStatusAsHtml (escapeHtml for user-controlled strings), default output .aic/report.html via ensureAicDir; main.ts registers report command, createStatusRunner() shared with status; status-display.ts (buildStatusSections, formatLastCompilationTerminal/Html), status-flow.ts (loadStatusContext, handleStatusFlowResult) to eliminate clones; six tests (report_writes_html_file, report_no_database_exits_with_message, report_no_compilations_exits_with_message, report_uses_default_output_path, report_escapes_html_in_intent, report_runner_throws_propagates). Lint, typecheck, test, knip (no new findings), lint:clones 0.
- Drop CLI package (Phase M 0.5): Entire `cli/` package removed (31 files). Init logic migrated to `mcp/src/init-project.ts` (ensureAicDir + config + trigger rule + hooks); `npx @aic/mcp init` entrypoint in mcp/src/server.ts (exit code 0 success, 1 ConfigError, 2 internal). MCP resources renamed: `aic://session-summary` → `aic://status` (now includes `budgetMaxTokens`, `budgetUtilizationPct`), `aic://last-compilation` → `aic://last` (now includes `compiledPrompt` from `.aic/last-compiled-prompt.txt`). MCP tool renamed: `aic_conversation_summary` → `aic_chat_summary`. Prompt commands in aic-architect.mdc updated: "show aic status", "show aic last", "show aic chat summary". compile-handler writes last prompt to `.aic/last-compiled-prompt.txt`. Monorepo config cleaned: pnpm-workspace, tsconfig, vitest, eslint, knip, root package.json. Test: mcp/**tests**/init-project.test.ts (5 cases), server.test.ts updated. Lint, typecheck, test, knip (no new findings).

### 2026-03-03

**Components:** Conversation tracking: summary + prompt cmd, TestStructureExtractor, ImportDeduplicator, Async file I/O (pipeline)
**Completed:**

- Async file I/O for pipeline (task 079): FileContentReader.getContent → Promise; CachingFileContentReader uses fs.promises.stat/readFile; ImportProximityScorer.getScores, ContextSelector.selectContext, ContextGuard.scan, ContentTransformerPipeline.transform, SummarisationLadder.compress, PromptAssembler.assemble all async and awaited in runPipelineSteps; SummarisationLadder preloads content map; all pipeline and integration tests updated (mocks return Promises, await async calls); MCP server out.close returns Promise. Lint, typecheck, test, lint:clones 0.
- ImportDeduplicator (task 067): ContentTransformer that deduplicates import statements per file; group by module specifier, merge named bindings; supports import { } from "", import "", import default from "", import as ns from "", require(); fileExtensions = []; wired after docstringTrimmer before whitespaceNormalizer; seven tests (duplicate_named_imports_same_specifier_merged, duplicate_import_line_removed, no_imports_unchanged, empty_content_returns_unchanged, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token benchmark unchanged (1192). Verification: 17/17 dimensions pass.
- TestStructureExtractor (task 066): ContentTransformer that strips describe/it/test callback bodies to `{}` for paths containing .test. or .spec., keeping call and first string argument; leaf-only replacement so nested describe/it structure preserved; TEST_SPEC_EXTENSIONS for .ts/.js/.tsx/.jsx/.mjs/.cjs/.py/.go/.rs/.java/.rb/.php/.swift/.kt/.dart; wired after whitespaceNormalizer before commentStripper in create-pipeline-deps; six tests (describe_it_names_kept_bodies_stripped, non_test_path_unchanged, test_path_describe_it_preserved, empty_content_returns_unchanged, safety_ts_test_structure_preserved, safety_spec_js_structure_preserved); token and selection benchmarks unchanged; lint, typecheck, test, lint:clones 0.
- Conversation tracking: summary + prompt cmd (task 070): ConversationSummary type and StatusStore.getConversationSummary; SqliteStatusStore implements getConversationSummary (conversation_id filter, aggregates, lastCompilationInConversation, topTaskClasses); migrations 005/007 in sqlite-status-store test setup, insertCompilationLog extended with conversation_id; MCP tool aic_conversation_summary with ConversationSummaryRequestSchema, returns JSON or zero-payload when no rows; prompt command "show aic chat summary" in aic-architect.mdc; helpers mapLastCompilationRow and mapTaskClassRow to eliminate clones; lint, typecheck, test, knip (no new findings), lint:clones 0.

### 2025-03-03

**Components:** CssVariableSummarizer, aic://session-summary resource, aic://last-compilation resource, Conversation tracking schema + plumbing, Install Cursor hooks, HtmlToMarkdownTransformer, SvgDescriber, MinifiedCodeSkipper, YamlCompactor, AutoGeneratedSkipper, EnvExampleRedactor, SchemaFileCompactor, Transformer safety tests, Guard `warn` severity
**Completed:**

- Guard `warn` severity (task 081): GuardResult.filesWarned added; PromptInjectionScanner split into BLOCK_PATTERNS (special tokens, instruction blocks) and WARN_PATTERNS (text heuristics); ContextGuard computes warnedPaths (WARN findings whose file not in blockedSet); five new context-guard tests (warn_findings_do_not_block_files, block_injection_still_blocks, mixed_warn_and_block_different_files, mixed_severity_same_file_counts_as_blocked, clean_files_empty_filesWarned); instruction-override test asserts severity WARN; inspect-runner and build-telemetry-event mocks updated; golden snapshot updated. Lint, typecheck, test, lint:clones 0.
- Transformer safety tests (task 080): Test-only backfill; added 3 safety tests to whitespace-normalizer.test.ts (safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); created comment-stripper.test.ts (6 functional + 7 safety), json-compactor.test.ts (3 functional + 1 safety), lock-file-skipper.test.ts (5 functional + 1 safety). All 26 test cases pass; lint, typecheck, test, lint:clones 0; knip no new findings.
- SchemaFileCompactor (task 078): ContentTransformer that compacts schema files: JSON Schema (strip description, title, examples, $comment, default recursively), GraphQL (strip """ blocks and # line/EOL comments), Prisma (// and /// and /* */), Proto (// and /* */); detection by content ($schema or $ref at root) for JSON or by path (.graphql, .gql, .prisma, .proto); fileExtensions = []; wired after envExampleRedactor before htmlToMarkdownTransformer; thirteen tests (json*schema*, graphql*, prisma*, proto\**, non*schema*, empty*content, invalid_json, safety\*); token benchmark unchanged (1192); selection quality pass.
- EnvExampleRedactor (task 077): ContentTransformer that redacts KEY=value to KEY= in .env.example, .env.sample, .env.template (basename starts with .env and ends with suffix); comment/blank lines preserved, export prefix and quoted values redacted; fileExtensions = []; wired after autoGeneratedSkipper before htmlToMarkdownTransformer; twelve tests (env_example_values_redacted, env_sample_values_redacted, env_template_values_redacted, comment_lines_preserved, export_prefix_redacted, quoted_values_redacted, non_env_example_path_unchanged, empty_content_returns_unchanged, env_local_example_path_matched, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token and selection benchmarks unchanged.
- AutoGeneratedSkipper (task 076): ContentTransformer that replaces content with `[Auto-generated: {name} — skipped]` when header region (first 30 lines or 2048 chars, whichever smaller) contains case-insensitive "code generated" or "auto-generated"; fileExtensions = []; wired after minifiedCodeSkipper before htmlToMarkdownTransformer; eight tests (code_generated_comment_returns_placeholder, hash_auto_generated_returns_placeholder, no_marker_returns_unchanged, empty_content_returns_unchanged, marker_beyond_header_unchanged, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token and selection benchmarks unchanged.
- YamlCompactor (task 075): ContentTransformer that compacts YAML: strip whole-line comments (/^\s#/), normalize indent to 2 spaces per level (detect step from first non-empty/min positive indent), collapse single-key blocks to flow form key: { childKey: value }; fileExtensions = [".yaml", ".yml"]; wired after htmlToMarkdownTransformer before svgDescriber; seven tests (comment_lines_removed, indent_normalized, single_value_map_collapsed, empty_content_returns_unchanged, no_yaml_pattern_unchanged, safety_yaml_structure_preserved, safety_yml_extension_same_behavior); token benchmark unchanged (1192); lint, typecheck, test, lint:clones 0.
- MinifiedCodeSkipper (task 074): ContentTransformer that replaces minified/build file content with placeholder [Minified: {name}, {bytes} bytes — skipped] for .min.js, .min.css, dist/, build/ paths; fileExtensions = []; isMinifiedPath + lastSegment helpers; wired after lockFileSkipper before htmlToMarkdownTransformer; nine tests (min_js_path_returns_placeholder, min_css_path_returns_placeholder, dist_segment_returns_placeholder, build_segment_returns_placeholder, non_minified_path_returns_unchanged, empty_content_returns_unchanged, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token benchmark unchanged (1192); lint, typecheck, test, lint:clones 0.
- SvgDescriber (task 073): ContentTransformer that replaces full SVG content with placeholder [SVG: {viewBox}, {elementCount} elements, {bytes} bytes]; extract viewBox from first <svg (or "—"), count opening tags, byte length; fileExtensions = [".svg"]; wired after htmlToMarkdownTransformer before cssVariableSummarizer; six tests (viewbox_and_elements_described, no_viewbox_uses_placeholder, empty_content_returns_unchanged, single_element_count, safety_svg_placeholder_format, safety_svg_extension_same_behavior); token benchmark unchanged (1192).
- HtmlToMarkdownTransformer (task 072): ContentTransformer that converts HTML to Markdown; strip script/style blocks (case-insensitive), block tags (h1–h6, p, li, br) to Markdown, inline (a, strong/b, em/i, code) with recursive pass for nesting, strip remaining tags, normalize whitespace; fileExtensions = [".html", ".htm"]; wired after lockFileSkipper before cssVariableSummarizer; seven tests (html_heading_converted, html_link_converted, script_block_stripped, style_block_stripped, empty_content_returns_unchanged, safety_html_structure_markdown_valid, safety_htm_extension_same_behavior); token benchmark unchanged (1192). Verification: 17/17 dimensions pass (one fix during implementation: no let — refactored to reduce for block replacements, recursive helper for inline passes).
- Install Cursor hooks (task 071): installCursorHooks in mcp/src writes .cursor/hooks.json (default or merge with user entries) and copies five AIC-.cjs from mcp/hooks/ to projectRoot/.cursor/hooks/ on MCP startup; createMcpServer calls installCursorHooks after installTriggerRule; mcp/hooks/ ships packaged copies of repo .cursor/hooks scripts; Zero-Install Gaps table updated (hooks.json + five scripts now auto-installed); knip ignore mcp/hooks/; five tests (hooks_missing_creates_hooks_json_and_scripts, hooks_json_exists_merges_without_removing_user_entries, scripts_overwritten_when_content_differs, idempotent_second_call_no_op, self_check_passes_after_install).
- Conversation tracking: schema + plumbing (task 069): Migration 007 added nullable conversation_id to compilation_log; ConversationId branded type and toConversationId in identifiers; CompilationRequest.conversationId optional, CompilationLogEntry.conversationId required nullable; pipeline and SqliteCompilationLogStore pass and persist; MCP/CLI schema and handler/command pass conversationId; tests updated (sqlite_compilation_log_store_conversation_id, compilation_runner_passes_conversation_id, compile_handler_passes_conversation_id, compile_command_passes_conversation_id); lint, typecheck, test, knip (no new findings), lint:clones (pre-existing clone in sqlite-cache-store only).
- aic://last-compilation resource (task 068): Replaced stub in mcp/src/server.ts with real handler using SqliteStatusStore(scope.db, scope.clock), getSummary(); returns JSON { compilationCount, lastCompilation }; two tests (last_compilation_resource_returns_json, last_compilation_resource_empty_db) with InMemoryTransport, aic_compile then readResource / readResource only; lint, typecheck, test, knip (no new findings), lint:clones 0.
- aic://session-summary resource (task 065): MCP resource at aic://session-summary returning StatusAggregates as application/json; handler in mcp/src/server.ts instantiates SqliteStatusStore(scope.db, scope.clock), getSummary(), JSON.stringify; two tests (session_summary_resource_returns_json, session_summary_resource_empty_db) with InMemoryTransport and client.readResource; lint, typecheck, test, knip (no new findings), lint:clones 0.
- CssVariableSummarizer (task 064): ContentTransformer that keeps :root block compacted and replaces other rule bodies with [N declarations]; fileExtensions = [".css", ".scss"]; brace-counting scan; wired after lockFileSkipper in create-pipeline-deps; seven tests (root_block_kept_compacted, root_plus_rules_summarized, multiple_rules_summarized, empty_content_returns_unchanged, no_blocks_unchanged, safety_css_structure_preserved, safety_scss_structure_preserved); token and selection benchmarks unchanged. Verification: 17/17 dimensions pass (one fix during implementation: findTopLevelBlocks refactored from .push() to reduce for immutability).

### 2025-03-02

**Components:** KotlinProvider, DartProvider, Real-project integration tests, Token reduction benchmarks, LicenseHeaderStripper, Base64InlineDataStripper, LongStringLiteralTruncator, DocstringTrimmer, TypeDeclarationCompactor
**Completed:**

- TypeDeclarationCompactor (task 063): ContentTransformer that collapses multi-line type/interface/enum/declare declarations in .d.ts to single-line form; fileExtensions = [".d.ts"]; getExtension in content-transformer-pipeline returns ".d.ts" for paths ending in ".d.ts"; wired after lockFileSkipper in create-pipeline-deps; line-based scan with brace counting; eight tests (multi_line_type_collapsed, multi_line_interface_collapsed, multi_line_enum_collapsed, declare_block_collapsed, single_line_unchanged, empty_content_returns_unchanged, no_declaration_content_unchanged, safety_d_ts_structure_preserved); token benchmark unchanged (1192).
- DocstringTrimmer (task 062): ContentTransformer that replaces Python ..., '''...''', and JSDoc /_ ... _/ docstrings longer than 200 chars with placeholder preserving delimiter and original length; fileExtensions = []; wired fourth in create-pipeline-deps (after longStringLiteralTruncator, before whitespaceNormalizer); regex-based replace with callback; nine tests (long_python_double_docstring_trimmed, long_python_single_docstring_trimmed, long_jsdoc_block_trimmed, short_docstring_unchanged, empty_content_returns_unchanged, no_docstring_pattern_unchanged, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token benchmark pass; baseline unchanged.
- LongStringLiteralTruncator (task 061): ContentTransformer that replaces double- and single-quoted string literals longer than 200 chars with placeholder preserving quote type and original length; fileExtensions = []; wired third in create-pipeline-deps (after base64InlineDataStripper, before whitespaceNormalizer); regex-based replace with callback; nine tests (long_double_quoted_truncated, long_single_quoted_truncated, short_literal_unchanged, empty_content_returns_unchanged, escaped_quotes_inside_preserved, multiple_long_literals_both_replaced, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token and selection benchmarks pass; baseline unchanged.
- Base64InlineDataStripper (task 060): ContentTransformer that replaces data URLs (data:;base64,) with "[base64 inline data stripped]"; fileExtensions = []; wired second in create-pipeline-deps (after LicenseHeaderStripper); regex global replace; seven tests (strips_data_url_base64, no_data_url_returns_unchanged, empty_content_returns_unchanged, multiple_data_urls_replaced, safety_python_indentation_preserved, safety_yaml_structure_unchanged, safety_jsx_structure_unchanged); token baseline unchanged (fixture has no data URLs).
- LicenseHeaderStripper (task 059): ContentTransformer that strips leading comment blocks containing License/Copyright/Permission/SPDX (case-insensitive); stops at first blank line so only the license paragraph is removed; fileExtensions = []; wired first in create-pipeline-deps transformers; eight tests (c-style, hash, no keyword, empty, body not stripped, safety Python/YAML/JSX); token baseline 1198 → 1192.
- Real-project integration tests (task 056): shared/src/integration/**tests**/real-project-integration.test.ts wires real createProjectScope, createCachingFileContentReader, createFullPipelineDeps (real RepoMapSupplier), LoadConfigFromFile, applyConfigResult, initLanguageProviders; rulePackProvider from loadRulePackFromPath and createProjectFileReader (no mcp import); projectRoot = toAbsolutePath(process.cwd()); three tests (real_project_compile_succeeds, real_project_compile_output_has_expected_structure, real_project_second_run_cache_hit) with 30s timeout.
- KotlinProvider (task 052): LanguageProvider for .kt with regex only; parseImports for `import package.Class` and `import package.`\* (source = path, isRelative when source starts with "."); extractSignaturesWithDocs returns []; extractSignaturesOnly for fun/class/object lines as CodeChunk (SYMBOL_TYPE.FUNCTION or CLASS); extractNames for same as ExportedSymbol[] (SYMBOL_KIND.FUNCTION or CLASS); createRegexLanguageProviderClass (Null Object); wired in initLanguageProviders (projectHasExtension .kt). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- DartProvider (task 053): LanguageProvider for .dart with regex only; parseImports for `import '...'` and `import "..."` (source = path or package URI, isRelative when source starts with "." or contains "/"); extractSignaturesWithDocs returns []; extractSignaturesOnly for void/class/typedef and ReturnType name( lines as CodeChunk (SYMBOL_TYPE.FUNCTION or CLASS); extractNames for same as ExportedSymbol[] (SYMBOL_KIND.FUNCTION or CLASS); createRegexLanguageProviderClass (Null Object); wired in initLanguageProviders (projectHasExtension .dart). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- Token reduction benchmarks (task 058): enriched test/benchmarks/repos/1 with transformer-exercisable content (license headers, comments, package.json, package-lock.json, src/auth/config.json, src/styles.css); updated test/benchmarks/expected-selection/1.json for pipeline selection; test/benchmarks/baseline.json (empty then entry "1" on first run); shared/src/integration/**tests**/token-reduction-benchmark.test.ts wires CompilationRunner with fixture root, token_reduction_task1_matches_or_establishes_baseline (establish or assert ≤5% token increase, ≤2× duration); updated full-pipeline and golden-snapshot snapshots for enriched fixture.

### 2026-03-02

**Components:** HtmlJsxProvider, ShellScriptProvider, SwiftProvider, Selection quality benchmarks
**Completed:**

- HtmlJsxProvider (task 049): LanguageProvider for .html with regex only; parseImports for `<script src="...">` and `<link href="...">` (source = URL/path, isRelative when "." or "/"); extractSignaturesWithDocs returns []; extractSignaturesOnly for opening tags `<[a-zA-Z][a-zA-Z0-9]`\* as CodeChunk with SYMBOL_TYPE.CLASS; extractNames returns []; tryOrEmpty (Null Object); wired in initLanguageProviders (projectHasExtension .html). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_empty, invalid_returns_empty).
- ShellScriptProvider (task 050): LanguageProvider for .sh and .bash with regex only; parseImports for source "file" and . "file" (source = path, isRelative when path starts with "."); extractSignaturesWithDocs returns []; extractSignaturesOnly for function name (function \w+ or \w+ () {) as CodeChunk with SYMBOL_TYPE.FUNCTION; extractNames for same function names as ExportedSymbol[] with SYMBOL_KIND.FUNCTION; tryOrEmpty (Null Object); manual class for two extensions; wired in initLanguageProviders (projectHasExtension .sh || .bash). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- SwiftProvider (task 051): LanguageProvider for .swift with regex only; parseImports for import Module and import struct/class/enum/protocol Module.Class (source = module path, isRelative false); extractSignaturesWithDocs returns []; extractSignaturesOnly for func/class/struct/enum lines as CodeChunk (FUNCTION or CLASS); extractNames for same as ExportedSymbol[] (SYMBOL_KIND.FUNCTION or CLASS); createRegexLanguageProviderClass + tryOrEmpty (Null Object); wired in initLanguageProviders (projectHasExtension .swift). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- Selection quality benchmarks (task 057): test/benchmarks/expected-selection/1.json baseline with intent and selectedPaths for canonical task 1; shared/src/integration/**tests**/selection-quality-benchmark.test.ts wires real createProjectScope, createCachingFileContentReader, createFullPipelineDeps, initLanguageProviders, LoadConfigFromFile, applyConfigResult; rulePackProvider from loadRulePackFromPath and createProjectFileReader (no mcp import); InspectRunner with fixture root test/benchmarks/repos/1; selection_quality_task1_matches_baseline asserts order-independent set equality of selected paths against committed baseline.

### 2026-03-01

**Components:** PythonProvider (AST-safe), ModelDetector, ModelDetectorDispatch, compile-handler getModelId, EditorModelConfigReader, EditorModelConfigReaderAdapter, Config model override, GoProvider, RustProvider, JavaProvider, RubyProvider, PhpProvider, CssProvider, cache purge
**Completed:**

- CssProvider (task 048): LanguageProvider for .css with regex only; parseImports for @import url("...") and @import "..." (source = URL/path, isRelative when "." or "/"); extractSignaturesWithDocs returns []; extractSignaturesOnly for selector-like lines (e.g. .class, #id) as CodeChunk with SYMBOL_TYPE.CLASS; extractNames returns []; tryOrEmpty (Null Object); wired in initLanguageProviders (projectHasExtension .css). Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_empty, invalid_returns_empty).
- PhpProvider (task 047): LanguageProvider for .php with regex only; parseImports for require/include/require_once/include_once and use NamespaceClass (path or namespace, isRelative when path starts with "." or "./"); extractSignaturesWithDocs returns []; extractSignaturesOnly for function/class lines; extractNames for class/function; tryOrEmpty returns [] (Null Object); wired in initLanguageProviders (projectHasExtension .php). Shared regex-language-provider-helpers (parseImportsFromPatterns, extractSignaturesFromLineMatchers, extractNamesFromMatchers, tryOrEmpty, createRegexLanguageProviderClass) used by RubyProvider, PhpProvider, and GenericImportProvider; 0% jscpd. Four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- RubyProvider (task 046): LanguageProvider for .rb with regex only (no new dependency); parseImports for require/load with quoted paths and isRelative when path starts with "."; extractSignaturesWithDocs returns []; extractSignaturesOnly for def/class lines as CodeChunk; extractNames for class/module/def self; try/catch returns [] (Null Object); wired in initLanguageProviders (projectHasExtension .rb); shared EMPTY_RELATIVE_PATH in core/types/paths and language-provider-common.ts re-exports to eliminate jscpd clone with generic-import-provider; four tests (parseImports_returns_refs, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_returns_empty).
- Cache purge on session end: removed per-run purgeExpired from CompilationRunner; MCP shutdown handler (registerShutdownHandler) now accepts CacheStore and calls purgeExpired before stopSession so .aic/cache expired blobs are cleaned when the MCP server exits (SIGINT/SIGTERM). CLI still purges at scope creation (once per command).
- RustProvider (task 044): LanguageProvider for .rs via defineTreeSitterProvider and tree-sitter-rust; parseImports (use_declaration), extractSignaturesWithDocs/Only (function_item, function_signature_item, impl_item, struct_item), extractNames (pub items and impl); wired in initLanguageProviders (projectHasExtension .rs); ESLint restricts tree-sitter-rust to rust-provider.ts; tree-sitter-provider-shared barrel and tree-sitter-node-utils helpers (docCommentBefore, buildSignatureChunk, walkTreeCollectImports, singleImportRef, oneImportRefFromNode) to eliminate clones with go-provider; five tests (parseImports_returns_refs, extractSignaturesWithDocs_returns_chunks, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_rust_returns_empty).
- JavaProvider (task 045): LanguageProvider for .java via defineTreeSitterProvider and tree-sitter-java; parseImports (import_declaration), extractSignaturesWithDocs/Only (method_declaration, class_declaration, interface_declaration), extractNames (public modifier); wired in initLanguageProviders (projectHasExtension .java); ESLint restricts tree-sitter-java to java-provider.ts; createSignatureCollectors in tree-sitter-node-utils to eliminate clones with go-provider; five tests (parseImports_returns_refs, extractSignaturesWithDocs_returns_chunks, extractSignaturesOnly_returns_chunks, extractNames_returns_symbols, invalid_java_returns_empty). Fixed server.test.ts CacheStore mock for typecheck.
- PythonProvider (task 042): LanguageProvider for .py using tree-sitter and tree-sitter-python; parseImports (import_statement, import_from_statement), extractSignaturesWithDocs/Only (function_definition, class_definition with docstring), extractNames; try/catch returns []; wired in create-pipeline-deps after TypeScriptProvider, before GenericImportProvider; ESLint restricts tree-sitter and tree-sitter-python to python-provider.ts only; tests skip when tree-sitter native build unavailable (Node 24); server.test.ts skips when server module fails to load.
- KL-006 (partial): ModelDetector interface and ModelEnvHints type in core; ModelDetectorDispatch adapter with Record<EditorId, DetectFn> (ANTHROPIC_MODEL, CURSOR_MODEL); createCompileHandler accepts getModelId(editorId), uses it when args.modelId is null; MCP server wires ModelDetectorDispatch and passes getModelId to handler. compilation_log.model_id now populated when env vars set. Full EditorAdapter/registry and file-based detection deferred.
- File-based model detection (task 054): EditorModelConfigReader interface in core; EditorModelConfigReaderAdapter in adapters (homeDir-injected, reads ~/.cursor/settings.json and ~/.claude/settings.json key "model" via path.join, fs.existsSync, fs.readFileSync, JSON.parse); MCP server creates adapter with process.env["HOME"] ?? os.homedir(), builds ModelEnvHints with env ?? editorConfigReader.read(EDITOR_ID.) fallback; six adapter tests (cursor/claude_code/generic, missing file, malformed JSON, missing model key).
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

- Config loading from aic.config (task 028): ResolvedConfig type and defaultResolvedConfig; ConfigLoader and LoadConfigResult interfaces; LoadConfigFromFile with Zod schema (contextBudget.maxTokens/perTaskClass, contextSelector.heuristic.maxFiles); applyConfigResult for snapshot write and budget/heuristic build; ESLint override for shared/src/config/ (node:fs, node:path, zod); createPipelineDeps/createFullPipelineDeps accept optional heuristicSelectorConfig; MCP and CLI load config, write snapshot when file present, pass budget and heuristic to createFullPipelineDeps; five tests (missing file, valid file, invalid JSON/schema, explicit path)
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
- Golden snapshot tests: fixture repo test/benchmarks/repos/1 (src/auth/service.ts, src/index.ts); shared/src/integration/**tests**/golden-snapshot.test.ts wires InspectRunner with mock RepoMapSupplier, mock Clock, FileContentReader; toMatchSnapshot() and determinism (three runs deep-equal); snapshot under **snapshots**; eslint ignore test/benchmarks/, knip ignore test/benchmarks/
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
- compile command: cli/src/main.ts (Commander aic compile --root/--config/--db, Zod parse, stub CompilationRunner, exit 0/1/2); cli/src/commands/compile.ts (compileCommand(args, runner), re-validate, build CompilationRequest, runner.run(), stdout compiledPrompt, AicError sanitize); compile.test.ts (valid_args_stdout_stub, invalid_args_throws, runner_throws_aic_error); shared/package.json exports for @aic/shared/ subpath resolution
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
- Renamed documentation files to kebab-case (`project-plan.md`, `implementation-spec.md`)
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
