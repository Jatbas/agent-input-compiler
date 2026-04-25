# Agent Input Compiler — Implementation specification

## Current release focus (MCP server and developer utilities)

> This document defines what ships in the current open-source release of this repository. It inherits architecture and definitions from the [Project Plan](project-plan.md). Refer to the Project Plan for the full glossary, enterprise roadmap, and strategic context.
>
> **All implementation must comply with the SOLID principles and design patterns defined in [Project Plan §2.1](project-plan.md).** This is non-negotiable and checked in code review before any other criterion.

---

## Table of Contents

- [Current release focus](#current-release-focus-mcp-server-and-developer-utilities)

1. [Goal](#1-goal)
2. [What ships](#2-what-ships)
3. [Defaults](#3-defaults)
4. [Core Pipeline — implementation detail](#4-core-pipeline--implementation-detail)
   - [Model id resolution (aic_compile)](#model-id-resolution-aic_compile)
   - [Pipeline orchestration (`runPipelineSteps`)](#pipeline-orchestration-runpipelinesteps)
   - [Step 1: Task Classifier](#step-1-task-classifier)
   - [Step 2: Rule Pack Resolver](#step-2-rule-pack-resolver)
   - [Step 3: Budget Allocator](#step-3-budget-allocator)
   - [Step 4: ContextSelector (RelatedFilesBoostContextSelector)](#step-4-contextselector-relatedfilesboostcontextselector)
   - [Step 5: Context Guard](#step-5-context-guard)
   - [Step 5.5: Content Transformer](#step-55-content-transformer)
   - [Step 6: Summarisation Ladder](#step-6-summarisation-ladder)
   - [Language support](#language-support)
   - [Step 7: Constraint Injector](#step-7-constraint-injector)
   - [Step 8: Prompt Assembler](#step-8-prompt-assembler)
   - [Step 9: Executor (deferred design)](#step-9-executor-deferred-design)
   - [Model Context Window Guard](#model-context-window-guard)
   - [Step 10: Telemetry Logger](#step-10-telemetry-logger)
   - [Rules & Hooks Analyzer — deferred design note](#4b-rules--hooks-analyzer--deferred-design-note)
   - [Init, inspect, status, and structured spec compile](#4c-init-inspect-and-status)
   - [Additional implementation notes](#4d-additional-implementation-notes)
5. [Success Criteria](#5-success-criteria)
6. [Error handling](#6-error-handling)
7. [Security, observability & performance](#7-security-observability--performance)
   - [Security](#security)
   - [Observability](#observability)
   - [Performance](#performance)
   - [Incremental compilation performance](#incremental-compilation-performance)
   - [Dependencies](#dependencies)
8. [Multi-project behaviour](#8-multi-project-behaviour)
   - 8a. [Test plan](#8a-test-plan)
   - 8b. [MCP Server Startup Sequence](#8b-mcp-server-startup-sequence)
   - 8c. [Input Validation (Zod Schemas)](#8c-input-validation-zod-schemas)
   - 8d. [Global database & per-project isolation](#8d-global-database--per-project-isolation)
   - 8e. [Deferred: Sandboxed Extensibility (V8 Isolates)](#8e-deferred-sandboxed-extensibility-v8-isolates)
9. [Roadmap](#9-roadmap-aligned-with-project-plan)

> **ToC scope:** Numbered sections (`## 1`–`## 9`) and lettered blocks (`## 4b`–`## 4d`, `## 8a`–`## 8e`) match the list above.
>
> Pipeline stages under §4 are additional `###` headings; only their titles appear in the ToC. Deeper `###` blocks (§4c tool documentation, §8a tests, §8c schemas) are omitted — use the editor outline or in-page search.

---

## 1. Goal

Deliver a working **MCP (Model Context Protocol) server** that compiles optimal context for AI coding tools — with zero required configuration.

**Success looks like:** A developer registers the server (`npx -y @jatbas/aic@latest` in the editor's MCP config) and opens a project. Responses gain focused, bounded context, better file selection, and deterministic, reproducible compilation.

**Bootstrap** is split by code path ([§4c — Bootstrap](#bootstrap-project-setup)). When the MCP client lists workspace roots, `mcp/src/server.ts` runs `installTriggerRule` and `runEditorBootstrapIfNeeded` per root (trigger rule plus hook installers where applicable). **`aic.config.json`, `.aic/` with `0700`, and ignore-manifest lines** are created by `ensureProjectInit` in `mcp/src/init-project.ts` on the **first** `aic_compile` for a project that still has no config (`mcp/src/handlers/compile-handler.ts`).

Editors with hook support run the integration layer: see [Cursor integration layer](technical/cursor-integration-layer.md) and [Claude Code integration layer](technical/claude-code-integration-layer.md). Those scripts call `aic_compile` at lifecycle checkpoints so compiled context can reach the model from the first message of a session.

> **AIC is model-agnostic and editor-agnostic by design.** It detects the active model automatically and adapts. It works with Cursor, Claude Code, and any MCP-compatible editor. No API key, no cloud account, and no config file are required to start.
>
> **Setup:**
>
> ```json
> { "mcpServers": { "aic": { "command": "npx", "args": ["-y", "@jatbas/aic@latest"] } } }
> ```
>
> Add the above to your editor's MCP config. Done.

---

## 2. What ships

### Included ✅

**Primary: MCP Server (`@jatbas/aic`)**

| Feature              | Detail                                                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **MCP Server**       | Primary interface: MCP tools (`aic_compile` plus the full set in **User interface** below). Invoked by the **trigger rule** or **integration hooks**.                                                                                                                                            |
| Editor adapters      | Cursor, Claude Code, Generic MCP fallback                                                                                                                                                                                                                                                        |
| Model adapters       | OpenAI, Anthropic, Generic fallback (auto-detected from request)                                                                                                                                                                                                                                 |
| Task Classifier      | Heuristic keyword/pattern matching → 6 task classes                                                                                                                                                                                                                                              |
| Context selection    | `RelatedFilesBoostContextSelector` wrapping `HeuristicSelector` — path, import-graph, and recency signals; optional `toolOutputs.relatedFiles` merge into `heuristic.boostPatterns` before scoring (`shared/src/bootstrap/create-pipeline-deps.ts`)                                              |
| Context Guard        | Scans selected files for secrets, excluded paths, and prompt injection; excludes sensitive content from the compiled context                                                                                                                                                                     |
| Summarisation Ladder | 4-tier compression: full → signatures+docs → signatures → names                                                                                                                                                                                                                                  |
| Default Rule Packs   | `RulePackResolver` merges `built-in:default` + `built-in:<taskClass>` + optional project `aic-rules/<taskClass>.json` (`shared/src/core/load-rule-pack.ts`); shipped MCP `createRulePackProvider` (`mcp/src/server.ts`) returns empty built-in packs and loads project JSON when the file exists |
| SQLite Storage       | Local telemetry + cache metadata                                                                                                                                                                                                                                                                 |
| Output Caching       | Hash-based, TTL-configurable, auto-invalidating                                                                                                                                                                                                                                                  |
| Config System        | `aic.config.json` — all fields optional; zero-config works out of the box                                                                                                                                                                                                                        |

**User interface (MCP tools; diagnostic CLI)**

**MCP** (Model Context Protocol) is the primary interface when the model runs inside an editor: the client and server exchange JSON-RPC messages over stdio. The same published entrypoint (`server.js`) also implements five read-only **CLI** subcommands (`status`, `last`, `chat-summary`, `quality`, `projects`) that print formatted tables to stdout and exit; see [§8b](#8b-mcp-server-startup-sequence) and [installation.md — CLI Standalone Usage](installation.md#cli-standalone-usage).

On Claude Code, lifecycle hooks use `aic-compile-helper.cjs`, which spawns a short-lived server subprocess and exchanges JSON-RPC over **that** process's stdio; the editor's registered `aic` MCP server uses the normal client tool path with different framing and host tool-result limits — see [Claude Code integration layer §4.1](technical/claude-code-integration-layer.md#41-why-no-aic-core-changes-are-needed).

Per-tool **MCP wire arguments and return shapes** are tabulated under [Project Plan §2.2 — MCP Server Interface](project-plan.md#mcp-server-interface). The table below summarizes capabilities; §4c documents selected tools in depth ([`aic_status`](#aic_status-mcp-tool), [`aic_quality_report`](#aic_quality_report-mcp-tool), [`aic_compile_spec`](#aic_compile_spec-mcp-tool), and related subsections below).

| Interface                                         | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aic_compile` (MCP tool)                          | Compile intent into context; returns JSON the model consumes (`compiledPrompt`, `meta`, and companion fields — [§4 Handler / MCP response shape](#4-core-pipeline--implementation-detail))                                                                                                                                                                                                                                                                                    |
| `aic_inspect` (MCP tool)                          | Show pipeline decision trace without executing; JSON omits per-file `resolvedContent` on `selectedFiles`                                                                                                                                                                                                                                                                                                                                                                      |
| `aic_chat_summary` (MCP tool)                     | Compilation stats for the current conversation                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `aic_status` (MCP tool)                           | Project-level summary: compilations, tokens excluded (context compression), budget utilization, guard blocks; optional MCP argument `timeRangeDays` (1..3660) for rolling-window aggregates — [§4c — `aic_status`](#aic_status-mcp-tool)                                                                                                                                                                                                                                      |
| `aic_last` (MCP tool)                             | Most recent compilation snapshot, prompt summary, and optional persisted **`selection`** trace ([§4c — `aic_last`](#aic_last-mcp-tool))                                                                                                                                                                                                                                                                                                                                       |
| `aic_projects` (MCP tool)                         | Lists known projects from the global database (path, last seen, compilation count)                                                                                                                                                                                                                                                                                                                                                                                            |
| `aic_quality_report` (MCP tool)                   | Rolling-window compile transparency metrics from **`quality_snapshots`**; optional MCP **`windowDays`** **1..365** (schema default **7**); JSON-only MCP **`text`** from `buildQualityReportPayload` — contrasts with **`aic_status`**, which aggregates **`compilation_log`**, caches, guards, and telemetry — [§4c — `aic_quality_report`](#aic_quality_report-mcp-tool)                                                                                                    |
| `aic_model_test` (MCP tool)                       | Optional agent capability probe: challenges plus embedded `aic_compile` intent check against `compilation_log`                                                                                                                                                                                                                                                                                                                                                                |
| `aic_compile_spec` (MCP tool)                     | Structured specification compile via Zod (`CompileSpecRequestSchema`); success `{ compiledSpec, meta }` from `SpecificationCompilerImpl` on cache miss or from SQLite `spec_compile_cache` on hit (`mcp/src/handlers/compile-spec-handler.ts`). Optional `budget` defaults to summed wire `estimatedTokens` when omitted. Wire table and [§4c — `aic_compile_spec`](#aic_compile_spec-mcp-tool); vocabulary: [Project Plan §2.7](project-plan.md#27-agentic-workflow-support) |
| Bootstrap (automatic on connect or first compile) | Scaffold config, trigger rule, hooks, `.aic/` directory ([§4c — Bootstrap](#bootstrap-project-setup))                                                                                                                                                                                                                                                                                                                                                                         |

#### MCP wire overview (nine tools)

Tool registration lives in `mcp/src/server.ts`. Successful calls return **text** content with JSON in the `text` field unless JSON-RPC reports a transport-level error (see [Project Plan §12.1 — MCP Transport Error Handling](project-plan.md#121-mcp-transport-error-handling)).

| Tool                 | Schema file                                        | Arguments (summary)                                                                                                     | Success JSON (text content)                                                                                                  |
| -------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `aic_compile`        | `mcp/src/schemas/compilation-request.ts`           | `intent`, `projectRoot` (defaults may apply when omitted); optional `modelId`, `editorId`, `configPath`, agentic fields | [§4 Handler / MCP response shape](#4-core-pipeline--implementation-detail); reparent-only branch under **Agentic workflows** |
| `aic_inspect`        | `mcp/src/schemas/inspect-request.schema.ts`        | `intent`, `projectRoot`, optional `configPath`                                                                          | `{ trace: PipelineTrace }` without `resolvedContent` on `selectedFiles` (`mcp/src/handlers/inspect-handler.ts`)              |
| `aic_chat_summary`   | `mcp/src/schemas/conversation-summary-request.ts`  | Optional `conversationId`                                                                                               | Payload from `buildChatSummaryToolPayload` (`mcp/src/diagnostic-payloads.ts`)                                                |
| `aic_status`         | `mcp/src/schemas/status-request.schema.ts`         | Optional `timeRangeDays` (integer 1..3660)                                                                              | Status aggregates; rolling window in [§4c — `aic_status`](#aic_status-mcp-tool)                                              |
| `aic_last`           | _(empty wire object)_                              | No fields                                                                                                               | Last-compilation payload from `buildLastPayload` (`mcp/src/diagnostic-payloads.ts`)                                          |
| `aic_projects`       | _(empty wire object)_                              | No fields                                                                                                               | Known-projects list from `buildProjectsPayload` (`mcp/src/diagnostic-payloads.ts`)                                           |
| `aic_quality_report` | `mcp/src/schemas/quality-report-request.schema.ts` | Optional `windowDays` (integer 1..365)                                                                                  | Window JSON from `buildQualityReportPayload` — [§4c — `aic_quality_report`](#aic_quality_report-mcp-tool)                    |
| `aic_model_test`     | `mcp/src/schemas/model-test-request.schema.ts`     | `projectRoot`; optional paired `probeId` (8× `A`–`Z`) and `answers` `[number, string]`                                  | Generate or validate probe (`mcp/src/handlers/model-test-handler.ts`)                                                        |
| `aic_compile_spec`   | `mcp/src/schemas/compile-spec-request.schema.ts`   | `spec` required; optional `budget`                                                                                      | `{ compiledSpec, meta }` — [§4c — `aic_compile_spec`](#aic_compile_spec-mcp-tool)                                            |

The integration layer also runs quality checks on edited files at stop time; see [Cursor integration layer](technical/cursor-integration-layer.md) and [Claude Code integration layer](technical/claude-code-integration-layer.md) for the full flow per editor.

### Excluded (deferred) ❌

| Feature                             | Target  |
| ----------------------------------- | ------- |
| VectorSelector / HybridSelector     | v2.0.0  |
| Rules auto-fix (`aic fix-rules`)    | v1.0.0  |
| Sandboxed Extensibility (V8)        | v2.0.0  |
| Enterprise: RBAC, SSO, audit        | v3.0.0  |
| Policy engine / governance adapters | v2.0.0  |
| GUI / web dashboard                 | v3.0.0  |
| Multi-model orchestration           | v2.0.0+ |

> For the full non-goals list (including Windows support, real-time file watching, cloud/SaaS deployment), see [Project Plan §1 Non-Goals](project-plan.md).

---

## 3. Defaults

All defaults apply when no config file exists or a field is omitted.

> **Loader truth:** Runtime validation for `aic.config.json` is the minimal **Zod** (schema-validation) object in `shared/src/config/load-config-from-file.ts` — see [§8c — `AicConfigSchema`](#aicconfigschema). Rows in the table below include product-level defaults and Project Plan fields that may not yet be read by that schema; use §8c when you need to know which keys are guaranteed to parse today.

| Setting                                  | Default                                                                                                                                                                                                 | MCP override                                                                                    | CLI flag override |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------- |
| Project root                             | Git root (walk up from current working directory)                                                                                                                                                       | Auto-detected per request                                                                       | `--root`          |
| Config file                              | Auto-discovered (walk up from project root)                                                                                                                                                             | Auto-discovered                                                                                 | `--config`        |
| Database                                 | `~/.aic/aic.sqlite` (global)                                                                                                                                                                            | Auto-resolved                                                                                   | `--db`            |
| Context budget                           | Auto (default **`maxTokens` 0** → fixed model headroom in `BudgetAllocator`; positive values = manual cap)                                                                                              | `aic.config.json` only                                                                          | `--budget`        |
| Context selector                         | `heuristic`                                                                                                                                                                                             | `aic.config.json` only                                                                          | Config only       |
| Model id                                 | On-disk cache `.aic/session-models.jsonl` (hooks) plus MCP `modelId` argument are consulted before `ModelDetector` / config; full order in [§4 — Model id resolution](#model-id-resolution-aic_compile) | Non-null `modelId` tool argument, then `.aic/session-models.jsonl`, then `model.id` or detector | Config only       |
| Model provider                           | `null` (required only for the deferred executor path)                                                                                                                                                   | `aic.config.json` only                                                                          | Config only       |
| Model endpoint                           | `null` (provider default)                                                                                                                                                                               | `aic.config.json` only                                                                          | Config only       |
| Model API key env                        | `null` (env var name, not the key)                                                                                                                                                                      | `aic.config.json` only                                                                          | Config only       |
| Cache enabled                            | `true`                                                                                                                                                                                                  | `aic.config.json` only                                                                          | `--no-cache`      |
| Cache TTL                                | 60 minutes                                                                                                                                                                                              | `aic.config.json` only                                                                          | Config only       |
| Compilation metrics (`telemetry_events`) | Written after a successful pipeline run when the project is not disabled (`enabled !== false` in resolved config); see [Step 10](#step-10-telemetry-logger)                                             | Not gated in minimal `load-config-from-file.ts` Zod schema                                      | Config only       |
| Anonymous aggregate telemetry queue      | `anonymous_telemetry_log` table exists in schema (`shared/src/storage/migrations/001-consolidated-schema.ts`); no writer or HTTPS client in shipped TypeScript sources                                  | —                                                                                               | —                 |
| Guard enabled                            | `true`                                                                                                                                                                                                  | `aic.config.json` only                                                                          | Config only       |
| Guard additional exclusions              | `[]` (empty — built-in patterns always active)                                                                                                                                                          | `aic.config.json` only                                                                          | Config only       |
| Guard allow patterns                     | `[]`                                                                                                                                                                                                    | `aic.config.json`                                                                               | Config only       |
| Content transformers enabled             | `true`                                                                                                                                                                                                  | `aic.config.json` only                                                                          | Config only       |
| Strip comments                           | `true`                                                                                                                                                                                                  | `aic.config.json` only                                                                          | Config only       |
| Normalize whitespace                     | `true`                                                                                                                                                                                                  | `aic.config.json` only                                                                          | Config only       |

---

## 4. Core Pipeline — implementation detail

> **Audience:** Sections §1–§3 are readable by integrators and curious users. From the pipeline orchestration subsection onward, this document is a developer reference: it names types, file paths, and behaviour tied to `shared/src/core/run-pipeline-steps.ts` and `shared/src/bootstrap/create-pipeline-deps.ts`.

**Pre-step (before Step 1):** A **RepoMapSupplier** (`FileSystemRepoMapSupplier`, `WatchingRepoMapSupplier`) supplies the RepoMap. The project root is scanned (respecting `.gitignore`), per-file token estimates use tiktoken, and the result is cached in the `repomap_cache` SQLite table. The heuristic selector consumes a **discovered** RepoMap (after intent-aware file discovery). Cache is re-used until the file-tree hash (SHA-256 of in-scope paths + sizes + mtimes) changes.

**Handler:** These stages run inside the `aic_compile` MCP tool handler (`mcp/src/handlers/compile-handler.ts`). The handler resolves and sanitises wire arguments, builds a `CompilationRequest` (including `sessionId` from server session state when hooks run), runs `runPipelineSteps`, and on success writes `last-compiled-prompt.txt` under `.aic/`. Step 9 (Executor) in this document is a deferred design path only. When the project is enabled and the run succeeds, the handler calls `writeCompilationTelemetry` (see Step 10).

**MCP response shape (pipeline success):** The tool returns MCP text content whose JSON parse yields `compiledPrompt`, `meta`, `conversationId` (string or null), and `updateMessage` (string or null). `meta` is typed as `CompilationMeta` in `shared/src/core/types/compilation-types.ts` (aggregate fields such as file and token counts, `transformTokensSaved`, `summarisationTiers`, and sanitised `guard`); it does **not** include the persisted per-file selection trace — that surface is `aic_last` ([§4c — `aic_last`](#aic_last-mcp-tool)) and [Selection trace (persistence and tools)](#selection-trace-persistence-and-tools). The `compiledPrompt` string is the assembled context after optional install-scope warning prefix, optional exclusion-instruction prefix when the guard blocked or redacted at least one selected file, and a fixed reinforcement suffix that reminds the model to call `aic_compile` again on the next message (`mcp/src/handlers/compile-handler.ts`). When the server upgraded packaged MCP config to `@latest`, the object may include `configUpgraded` (human-readable reload instruction). When install-scope warnings were recorded at server start, the object may include `warnings` (string array). The alternate reparent-only JSON body (`{ reparented, rowsUpdated }`) is described under **Agentic workflows** below. Integrators use `compiledPrompt` as the primary model context; other fields support continuity, diagnostics, and UX.

### Model id resolution (aic_compile)

The value passed to the pipeline as `modelId` is resolved in `mcp/src/handlers/compile-handler.ts` before `runPipelineSteps` runs. Sources are consulted in order; a non-null result stops the chain.

1. **MCP tool argument** — When `aic_compile` receives a non-null `modelId` that passes `CompilationRequestSchema` in `mcp/src/schemas/compilation-request.ts`, that string is used.
2. **`.aic/session-models.jsonl`** —
   - **Read API:** `readSessionModelIdFromSessionModelsJsonl` in `shared/src/maintenance/read-session-model-jsonl.ts` reads `<projectRoot>/.aic/session-models.jsonl`. Hooks append lines through `integrations/shared/session-model-cache.cjs` using fields `m`, `c`, `e`, and `timestamp`.
   - **Tail read:** Read at most the last 262,144 bytes (`SESSION_MODEL_JSONL_MAX_TAIL_BYTES` in that module).
   - **Partial first line:** When the slice starts after byte 0, discard text through the first newline so parsing starts on a whole JSONL record.
   - **Selection:** `reduceSessionModelJsonlState` in `shared/src/maintenance/select-session-model-from-jsonl.ts` folds lines for the active `editorId` and optional `conversationId` (prefer the latest line whose `c` matches the non-empty trimmed `conversationId`, else the latest valid line for that `editorId`).
   - **Full-file fallback:** When the file is non-empty but the tail scan cannot yield a model id — `conversationId` is non-empty and no matching `c` appears in the tail, or `conversationId` is empty and no per-editor line appears in the tail — read the entire file and apply the same selection logic.
3. **Config versus detector** — `getModelId` in `mcp/src/server.ts` supplies `model.id` from `aic.config.json` loaded when the MCP server starts (`configLoader.load` with a null config path) when set, otherwise `modelDetector.detect(editorId)`.

When the resolution chain yields a non-null string, `normalizeModelId` maps the value `default` to `auto` (case-insensitive). The resolved `modelId`, wire `conversationId`, and `editorId` then pass through `SanitisedCacheIdsSchema` in `mcp/src/schemas/compilation-request.ts`; on parse failure the handler substitutes null for model and conversation ids and uses `generic` as `editorId` when building `CompilationRequest` (`mcp/src/handlers/compile-handler.ts`). The pipeline receives those sanitised values.

**Related docs:** [AIC JSONL caches under `.aic/`](technical/aic-jsonl-caches.md) covers append, retention, and read semantics for this log. [MCP server and shared CJS boundary](technical/mcp-and-shared-cjs-boundary.md) summarises how the MCP handler and integration modules share the read path.

### Pipeline orchestration (`runPipelineSteps`)

The numbered steps below explain the main concepts. The **authoritative execution order** is `runPipelineSteps` in `shared/src/core/run-pipeline-steps.ts`:

1. **IntentClassifier** (Step 1) — task class + subject tokens.
2. **RulePackResolver** (Step 2) — merged `RulePack`.
3. **BudgetAllocator** (Step 3) — **total** token budget for this compile (`maxTokens` **0** = auto headroom; see Step 3 subsection).
4. **RepoMap** — from `repoMapSupplier.getRepoMap` (pre-step above).
5. **Overhead + code budget** — structural map, optional session summary, spec-ladder slice (capped at ~20% of total budget), constraints text, and a fixed 100-token task header are token-counted; **codeBudget** = max(0, totalBudget − overhead). **maxFiles:** when `heuristic.maxFiles` is **0**, `resolveAutoMaxFiles` in `shared/src/core/run-pipeline-steps.ts` sets **base** `max(5, min(40, ceil(sqrt(totalFiles))))`, scales by `effectiveContextWindow / CONTEXT_WINDOW_DEFAULT` (**128_000** from `budget-allocator.ts`; `effectiveContextWindow` is `sessionContext?.contextWindow ?? toTokenCount(CONTEXT_WINDOW_DEFAULT)` (`run-pipeline-steps.ts`; optional `PipelineStepsRequest.contextWindow` flows through `deriveSessionContext` when set), then returns `max(5, min(300, ceil(baseMax * scale)))` (**`MAX_FILES_UPPER_BOUND`**).
6. **IntentAwareFileDiscoverer** — extends the RepoMap with intent-scored files before selection (uses `maxFilesOverride` from the resolved cap).
7. **ContextSelector** (Step 4) — chooses context files within **codeBudget**. Shipped wiring: `RelatedFilesBoostContextSelector` around `HeuristicSelector` (`shared/src/bootstrap/create-pipeline-deps.ts`).
8. **Context Guard** (Step 5) on the main selected set — then **Content Transformer** (Step 5.5) — then **Summarisation Ladder** (Step 6) on **codeBudget**.
9. **LineLevelPruner** — when `subjectTokens` is non-empty, prunes line-level detail on ladder output.
10. **PromptAssembler** (Step 8) — final prompt string (receives structural map, session summary snippet, spec ladder files, and main pruned files).

**Note:** `StructuralMapBuilder`, `ConversationCompressor` (session summary), and **SpecFileDiscoverer** (spec ladder under `isSpecPath`, capped at ~20% of **totalBudget**) run **before** Step 4 in `runPipelineSteps` so their token costs feed **overhead** and **codeBudget**; the same spec ladder output is passed through to **PromptAssembler**.

Merged rule-pack constraints are emitted during assembly (PromptAssembler / Step 8 in the subsections below), not via separate `runPipelineSteps` calls.

**Agentic workflows:** The internal `CompilationRequest` type carries optional session fields (`sessionId`, `stepIndex`, `stepIntent`, `previousFiles`, `toolOutputs`, `conversationTokens`) plus `triggerSource` and `conversationId`. The MCP Zod schema in `mcp/src/schemas/compilation-request.ts` validates optional wire fields that map into these (`editorId`, `triggerSource`, `conversationId`, `reparentFromConversationId`, `stepIndex`, `stepIntent`, `previousFiles`, `toolOutputs`, `conversationTokens`). The compile handler maps them into `CompilationRequest`, except when `triggerSource` is `subagent_stop` with a non-empty `reparentFromConversationId` and `conversationId`: then it runs `reparentSubagentCompilations` only and returns JSON `{ reparented: true, rowsUpdated: N }` without invoking the pipeline. When an `aic_compile` request has a weak intent (empty after trim, matching the known “provide context for …” prefix list, or equal to the MCP Zod omitted-intent placeholder default) and a non-null `conversationId`, the handler may resolve `CompilationRequest.intent` from the most recent non-`general` compilation for that conversation instead of using the raw request intent, so that file selection reflects the last meaningful task description. On Cursor, the MCP `preToolUse` hook (`AIC-inject-conversation-id.cjs`) may replace a weak `aic_compile` intent from the prewarmed prompt file under `os.tmpdir()` named `aic-prompt-<generation_id>` when `input.generation_id` is present and that file holds non-empty text after the same trim and `<ide_selection>` stripping as the compile gate, before the MCP request is sent. `sessionId` is not an MCP client argument; the composition root sets it from MCP server session state when applicable. Hook integrations supply `conversationId` and related fields where the editor exposes them (see [Project Plan §2.7](project-plan.md#27-agentic-workflow-support)). Resolution helpers live in `integrations/shared/conversation-id.cjs` (`conversationIdFromTranscriptPath` then `resolveConversationIdFallback` — [Integrations shared modules reference](technical/integrations-shared-modules.md)). When the hook envelope includes `cursor_version`, `integrations/cursor/is-cursor-native-hook-payload.cjs` classifies Cursor-native payloads so Claude-registered hooks can no-op without spawning MCP ([Cursor integration layer — Runtime boundary guards](technical/cursor-integration-layer.md#44-runtime-boundary-guards-cursor_version)). Cursor `AIC-inject-conversation-id.cjs` may inject `conversationId` into `aic_chat_summary` tool input as well as `aic_compile`; Claude PreToolUse matches `aic_compile` only ([Claude Code integration layer §7.4](technical/claude-code-integration-layer.md#74-pretooluse--bash-and-mcp-matchers)). Optional `toolOutputs` is forwarded on `PipelineStepsRequest` (`shared/src/core/run-pipeline-steps.ts`). Structured `relatedFiles` on each entry (`ToolOutput` in `shared/src/core/types/compilation-types.ts`) can change selection and compilation cache keys as described under Step 4; `type` and `content` do not affect selection scoring. Stored tool outputs are summarised into the deterministic `Steps completed:` header on later compiles (last 10 steps in the prompt; see Project Plan §2.7).

### Step 1: Task Classifier

**Implementation:** `IntentClassifier` in `shared/src/pipeline/intent-classifier.ts` (this section uses the product name “task class” for the enum `TaskClass`).

**Input:** Raw intent string — sample: `"refactor auth module to use JWT"`

**Method:** Heuristic keyword/pattern matching against a built-in dictionary:

| Task Class | Trigger Keywords/Patterns                             |
| ---------- | ----------------------------------------------------- |
| `refactor` | refactor, restructure, reorganize, clean up, simplify |
| `bugfix`   | fix, bug, broken, error, crash, issue, repair         |
| `feature`  | add, create, implement, build, new, introduce         |
| `docs`     | document, readme, jsdoc, comment, explain, describe   |
| `test`     | test, spec, coverage, assert, mock, unit test         |
| `general`  | _(fallback when no keywords match)_                   |

**Output:** `TaskClassification { taskClass: TaskClass, confidence: Confidence, matchedKeywords: string[], subjectTokens: string[], specificityScore: Confidence, underspecificationIndex: Confidence }`

**Edge cases:**

- Multiple task classes match → highest keyword-count wins; ties → alphabetical first
- No match → `general` with confidence 0.0

---

### Step 2: Rule Pack Resolver

**Input:** TaskClassification + config

**Method:**

1. Resolve `built-in:default` and `built-in:<taskClass>` through `RulePackProvider.getBuiltInPack` (names from `shared/src/pipeline/rule-pack-resolver.ts`). The published MCP `createRulePackProvider` (`mcp/src/server.ts`) returns an empty `RulePack` for every built-in name; the merge step still runs.
2. Resolve optional project `aic-rules/<taskClass>.json` through `getProjectPack` when the file exists (`shared/src/core/load-rule-pack.ts`).
3. Merge in `RulePackResolver.resolve` order: built-in slots first, then project overlay when present (arrays concatenate + dedupe; scalars such as `budgetOverride` last-wins in the pack layer only).

**Output:** Merged `RulePack { constraints: string[], includePatterns: GlobPattern[], excludePatterns: GlobPattern[], budgetOverride?: TokenCount }`

**Example — `aic-rules/refactor.json` (Advanced Feature):**

See [Project Plan §3.1](project-plan.md) for the full annotated rule pack example and [Project Plan §3.2](project-plan.md) for the advanced authoring guide. Custom rule packs are an **opt-in power-user feature**. AIC works out of the box with zero configuration: shipped MCP built-in merge slots are empty, and effective constraints or patterns come only from an optional `aic-rules/<taskClass>.json` when you add one. Most standard users will never need to author custom rule packs or create an `aic-rules/` directory. The key fields are: `constraints` (string array), `includePatterns` / `excludePatterns` (glob arrays), optional `budgetOverride` (number), and optional `heuristic.boostPatterns` / `heuristic.penalizePatterns` (glob arrays).

**Merge behavior:** Arrays concatenated + deduplicated; scalar values (`budgetOverride`) use last-wins within the rule-pack layer only (project overlay after the built-in merge chain in `RulePackResolver`). `CompilationRequest` has no budget field; the Budget Allocator reads `RulePack.budgetOverride` and config only (see `shared/src/pipeline/budget-allocator.ts`).

**Edge cases:**

- Missing project rule pack → continue with the merged built-in slots only (empty constraints and patterns on the shipped MCP provider)
- Malformed JSON → error with file path and parse error details

---

### Step 3: Budget Allocator

**Input:** `BudgetConfig` (from resolved `aic.config.json`), resolved `RulePack`, and optional `SessionBudgetContext` (`shared/src/core/types/session-budget-context.ts` — optional `conversationTokens` and optional `contextWindow`).

**Session budget context:** Built in `deriveSessionContext` (`shared/src/core/run-pipeline-steps.ts`): (1) If `PipelineStepsRequest.conversationTokens` is set, the result includes **`conversationTokens`** and includes **`contextWindow`** when `PipelineStepsRequest.contextWindow` is set. (2) Else if `sessionId` is set and `agenticSessionState` exists, **`conversationTokens`** is the sum of `tokensCompiled` over `getSteps(sessionId)`, again with optional **`contextWindow`** from the request when set. (3) Else if only **`PipelineStepsRequest.contextWindow`** is set (model-derived on the request from `compilation-runner.ts`), the result is **`{ contextWindow }` only** — no **`conversationTokens`** field. (4) Else **`deriveSessionContext`** returns **`undefined`**. A **`contextWindow`**-only object still participates in **`BudgetAllocator`**’s **`effectiveWindow`** / **`hasWindowInfo`** path; it does not imply wire **`conversationTokens`** were sent.

**Resolution order for the base budget (highest priority first):**

1. `budgetOverride` in resolved RulePack (if present)
2. `contextBudget.perTaskClass[taskClass]` in config (if present for that task class)
3. `contextBudget.maxTokens` in config (default **0** = auto when the field is omitted — `shared/src/config/load-config-from-file.ts`, `shared/src/core/types/resolved-config.ts`)

**Auto mode (`maxTokens` resolves to numeric 0):** After the three-way resolution above, if the resulting base is **0**, `BudgetAllocator.allocate` computes **`effectiveWindow`** = configured project `contextWindow` from `BudgetConfig.getContextWindow()` when non-null, else `sessionContext?.contextWindow` when `deriveSessionContext` supplied it (model-derived lookup from `resolveModelDerivedContextWindow` in `shared/src/pipeline/compilation-runner.ts`), else **`CONTEXT_WINDOW_DEFAULT` (128_000)** in `shared/src/pipeline/budget-allocator.ts`, then returns **headroom** = `max(0, effectiveWindow − RESERVED_RESPONSE_DEFAULT − conversationTokens − TEMPLATE_OVERHEAD_DEFAULT)` with the same reserved/overhead literals as in that module — not a separate `AdaptiveBudgetAllocator` class.

**Session clamp (positive manual base):** When the resolved base is **positive** and `sessionContext.conversationTokens` is defined **or** either configured or session **`contextWindow`** is present (`hasWindowInfo` in `allocate`), `BudgetAllocator.allocate` returns the lesser of that base and the same headroom expression using **`effectiveWindow`** as above ( **`min(base, headroom)`** can still equal **base** when headroom is not binding). When **`conversationTokens`** is absent from `sessionContext` and **neither** configured nor session window hint is present, the allocated **total** budget is the positive **base** unchanged.

The shipped config schema and `BudgetAllocator` do not apply **`windowRatio`** or utilization-based auto-tuning; optional manual caps come only from the rule pack and config keys. Model id feeds an optional **`contextWindow`** on the pipeline request for **`deriveSessionContext`**; richer formula-derived bases: [Project Plan §2.7](project-plan.md#27-agentic-workflow-support) and [Model-derived budgets (shipped subset and roadmap)](#model-derived-budgets-shipped-subset-and-roadmap).

**Downstream code budget:** `runPipelineSteps` subtracts measured pipeline overhead (structural map, session summary, spec ladder slice, constraints, fixed 100-token task header) from this **total** allocation to produce **codeBudget** for Step 4 and the main summarisation ladder.

**Output:** `budget: TokenCount` (total budget, in tokens, counted via **tiktoken cl100k_base**); `codeBudget` on `PipelineStepsResult` is the remainder after overhead.

**Tokenizer:** All token counts in AIC use **tiktoken** with the **cl100k_base** encoding (OpenAI/Claude compatible). Fallback: `word_count × 1.3` if tiktoken is unavailable.

---

### Step 4: ContextSelector (RelatedFilesBoostContextSelector)

**Composition:** `PipelineStepsDeps.contextSelector` is `RelatedFilesBoostContextSelector` delegating to `HeuristicSelector` (`shared/src/bootstrap/create-pipeline-deps.ts`). The sections below describe scoring inside `HeuristicSelector`; tool-output path boosts are merged into `heuristic.boostPatterns` in the outer wrapper before that logic runs.

**Input:** TaskClassification + RepoMap + **codeBudget** (not raw total budget) + RulePack (for include/exclude/boost/penalize patterns) + optional `toolOutputs` from `PipelineStepsRequest` + `config.contextSelector` (injected via `HeuristicSelector` constructor; carries `maxFiles` and scoring weights) + effective `maxFilesOverride` from `runPipelineSteps` when auto mode applies

**Tool-output related paths:** When `toolOutputs` is defined and `dedupeRelatedPathsInOrder` yields at least one path (`shared/src/pipeline/related-files-boost-context-selector.ts`), each path is escaped for glob metacharacters, converted with `toGlobPattern`, and appended to `heuristic.boostPatterns` via `mergeRulePackWithRelatedBoosts`. Candidates are scored after `includePatterns` / `excludePatterns` filtering; each **file** gains +0.2 per `boostPatterns` entry that matches its path via `matchesGlob` (including patterns derived from tool-output related paths) and −0.2 per matching `penalizePatterns` entry, clamped in `scoreCandidate` (`shared/src/pipeline/heuristic-selector.ts`). The inner `HeuristicSelector.selectContext` accepts an optional `toolOutputs` parameter but does not read it (`_toolOutputs`); boosting from tool outputs happens only in the wrapper. When `toolOutputs` is omitted or yields no related paths, the wrapper forwards the original rule pack unchanged.

**Compilation cache key:** When the deduplicated related-path set is non-empty, `computeCompilationCacheKey` (`shared/src/pipeline/compilation-runner.ts`) appends `canonicalRelatedPathsForSelectionCache`: the same paths **sorted** with `localeCompare` and joined by `\0`, so the same multiset of paths in any wire order maps to one cache segment.

**Heuristic scoring algorithm:**

Final score = weighted sum of **five** normalised signals in `[0.0, 1.0]`: **path relevance**, **import proximity**, **symbol relevance**, **recency**, and **size penalty**. Per-task-class weights are defined in `DEFAULT_WEIGHTS_BY_TASK_CLASS` in `shared/src/pipeline/heuristic-selector.ts` (they are not a single global 0.4 / 0.3 / 0.2 / 0.1 split). Rule-pack `boostPatterns` add +0.2; `penalizePatterns` subtract −0.2 (clamped 0–1). Import proximity uses BFS depth from task-relevant seed files; symbol relevance uses `SymbolRelevanceScorer`; both score `0.0` when no `LanguageProvider` applies. When `Number(task.confidence)` is strictly below `0.5`, the recency contribution that enters the weighted sum (`rec` times the per-class recency weight) is multiplied by `0.5`; the `recency` field recorded per file in selection traces remains the unscaled normalised rank.

Full scoring detail with normalisation methods: [Project Plan §8](project-plan.md).

**Constraints applied:**

- `includePatterns` from rule pack (whitelist)
- `excludePatterns` from rule pack + config (blacklist)
- `maxFiles` from config (default **0** = auto via `resolveAutoMaxFiles`: base from `ceil(sqrt(totalFiles))` in **[5, 40]**, scaled by effective context window ÷ **128_000**, final clamp **[5, 300]**; positive = fixed cap), merged via `maxFilesOverride` on the `RulePack` passed to discovery/selection

**Language awareness:** Import-graph walking and symbol relevance delegate to the registered `LanguageProvider` list. For files with no provider, those signals score `0` and the file relies on the remaining signals. File language detection is extension-based with a filename fallback for extensionless files; see [Project Plan §8 — Language Detection](project-plan.md) for the full mapping table.

**Import-graph build failures:** `ImportGraphProximityScorer` builds forward import edges by reading each repo file that has a matching `LanguageProvider` and calling that provider's `parseImports` (`shared/src/pipeline/import-graph-proximity-scorer.ts`). When `FileContentReader.getContent` rejects, `ImportGraphFailureSink.notifyImportGraphFailure` is invoked with `kind: "read"`; when `parseImports` throws, with `kind: "parse"`. In both cases the scorer skips outbound edges for that path and continues building the graph for other files. The pipeline does not fail compilation or context selection because of these events; import proximity scores reflect only edges that were built successfully. `createPipelineDeps` passes an `ImportGraphFailureSink` into `ImportGraphProximityScorer`; the default argument is `noopImportGraphFailureSink` (silent) (`shared/src/bootstrap/create-pipeline-deps.ts`). The shipped MCP server installs a sink that writes one stderr line per failure: `[aic] import-graph:<kind> <repo-relative-path> <token>` where `<kind>` is `read` or `parse`, and `<token>` is `cause.name` when `cause` is an `Error`, otherwise the literal `non-error-throw` (`mcp/src/server.ts`).

**Output:** `ContextResult { files: SelectedFile[], totalTokens: TokenCount, truncated: boolean }`

#### Selection trace (persistence and tools)

Integrators read the persisted selection trace from the **`aic_last`** MCP tool: top-level **`selection`** is a parsed `SelectionTrace` or JSON **`null`** when the latest `compilation_log` row has no stored trace (including **compilation cache hits**, which persist `selection_trace_json` as null). The trace is **not** included in **`aic_compile`**'s **`meta`**. Live inspection without reading the database uses **`aic_inspect`**, which returns `{ trace: PipelineTrace }`; that JSON shape differs from persisted `selection`.

After a compilation **cache miss**, `buildSelectionTraceForLog` in `shared/src/core/build-selection-trace-for-log.ts` builds `SelectionTrace` (`shared/src/core/types/selection-trace.ts`) from the pipeline result: `selectedFiles` lists each **pruned** path with numeric score and the same signal dimensions as Step 4 (`pathRelevance`, `importProximity`, `symbolRelevance`, `recency`, `sizePenalty`, `ruleBoostCount`, `rulePenaltyCount`). `excludedFiles` merges context-selector trace rows (`ContextResult.traceExcludedFiles`) with paths removed by Context Guard (`EXCLUSION_REASON.GUARD_BLOCKED`), sorted by descending score then path; at most **50** excluded rows are kept.

Exclusion reason strings on trace rows match `EXCLUSION_REASON` in `selection-trace.ts`: `include_pattern_mismatch`, `exclude_pattern_match`, `max_files`, `budget_exceeded`, `guard_blocked`, `zero_semantic_signal`. `aic_last` validates persisted JSON with `SelectionTraceSchema` in `mcp/src/schemas/selection-trace.schema.ts`.

The trace is stored as JSON on `compilation_log.selection_trace_json` (`shared/src/storage/sqlite-compilation-log-store.ts`; column added in `shared/src/storage/migrations/003-compilation-selection-trace.ts`).

> **Compilation cache hit:** `runCacheHitPath` in `shared/src/pipeline/compilation-runner.ts` passes `selectionTrace: null` into the log row, so `aic_last.selection` is **null** even though the compile succeeded from cache.

**MCP handler boundary:** A whole-prompt hit still executes `CompilationRunner.run` through RepoMap load, classification, and keying before `cacheStore.get`; it only omits `runPipelineSteps`. After `runner.run` resolves, `createCompileHandler` (`mcp/src/handlers/compile-handler.ts`) always calls `writeCompilationTelemetry`, `tryRecordQualitySnapshot`, and best-effort `last-compiled-prompt.txt` for that success path, including cache hits — the same persistence and observability as a miss, aside from selection trace and pipeline-derived guard findings.

---

### Step 5: Context Guard

**Input:** `ContextResult` from Step 4

**Purpose:** Scans every selected file before it reaches the Summarisation Ladder. Excludes secrets, excluded paths, and prompt injection patterns from the compiled context.

> **Scope:** Context Guard controls what AIC includes in the compiled prompt. It does not prevent models from reading excluded files directly through editor-provided tools (`read_file`, `Shell`). Direct file access is governed by the editor's permission model (`.cursorignore` and related ignore rules).

**Checks run in order (shipped):**

| Scanner                      | Finding type        | Severity          | Action                                                                                                                                                                              |
| ---------------------------- | ------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExclusionScanner`           | `excluded-file`     | `block`           | File path matches a never-include pattern (runs before content scanners)                                                                                                            |
| `SecretScanner`              | `secret`            | `block`           | File content matches a known secret regex                                                                                                                                           |
| `PromptInjectionScanner`     | `prompt-injection`  | `block`           | Suspected instruction-override string detected; file removed from context, finding logged                                                                                           |
| `MarkdownInstructionScanner` | `prompt-injection`  | `block` or `warn` | Same finding type as prompt-injection scanning; some patterns use `warn` severity (see `instruction-patterns.ts`)                                                                   |
| `CommandInjectionScanner`    | `command-injection` | `block`           | Shell / substitution patterns on non-markdown files (`command-injection-scanner.ts`; markdown is handled by `MarkdownInstructionScanner` and skipped here to avoid false positives) |

Wiring order for content scanners: `create-pipeline-deps.ts` builds the `contentScanners` array as Secret → PromptInjection → MarkdownInstruction → CommandInjection, after `ExclusionScanner` in `ContextGuard`.

**Never-include path patterns (shipped):**
`.env`, `.env.*`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `*secret*`, `*credential*`, `*password*`, `*.cert`

**Secret patterns (shipped):** 6 regex patterns covering AWS keys, GitHub tokens, Stripe keys, generic named API keys, JWTs, and SSH/TLS private key headers. See [Project Plan §8.4](project-plan.md#84-contextguard-interface) for the full pattern table.

**Prompt injection patterns (shipped):** 6 regex patterns covering instruction override, persona hijack, fake system prompt headers, constraint override, and model-specific special token injection (OpenAI chat markup, Llama/Mistral instruction tokens). See [Project Plan §8.4](project-plan.md#84-contextguard-interface) for the full pattern table and false-positive mitigation guidance.

**Behaviour on exclusion:**

- Excluded files are removed from the file list before it is passed to the Summarisation Ladder
- The pipeline never fails due to Guard findings — it filters and continues
- `GuardResult` is attached to `CompilationMeta.guard`. `aic_compile` returns a **sanitised** `meta.guard` for model consumption (duplicate findings by `(type, pattern)` merged; at most twenty findings). **`aic_inspect`** returns a full pipeline `trace` including guard details. **`aic_last`** JSON plus the human-facing **last** table expose **aggregate** per-run guard data: from **`telemetry_events`**, `guardFindingCount` (aligned with `guard_findings`) and `guardBlockCount` (aligned with `guard_blocks` — a distinct blocked-file count, not a second finding count); when `lastCompilation` is non-null, the payload also includes **`guardScannedFileCount`**, set to the same value as the snapshot’s **`filesSelected`** in `buildLastPayload` to support the disambiguated **Guard (this run)** label (it is not an extra read from `telemetry_events`). See [**`aic_last` (MCP tool)**](#aic_last-mcp-tool) for the human string shapes. **Optional** **`selection`**; individual guard findings are **not** repeated in **`aic_last`** (those stay in `meta.guard` / `aic_inspect` — [Selection trace (persistence and tools)](#selection-trace-persistence-and-tools)).
- If all selected files are excluded, the pipeline returns an empty context with a `guard.passed: false` indicator

**Guard allow patterns (shipped):**

`guard.allowPatterns` in `aic.config.json` is a list of repo-relative glob patterns (each pattern 1–512 characters, max 64 patterns; validated in `load-config-from-file.ts`). Matching is done via the same logic as `matchesGlob` (see `shared/src/pipeline/glob-match.ts`). Files whose path matches any allow pattern skip content scanners (Secret, PromptInjection, MarkdownInstruction, CommandInjection); **never-include path patterns** (`.env`, `*.pem`, `*.key`, and the other built-in never-include globs) run first and always block regardless of allow list. Default is `[]`.

```json
{
  "guard": {
    "allowPatterns": ["test/fixtures/**", "docs/**", "examples/**"]
  }
}
```

**Output:** `{ result: GuardResult, safeFiles: SelectedFile[] }`

---

### Step 5.5: Content Transformer

**Input:** Filtered `ContextResult` from Step 5 (Guard-passed files only)

**Purpose:** Transforms file content into the most token-efficient representation while preserving semantic meaning. Runs _after_ Guard (which needs raw content to scan for secrets) and _before_ the Summarisation Ladder (which operates on transformed content for accurate token counting).

**Interfaces:** `ContentTransformer` and `ContentTransformerPipeline` live in `shared/src/core/interfaces/`; `TransformContext`, `TransformResult`, and `TransformMetadata` live in `shared/src/core/types/transform-types.ts` (ADR-010 applies to paths and units):

```typescript
interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}

interface ContentTransformerPipeline {
  transform(files: SelectedFile[], context: TransformContext): TransformResult;
}

interface TransformContext {
  directTargetPaths: RelativePath[];
  rawMode: boolean;
}

interface TransformResult {
  files: SelectedFile[];
  metadata: TransformMetadata[];
}

interface TransformMetadata {
  filePath: RelativePath;
  originalTokens: TokenCount;
  transformedTokens: TokenCount;
  transformersApplied: string[];
}
```

Full interface definition: [Project Plan §8.5](project-plan.md).

**Shipped transformers:** Registered in `create-pipeline-deps.ts` (`transformers` array). `ContentTransformerPipeline` (`shared/src/pipeline/content-transformer-pipeline.ts`) partitions classes into **format-specific** (non-empty `fileExtensions`) vs **global pass** (empty `fileExtensions`). For each file, in order: **(1)** at most **one** format-specific transformer — the **first** in the registration list whose `fileExtensions` match the path; **(2)** then **every** global-pass transformer, in registration order. Direct targets skip step (1) but still run step (2) unless `#raw` (see [Transformer bypass policy](#transformer-bypass-policy-lossless-escapes)).

**Global pass** (`fileExtensions` length `0` — same order as in `create-pipeline-deps.ts`):

| Transformer                  | Role                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `LicenseHeaderStripper`      | Strip common license headers                                |
| `Base64InlineDataStripper`   | Replace large base64 payloads with placeholders             |
| `LongStringLiteralTruncator` | Truncate very long string literals                          |
| `DocstringTrimmer`           | Shorten docstrings / comment blocks where safe              |
| `ImportDeduplicator`         | Cross-file deduplication of identical import lines          |
| `WhitespaceNormalizer`       | Collapse blank lines, normalize indent, trim trailing space |
| `MinifiedCodeSkipper`        | Skip minified / dist-style paths (logic inside class)       |
| `AutoGeneratedSkipper`       | Skip files with auto-generated headers                      |
| `EnvExampleRedactor`         | Redact sensitive-looking values in env-example style files  |
| `SchemaFileCompactor`        | Compact large schema / OpenAPI-style JSON                   |

**Format-specific** (first registration match wins; extensions from each class in `shared/src/pipeline/`):

| Order | Transformer                 | Path match                                                                                                                                                       |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `TestStructureExtractor`    | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.go`, `.rs`, `.java`, `.rb`, `.php`, `.swift`, `.kt`, `.dart` — **and** path contains `.test.` or `.spec.` |
| 2     | `CommentStripper`           | `.ts`, `.js`, `.go`, `.java`, `.rs`, `.c`, `.cpp`                                                                                                                |
| 3     | `JsonCompactor`             | `.json`                                                                                                                                                          |
| 4     | `LockFileSkipper`           | `.lock`                                                                                                                                                          |
| 5     | `HtmlToMarkdownTransformer` | `.html`, `.htm`                                                                                                                                                  |
| 6     | `YamlCompactor`             | `.yaml`, `.yml`                                                                                                                                                  |
| 7     | `SvgDescriber`              | `.svg`                                                                                                                                                           |
| 8     | `CssVariableSummarizer`     | `.css`, `.scss`                                                                                                                                                  |
| 9     | `TypeDeclarationCompactor`  | `.d.ts`                                                                                                                                                          |

`.md` files use **MarkdownProvider** (LanguageProvider) for L1/L2/L3 in the summarisation ladder; there is no Markdown-specific entry in the format-specific transformer table above.

**Transformer Bypass Policy (Lossless Escapes):**
If a file is the _direct target_ of the user's intent, the model needs to see its exact syntax to output valid code. Lossy transformers (like `HtmlToMarkdownTransformer` or `JsonCompactor`) must be bypassed.

A file is considered a direct target and bypasses all format-specific transformers if:

1. It is explicitly `@`-mentioned in the user's prompt (supplied via editor MCP parameters)
2. Its `HeuristicSelector` score is > 0.90 (meaning it is highly relevant context)
3. The user adds `#raw` to their prompt (bypasses all transformers for all files)
   _With `#raw`, the pipeline passes content through unchanged. Without `#raw`, global-pass transformers (empty `fileExtensions`) still run on direct targets; format-specific transformers are skipped for direct targets._

**Execution order:** See the global-pass vs format-specific rules above; authoritative logic is `ContentTransformerPipeline.transform`. See [Project Plan §8.5](project-plan.md) for interface types.

**Config:**

```json
{
  "contentTransformers": {
    "enabled": true,
    "stripComments": true,
    "normalizeWhitespace": true,
    "htmlToMarkdown": true,
    "compactJson": true,
    "skipMinified": true,
    "skipLockFiles": true,
    "skipAutoGenerated": true
  }
}
```

All transformer flags default to `true`. Set `contentTransformers.enabled: false` to bypass the entire step (raw content passes through unchanged).

**Metadata:** Per-file transform rows live on `TransformResult.metadata` (`TransformMetadata[]` — see interfaces above). `aic_inspect` includes them on the pipeline trace as `transforms` (`shared/src/pipeline/inspect-runner.ts`). `CompilationMeta` carries aggregate **`transformTokensSaved`** only, not per-file transform arrays. `aic_last` does not expose transform metadata.

---

### Step 6: Summarisation Ladder

**Trigger:** `totalTokens > budget`

**Tiers applied in order until context fits:**

| Tier                  | Content Included                                | Typical Compression |
| --------------------- | ----------------------------------------------- | ------------------- |
| L0: Full              | Complete file contents                          | 1× (no compression) |
| L1: Signatures + Docs | Function/class signatures + docstrings/comments | ~3–5×               |
| L2: Signatures Only   | Function/class signatures, no bodies            | ~8–12×              |
| L3: Names Only        | File paths + exported symbol names              | ~20–50×             |

**Algorithm:**

1. Sort files by relevance score (ascending — least relevant compressed first). **Tie-breaking:** when two files share the same score, the file with more `estimatedTokens` is compressed first (larger files yield more savings); if tokens also tie, alphabetical path order (ascending) is the final deterministic tiebreaker
2. Compress lowest-scoring file to next tier
3. Recalculate total tokens
4. Repeat until fits or all files at L3
5. If still over budget at L3 → drop lowest-scoring files until fits; emit warning

**Language awareness:** L1 and L2 tiers depend on `LanguageProvider.extractSignaturesWithDocs()` and `extractSignaturesOnly()`. For files without a registered provider, L1 is skipped (falls through to L2), and L2 uses best-effort regex extraction.

**Output:** `SelectedFile[]` — an array of new `SelectedFile` objects with updated `tier` fields; the input array from the guard → transformer → ladder chain is never mutated

`aic_compile_spec` does not execute this Step 6 path on repo files. When that tool uses `SummarisationLadder`, it does so on synthetic `SelectedFile` rows for initial `verbatim` and `signature-path` wire usages under capped batch budgets in `SpecificationCompilerImpl`, before `runBudgetLoop` — see [§4c — `aic_compile_spec`](#aic_compile_spec-mcp-tool).

---

### Language support

AIC uses a pluggable **`LanguageProvider`** interface for all language-specific operations in Steps 4 and 6. See the [Project Plan §8.1](project-plan.md) for the full interface definition.

**The shipped build registers these `LanguageProvider` implementations** (`create-pipeline-deps.ts`), in order: `TypeScriptProvider`, `MarkdownProvider`, optional `additionalProviders` from the composition root (defaults to none in `mcp/src/server.ts` — tree-sitter based providers are bundled in `@jatbas/aic-core` but not passed unless extended), `GenericImportProvider`, `GenericProvider`.

| Provider                | Role                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| `TypeScriptProvider`    | `.ts` / `.tsx` / `.js` / `.jsx` — full import graph, L1/L2/L3 via TypeScript API |
| `MarkdownProvider`      | `.md` — import parsing + ladder tiers for Markdown                               |
| `GenericImportProvider` | Best-effort import line detection for other languages                            |
| `GenericProvider`       | Extension-based fallback for L0 and coarse L2/L3                                 |

**TypeScript / JavaScript detail:**

| Capability         | Implementation                                          |
| ------------------ | ------------------------------------------------------- |
| **Languages**      | TypeScript (`.ts`, `.tsx`), JavaScript (`.js`, `.jsx`)  |
| **Import parsing** | Regex-based extraction of `import`/`require` statements |
| **L1 extraction**  | TypeScript Compiler API → signatures + JSDoc            |
| **L2 extraction**  | AST walk, signatures only                               |
| **L3 extraction**  | Exported symbol names + kinds                           |

**Fallback for all other languages:**

| Capability             | Fallback                                                         |
| ---------------------- | ---------------------------------------------------------------- |
| Import parsing         | Skipped (0 score for import proximity)                           |
| L0 (Full)              | ✅ Works                                                         |
| L1 (Signatures + Docs) | Skipped → falls to L2                                            |
| L2 (Signatures Only)   | Best-effort regex (`function`, `class`, `def`, `func`, `pub fn`) |
| L3 (Names Only)        | File path + regex-extracted names                                |

Adding new language support later requires only implementing the `LanguageProvider` interface and registering it — zero core pipeline changes.

---

### Step 7: Constraint Injector

**Input:** Merged RulePack constraints + config constraints

**Deduplication:** Exact string match → keep first occurrence; first occurrence wins.

**Example `## Constraints` section (inside the compiled prompt):**

Rule-pack and config constraints are opaque strings; authors often ask for a specific response shape. This is illustrative only — it is not a built-in AIC instruction.

```
## Constraints
- Output unified diff format only
- Do not modify files outside src/
- Preserve existing public API signatures
- Include inline comments for non-obvious changes
```

**Edge cases:**

- Zero constraints (no rule packs or config define any) → `## Constraints` block is omitted from the prompt entirely; no empty section is emitted
- All constraints are duplicates after deduplication → same as zero-constraint case; block omitted
- Constraint list exceeds 20 items → emit all (no truncation); this is a content decision for rule pack authors

---

### Step 8: Prompt Assembler

**Template:**

> The fenced block below shows **sections inside the compiled prompt string** — the `##` / `###` lines are not headings in this document. Order matches `shared/src/pipeline/prompt-assembler.ts`. Optional blocks are omitted when their inputs are empty. **Two constraint sections are deliberate:** `## Constraints (key)` surfaces up to three bullets before context; the final `## Constraints` lists the full merged set after context (ordering mitigates prompt-injection from file bodies — see `security.md`).

```
## Task
{intent}

## Task Classification
Type: {taskClass} (confidence: {confidence})

## Specification
{optional — per selected spec / rules / skills files}

## Session context
{optional — agentic session summary}

## Project structure
{optional — structural map metadata}

## Constraints (key)
{when constraints non-empty — first three constraints as bullets}

## Context
{for each file in context}
### {filePath} [Tier: {tier}]
{content at appropriate tier, or “Previously shown in step N” placeholder}
{end for}

## Constraints
{when constraints non-empty — every constraint as a bullet, in order}
```

AIC does **not** append a machine-owned “output format” appendix (unified diff, JSON-only reply, and similar directive blocks). Editors, skills, and rule-pack constraints own how the user asks the model to respond.

**Output:** The compiled input (a single string, the final prompt)

---

### Step 9: Executor (deferred design)

This section describes a future direct-execution path that is not part of the current release. In that future mode, AIC would send compiled input to the configured model endpoint via the appropriate provider SDK.

**Supported providers (shipped):**

| Provider  | API key required          | Notes                                                                                                                                            |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenAI    | Yes — `OPENAI_API_KEY`    | GPT-4o, GPT-o3, and other OpenAI models                                                                                                          |
| Anthropic | Yes — `ANTHROPIC_API_KEY` | Claude Sonnet, Claude Opus, and other Anthropic models                                                                                           |
| Ollama    | **No**                    | Free, runs locally; install Ollama and pull a model (`ollama pull llama3` is one valid pull command). Default endpoint: `http://localhost:11434` |

`aic_compile` requires no provider at all — it outputs a plain-text compiled prompt.

**Behaviour:**

- `aic_compile` → stops after Step 8 (Assembler). The MCP JSON field `compiledPrompt` is the Step 8 assembler string **plus** handler-applied prefix/suffix (install-scope warnings, guard exclusion instruction when applicable, reinforcement — see [MCP response shape (pipeline success)](#4-core-pipeline--implementation-detail)); it is not byte-identical to the file below. No provider configuration required.
- The **pipeline** compiled string (without those MCP-only wrappers) is written to `.aic/last-compiled-prompt.txt` for local hook use (`mcp/src/handlers/compile-handler.ts`). The `aic_last` tool exposes summary fields and optional **`selection`**, not the raw prompt text.

**Retry policy:**

| Condition               | Retryable | Behaviour                                                            |
| ----------------------- | --------- | -------------------------------------------------------------------- |
| HTTP 429 (rate limit)   | Yes       | Wait for `Retry-After` header value (or 5s default), then retry once |
| HTTP 500, 502, 503, 504 | Yes       | Wait 2s, then retry once                                             |
| Request timeout         | Yes       | Wait 2s, then retry once with same timeout                           |
| HTTP 400 (bad request)  | No        | Fail immediately — often a prompt or config issue                    |
| HTTP 401 / 403 (auth)   | No        | Fail immediately — check API key                                     |
| HTTP 404 (not found)    | No        | Fail immediately — check model name and endpoint                     |
| All other 4xx           | No        | Fail immediately                                                     |

Maximum retries: **1**. No exponential backoff in the shipped implementation. A later release may add backoff. Retry attempt is logged at `info` level; final failure at `error` level.

---

### Model Context Window Guard

The **total** context budget from Step 3 (`contextBudget.maxTokens`, rule-pack `budgetOverride`, and optional per-task-class overrides) caps tokens before pipeline overhead is subtracted. **Auto mode** (`maxTokens` **0**): Step 3 allocates **headroom** from **`effectiveWindow`** (config `contextWindow`, else session **`contextWindow`**, else **128_000** default) minus reserved response, **`conversationTokens`**, and template overhead — see Step 3 bullets above. **Manual mode** (positive `maxTokens`): Step 3 applies **`min(base, headroom)`** when session budget context supplies **`conversationTokens`** and/or a window hint; otherwise the positive **base** is returned unchanged when no window hint exists. **codeBudget** for file selection and the main ladder is **totalBudget − overhead** ([Project Plan §2.7](project-plan.md#27-agentic-workflow-support)).

Illustrative decomposition (literals **`4_000`** / **`500`** / default **`128_000`** match `budget-allocator.ts`; **`effectiveWindow`** may differ when config or session supplies a context window):

```
effectiveWindow = configuredWindow ?? sessionContext.contextWindow ?? 128_000
  └─ reserved slice (fixed)                     4,000
  └─ template overhead (fixed)                    500
  └─ conversation already counted               = conversationTokens (wire or derived; 0 if omitted)
  └─ headroom                                   = max(0, effectiveWindow − 4_000 − 500 − conversationTokens)
      ├─ auto (base == 0): totalBudget          = headroom
      └─ manual (base > 0): totalBudget         = min(base, headroom) when clamp path applies; else base
```

Shipped `aic.config.json` validation (`shared/src/config/load-config-from-file.ts`) includes `contextBudget`, `contextSelector`, `model.id`, `enabled`, `guard.allowPatterns`, `devMode`, and `skipCompileGate` — Step 3 reads optional **`contextWindow`** from config and optional **`contextWindow`** on **`SessionBudgetContext`** from the pipeline request (model id → `resolveModelDerivedContextWindow`); it does **not** read **`windowRatio`** or utilization auto-tuning from config; those remain roadmap.

`BudgetExceededError` exists in `shared/src/core/errors/budget-exceeded-error.ts` but is not thrown from the shipped compilation pipeline (no `new BudgetExceededError` in compilation paths).

---

### Step 10: Telemetry Logger

When the project is not disabled (`enabled !== false`), after **`runner.run` succeeds**, the `aic_compile` handler calls **writeCompilationTelemetry()** (`shared/src/core/write-compilation-telemetry.ts`) with the compilation meta, request, and `compilationId`. Early returns (`enabled: false`, timeout, or pipeline error before success) skip the write. No pipeline step invokes telemetry directly. The function builds a `TelemetryEvent` and writes it through `TelemetryStore` (`SqliteTelemetryStore` → `telemetry_events` in the global database). Failures are logged to stderr and do not fail the compile response.

**`telemetry_events` columns** (SQLite — `shared/src/storage/migrations/001-consolidated-schema.ts`; insert in `shared/src/storage/sqlite-telemetry-store.ts` — written on each successful compile when the project is enabled):

| Column (SQLite)     | Type | Source / notes                                                                        |
| ------------------- | ---- | ------------------------------------------------------------------------------------- |
| `id`                | TEXT | UUIDv7 — new row id for this telemetry event (`TelemetryEvent.id`)                    |
| `compilation_id`    | TEXT | FK → `compilation_log.id` — same compile as the summary row                           |
| `repo_id`           | TEXT | SHA-256 of normalised project root (`TelemetryEvent.repoId`)                          |
| `guard_findings`    | INT  | Count of Guard findings (`guardFindingsCount` from `CompilationMeta.guard`)           |
| `guard_blocks`      | INT  | Count of blocked files (`guardBlockedCount`)                                          |
| `transform_savings` | INT  | Token savings from transforms (`transformTokensSaved` on `CompilationMeta`)           |
| `tiers_json`        | TEXT | JSON object — tier counts from `summarisationTiers` (same shape as `CompilationMeta`) |
| `created_at`        | TEXT | ISO 8601 UTC ms — same instant as `TelemetryEvent.timestamp`                          |

**Not in `telemetry_events`:** `task_class`, `tokens_raw`, `tokens_compiled`, `files_selected`, `files_total`, `cache_hit`, `duration_ms`, `model_id` / editor fields live on **`compilation_log`** for the same `compilation_id` (see schema in the same migration file). `token_reduction_pct` is derived when presenting status/inspect — not stored as a column on either table. Per-compile **selection trace** JSON lives on **`compilation_log.selection_trace_json`** (added in `shared/src/storage/migrations/003-compilation-selection-trace.ts` — [Selection trace (persistence and tools)](#selection-trace-persistence-and-tools)).

---

## 4b. Rules & Hooks Analyzer — Deferred Design Note

This analyzer is not implemented in the shipped MCP package. The section below is a deferred design note for a future `aic://rules-analysis` resource.

**Trigger:** Runs once per unique combination of project root + rule file mtimes. Results are cached until a watched rule file changes — it does not re-scan on every compilation unless files have changed.

**Watched sources (shipped):**

| Source         | Path                                | What is checked                                                                     |
| -------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| `.cursorrules` | `{projectRoot}/.cursorrules`        | Redundant lines (exact/near-duplicate), conflicting instructions, token-heavy prose |
| Cursor rules   | `{projectRoot}/.cursor/rules/*.mdc` | Conflicting `globs` fields, always-firing rules (no glob = applies to all files)    |
| Claude Code    | `{projectRoot}/.claude/CLAUDE.md`   | Duplicate constraints already covered by AIC rule packs                             |

**Planned `aic://rules-analysis` resource — response format:**

```json
{
  "analyzedAt": "2026-02-22T20:00:00Z",
  "totalErrors": 1,
  "totalWarnings": 2,
  "totalInfos": 1,
  "findings": [
    {
      "severity": "error",
      "source": ".cursorrules",
      "line": 14,
      "message": "Contradicting instructions: line 14 says 'always use TypeScript' but line 31 says 'prefer JavaScript for scripts'",
      "suggestion": "Pick one and remove the other, or scope each with a file-glob rule."
    },
    {
      "severity": "warn",
      "source": ".cursor/rules/team.mdc",
      "line": null,
      "message": "Rule has no 'globs' field — fires on every file in every request",
      "suggestion": "Add a 'globs' field to scope this rule to relevant files."
    },
    {
      "severity": "info",
      "source": ".cursorrules",
      "line": 7,
      "message": "'Output unified diff format only' duplicates the same line in your project `aic-rules/refactor.json` constraints",
      "suggestion": "Keep the constraint in one place only so the compiled prompt does not repeat it."
    }
  ]
}
```

**Exit codes:** Analyzer failures (file read error, parse error) never fail a compilation. Errors are logged at `warn` level and `findings` is set to `[]` in the resource.

Full spec: [Project Plan §2.4](project-plan.md).

---

## 4c. Init, Inspect, and Status

### Bootstrap (project setup)

**MCP server — workspace roots:** When the client advertises roots support and lists workspace roots (Cursor on workspace connect), `mcp/src/server.ts` calls `installTriggerRule` and `runEditorBootstrapIfNeeded` for each returned root. That path does **not** invoke `ensureProjectInit`, so it does not create `aic.config.json` or run the full `.aic/` + ignore-file scaffold by itself.

**MCP server — first `aic_compile`:** On the first compile for a normalised project key, `mcp/src/handlers/compile-handler.ts` calls `ensureProjectInit` when `aic.config.json` is absent (`mcp/src/init-project.ts`): writes default `aic.config.json`, creates `.aic/` with mode `0700` via `ensureAicDir`, appends missing lines from `shared/src/storage/aic-ignore-entries.json` to `.gitignore`, `.eslintignore`, and `.prettierignore` (creates each file when it is absent), and calls `ensurePrettierignore` / `ensureEslintignore`. The same first-run block also calls `installTriggerRule` and `runEditorBootstrapIfNeeded`.

Editor hook installation (`runEditorBootstrapIfNeeded` in `mcp/src/editor-integration-dispatch.ts`) uses **auto** heuristics (`.cursor` / `CURSOR_PROJECT_DIR` for Cursor; `.claude` / `CLAUDE_PROJECT_DIR` for Claude Code) unless overridden. Override with `--aic-bootstrap-integration=<mode>` on the MCP process or `AIC_BOOTSTRAP_INTEGRATION` in the environment; the CLI flag wins over the env var, and both win over auto detection. Modes: `auto`, `none` (skip installers), `cursor`, `claude-code`, `cursor-claude-code` (run each installer when its script resolves, without requiring the corresponding detection gates).

**CLI `init` subcommand** (`mcp/src/server.ts` when argv is `init`; `runInit` in `mcp/src/init-project.ts`):

- If `aic.config.json` already exists → `ConfigError`, exit code 1 (stderr message); config is never overwritten — edit the file directly to change settings.
- On success → exit code 0; prints: `Created aic.config.json. Edit to customise, or run a compile to use defaults.`
- Other failures → exit code 2
- **Integration artifact reference** (`documentation/technical/`):
  - [Cursor integration layer](technical/cursor-integration-layer.md)
  - [Claude Code integration layer](technical/claude-code-integration-layer.md)
  - [Integrations shared modules reference](technical/integrations-shared-modules.md)
  - [AIC JSONL caches under `.aic/`](technical/aic-jsonl-caches.md)
  - [Session start lock and session context marker](technical/session-start-lock-and-marker.md)
  - [MCP server and shared CJS boundary](technical/mcp-and-shared-cjs-boundary.md)

---

### `aic_inspect` (MCP tool)

Runs Steps 1–8 and returns a JSON decision trace without executing the model call and without writing to the compilation cache. Designed for debugging context selection. The `aic_inspect` MCP tool invokes `InspectRunner` from `shared/` (see [Project Plan §8.6](project-plan.md) for the `InspectRunner` interface and side-effect constraints).

**Shows:** Task classification, rule packs applied, context budget, selected files (with score, tokens, tier, and provider — metadata only), guard status, token summary (raw → selected → after guard → after ladder → prompt total → reduction %), and constraints.

**MCP response shape:** `{ trace: … }` serialises `selectedFiles` without `resolvedContent` (full file text is an internal assembly artifact only; see `mcp/src/handlers/inspect-handler.ts`).

- Exit code: always `0`
- Does **not** write to `cache_metadata`; `repomap_cache` is still read/updated normally
- Does **not** call the model

Full spec with annotated output example: [Project Plan §14](project-plan.md).

---

### Diagnostic stdout layout (CLI and prompt commands)

The five read-only diagnostic CLIs (`status`, `last`, `chat-summary`, `quality`, `projects`) and the matching **show aic …** prompt commands print human tables built in `mcp/src/format-diagnostic-output.ts`. Each table shares the same outer shape from **`renderStandardReport`**: a **title** line (`Title = …`), a full-width **separator** line (`SEP` constant in that file), a **hero** paragraph (always non-empty for shipped formatters), another separator, and **body** rows; when the formatter emits them, a closing separator and **footnote** (single- or multi-line string) come next. The `status`, `last`, `chat-summary`, and `quality` tables always emit the closing separator and footnote; the `projects` table (both empty and roster forms) omits both and ends on its last body row. In **`formatStatusTable`**, **`padRow`** labels use width **32** (longest shipped label is **`Installation (global MCP server)`**). In **`formatLastTable`**, **`formatChatSummaryTable`**, **`formatQualityReportLines`**, and the empty **`formatProjectsTable`** body, **`padRow`** labels use width **30**; the non-empty **projects** roster uses fixed column widths with at least two ASCII spaces between columns and **`truncatePath`** on the path cell. Shipped stdout adds **Session time** on status (capped aggregate active time from `session_state`), **Compiled in** on last (`compilation_log.duration_ms`), and **Elapsed** on chat-summary (active conversation start from `session_state.created_at` to the injected clock). Structured JSON from `buildStatusPayload`, `buildLastPayload`, and `buildChatSummaryToolPayload` includes the matching numeric fields (`sessionTimeMs`, `activeConversationId`, `activeConversationCreatedAt`, `lastCompilation.durationMs`, `elapsedMs`); stdout shows only the humanised rows above.

### `aic_status` (MCP tool)

Returns project-level summary as JSON. Surfaced to the user via the "show aic status" prompt command.

**Fields returned:** `compilationsTotal`, `compilationsToday`, `cacheHitRatePct`, `avgReductionPct`, `totalTokensRaw`, `totalTokensCompiled`, `totalTokensSaved`, `budgetMaxTokens`, `budgetUtilizationPct`, `telemetryDisabled`, `guardByType`, `topTaskClasses`, `lastCompilation`, `installationOk`, `installationNotes`, `sessionTimeMs`, `activeConversationId`, `activeConversationCreatedAt`, `timeRangeDays` (always present: `null` when no rolling window is requested; otherwise an integer from 1 through `STATUS_TIME_RANGE_DAYS_MAX`, currently 3660). When `timeRangeDays` is set, aggregates include only `compilation_log` rows with `created_at >=` the lower bound computed as `Clock.addMinutes(-timeRangeDays * 24 * 60)` from the injected clock at request time (inclusive lower bound in SQL). `compilationsToday` is the count of `compilation_log` rows whose UTC calendar day matches the date portion of the injected `Clock.now()` (same predicate as `SqliteStatusStore`), and the status table label for that field is `Context builds (today, UTC)`.

The human-facing status table follows [Diagnostic stdout layout](#diagnostic-stdout-layout-cli-and-prompt-commands) above. It does not show **Project**. The **hero** cites **context builds (total)**, **cumulative raw → sent tokens** (compact notation with optional ratio), **cache hit rate**, and **context precision (weighted)** from the same aggregate fields as the metric rows (`compilationsTotal`, `totalTokensRaw`, `totalTokensCompiled`, `cacheHitRatePct`, `avgReductionPct`); it does not use total indexed file counts in the hero. When those aggregates are all zero, the hero uses the idle copy **`No compilation aggregates yet for this project.`** **Notes** appears only when `installationOk` is false and `installationNotes` is non-empty; when a window is active the table includes a **Time range** row (`Last 1 day` or `Last N days`). The **Cumulative raw → sent tokens** body row uses the same compact billions/millions notation with a **ratio** when `compiled > 0`; the **Guard scans** row uses **`Guard scans (Nd)`** when a status time window is active and **`Guard scans (lifetime)`** otherwise, matching the guard aggregate window; **Session time** prints humanised `sessionTimeMs` (per-session active window from `session_state`, each contribution capped before sum — see `SqliteStatusStore.getProjectSessionSummary`); **Context window used (last run)** labels the per-last-row percentage (same source as `budgetUtilizationPct` in JSON — see `formatStatusTable` / `buildStatusPayload` in `mcp/src/format-diagnostic-output.ts` and `mcp/src/diagnostic-payloads.ts`). The **Installation (global MCP server)** row reflects the latest global MCP server session (`installationOk` / `installationNotes`), not a per-project column on `server_sessions`.

**Data source:** Reads from `compilation_log`, `session_state`, `cache_metadata`, `guard_findings`, and `telemetry_events` tables in `aic.sqlite` (see [Project Plan §20](project-plan.md) for the full table definitions). Does not run a compilation.

### `aic_quality_report` (MCP tool)

Returns rolling-window compile transparency metrics as JSON (MCP `text` content is a JSON string). Surfaced via the "show aic quality" prompt command and the `quality` CLI subcommand (`mcp/src/cli-diagnostics.ts`).

**Wire arguments:** `QualityReportRequestSchema` in `mcp/src/schemas/quality-report-request.schema.ts` — optional `windowDays` integer **1..365** (Zod rejects **0** and values above **365**). When omitted, the schema supplies **7** via `.default(7)` before `mcp/src/server.ts` resolves the value with `toQualityReportWindowDays`. Arguments are validated with `z.object(QualityReportRequestSchema).parse` in the tool handler; invalid wire shapes throw before the payload builder runs and are surfaced as an MCP internal error after a stderr log line (this tool does not return a structured `{ code: "validation-error" }` body like `aic_compile_spec`).

**Return shape:** `buildQualityReportPayload` in `mcp/src/diagnostic-payloads.ts` returns **`windowDays`**, **`compilations`** (row count in the window), **`medianTokenReduction`**, **`medianSelectionRatio`**, **`medianBudgetUtilisation`**, **`cacheHitRate`**, **`tierDistribution`** (`l0`..`l3` fractions), **`byTaskClass`** (per task-class object with the same median fields plus counts), **`classifierConfidence`** (`{ available: false }` when no samples, else `{ available: true, mean }`), and **`seriesDaily`** (per UTC calendar day with medians and cache hit rate).

**Data source:** Reads only from **`quality_snapshots`** for the scoped `project_id` with `created_at >=` a lower bound computed as `Clock.addMinutes(-windowDays * 24 * 60)` from the injected clock at request time. Does not invoke the pipeline.

**Persistence (separate from this tool):** After a successful compile, `tryRecordQualitySnapshot` in `mcp/src/handlers/compile-handler.ts` inserts one row per compilation into **`quality_snapshots`** via `SqliteQualitySnapshotStore.record` — failures log **Quality snapshot write failed** to stderr and do not fail the compile. That path is silent per-compile telemetry for rolling transparency; it does not write anonymous **`telemetry_events`**.

**Contrast with `aic_status`:** **`aic_status`** aggregates **`compilation_log`**, cache metadata, guards, and optional telemetry for operational health. **`aic_quality_report`** summarises the **`quality_snapshots`** time series for the requested window — medians, tier mix, task-class strata, classifier confidence summary, and daily series — without re-deriving the full status dashboard. Those transparency metrics document how AIC compiled and compressed within the window; they are **not** evidence that end-user outcomes improved, and correlating them with future **`feedback_events`** remains out of scope here.

**Human table (CLI / “show aic quality”):** Uses the same [Diagnostic stdout layout](#diagnostic-stdout-layout-cli-and-prompt-commands) as the other diagnostic commands. When **`compilations`** is zero, the hero carries the idle sentence already used for the empty window, and the multi-line **`QUALITY_FOOTNOTE`** constant still appears after the closing separator (the populated layout inserts an extra **`SEP`** body row after **Compilations** before tier and task-class blocks). The **`quality`** CLI and the MCP tool both use **`windowDays` 7** when the caller omits the window (`mcp/src/cli-diagnostics.ts`, `QualityReportRequestSchema` in `mcp/src/schemas/quality-report-request.schema.ts`); the CLI also accepts **`Nd`** window suffixes and **`--window`** overrides as documented in [installation.md — CLI Standalone Usage](installation.md#cli-standalone-usage).

### `aic_last` (MCP tool)

Returns the most recent compilation as JSON. Surfaced to the user via the "show aic last" prompt command. Payload from `buildLastPayload` in `mcp/src/diagnostic-payloads.ts`.

| Field              | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `compilationCount` | Total compilations for the scoped project (same basis as status store summary).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `lastCompilation`  | Snapshot of the latest row: `intent`, `filesSelected`, `filesTotal`, `tokensCompiled`, `tokenReductionPct`, `created_at`, `editorId`, `modelId`, `allocatedTotalBudget`, `durationMs` (from `compilation_log.duration_ms`, forwarded by `snapshotToConversationLast`), plus `cacheHit` (boolean from `compilation_log.cache_hit`), `guardFindingCount` and `guardBlockCount` (from joined `telemetry_events` for that compilation when present — each nullable when the join is missing or the column is null), and `guardScannedFileCount` (equals **`filesSelected`** on the same object, populated in `buildLastPayload` as an explicit scan-count field for the **Guard (this run)** row — same integer twice, not a separate query). This is **not** a full `CompilationMeta` object. |
| `promptSummary`    | `tokenCount` from the last row’s `tokensCompiled`; `guardPassed` is **`null`** in the shipped code (reserved for future use).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `selection`        | Parsed `SelectionTrace` from `compilation_log.selection_trace_json`, or **`null`** when the column is null, JSON is invalid, or `SelectionTraceSchema` rejects the payload (first parse failure logs once to stderr).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

The diagnostic CLI `last` subcommand prints the same formatted table as the prompt command, including **Compiled in** (humanised `lastCompilation.durationMs`), **Cache** and, when a guard label is produced, **Guard (this run)** (`formatLastTable` in `mcp/src/format-diagnostic-output.ts`). The row is **omitted** when `guardFindingCount` is null or not a finite number; when `guardFindingCount` is `0` the value is **`passed`**. When `guardFindingCount` is positive, the value disambiguates **findings** vs **files blocked** (the latter matches `guardBlockCount` / `guard_blocks`, not a vague “blocked” count): with a usable scanned file count ( **`guardScannedFileCount` ?? `filesSelected` ?? null** resolved to a finite number `≥ 0` ) the formatter uses a long form `N finding(s) across M file(s) (K file(s) blocked)`; otherwise a short form `N finding(s) (K file(s) blocked)` without the **across** clause. The blocked clause always uses the words _file_ / _files_ — never a bare _blocked_ tail.

**Top files** / **Excluded by** digest rows appear when parsed **`selection`** is non-null. The output follows [Diagnostic stdout layout](#diagnostic-stdout-layout-cli-and-prompt-commands); the **hero** is always non-empty (workspace idle copy when `lastCompilation` is null, cache-served copy when `cacheHit` is true with zero files selected and a positive budget ceiling, forwarded-file sentence when `filesSelected` > 0, otherwise no-files / budget messaging). Use MCP JSON for the full **`selection`** object (per-file signals, full excluded list) and for fields omitted from the human table.

### `aic_chat_summary` (MCP tool)

Returns per-conversation compilation aggregates as JSON (MCP `text` content is a JSON string). Surfaced via the "show aic chat summary" prompt command. Payload from `buildChatSummaryToolPayload` in `mcp/src/diagnostic-payloads.ts` when a `conversationId` argument is present; the **`chat-summary` CLI** without a conversation id uses `SqliteStatusStore.getSummary` plus `buildProjectScopedChatSummaryCliRow` to print the project-scoped table (`mcp/src/cli-diagnostics.ts`).

**Fields returned (conversation mode):** Same shape as `ConversationSummary` in `shared/src/core/types/status-types.ts`, including `elapsedMs` when `session_state.created_at` exists for the conversation id (otherwise `null`).

**Human table (CLI / prompt command):** Follows [Diagnostic stdout layout](#diagnostic-stdout-layout-cli-and-prompt-commands). The table always includes **Elapsed** after **Last compilation**; the value humanises `elapsedMs` when present, otherwise **`—`** (`formatChatSummaryTable` in `mcp/src/format-diagnostic-output.ts`).

### `aic_compile_spec` (MCP tool)

Returns structured specification output as MCP `text` JSON (`{ compiledSpec, meta }` plus matching `structuredContent`). Editors and agents call it when they need a token-bounded briefing built from wire `spec` input.

`createCompileSpecHandler` in `mcp/src/handlers/compile-spec-handler.ts` Zod-validates the request (`compileSpecRequestParser` wrapping `CompileSpecRequestSchema`). On a successful parse it calls `recordToolInvocation` for `tool_invocation_log` before any cache lookup, so cache hits still produce a log row.

It resolves the tool budget as a `TokenCount`: wire `budget` when present, otherwise the summed wire `estimatedTokens` across `spec.types`, `spec.codeBlocks`, and `spec.prose`. It maps each wire type `path` with `toRelativePath`, builds core `SpecificationInput`, hashes `buildSpecCompileCachePreimage` from `shared/src/pipeline/build-spec-compile-cache-preimage.ts` with `deps.stringHasher` (SHA-256 via `sha256Adapter` in `mcp/src/server.ts`), and calls `deps.specCompileCacheStore.get`. On **hit**, it returns MCP `text` JSON plus matching `structuredContent` with the cached `{ compiledSpec, meta }` without calling `specificationCompiler.compile`. On **miss**, it awaits `deps.specificationCompiler.compile` wired to `SpecificationCompilerImpl` in `mcp/src/server.ts` (`shared/src/pipeline/specification-compiler.ts`) and persists the result through `specCompileCacheStore.set`.

Validation failures return `{ error: "Invalid aic_compile_spec request", code: "validation-error" }` and do not invoke the compiler, the cache, or `recordToolInvocation`.

**Cross-call cache.** The preimage concatenates a fixed prefix, `SPEC_COMPILE_CACHE_POLICY_REVISION` (`"1"` in `build-spec-compile-cache-preimage.ts`), the numeric budget, then multiset sections for `types`, `codeBlocks`, and `prose`: each section is the lexicographic join of per-row `JSON.stringify` lines, so wire row order inside a section does not affect the key. `SqliteSpecCompileCacheStore` (`shared/src/storage/sqlite-spec-compile-cache-store.ts`) reads and writes table `spec_compile_cache` from migration `shared/src/storage/migrations/004-spec-compile-cache.ts`, keyed by `(project_id, cache_key)` in the global `aic.sqlite` database. `get` returns a row only when `expires_at` is after the injected clock; corrupt `meta_json` yields `null` (treated as a miss). `set` uses `INSERT OR REPLACE` with `createdAt` from `Clock.now()` and `expiresAt` from `Clock.addMinutes(60)` in the handler. The store also defines `invalidate` and `purgeExpired`; the shipped MCP composition in `mcp/src/server.ts` does not call them for this store, so expired rows are skipped on read until the same key is written again or rows are removed out of band.

**Pipeline scope:** `aic_compile_spec` does not invoke `runPipelineSteps`. It does not run the main repo selection path (`HeuristicSelector`, intent-aware discovery, or Step 6 summarisation on repository `SelectedFile` rows from the RepoMap).

**Pre-budget passes (`SpecificationCompilerImpl.compile` in `shared/src/pipeline/specification-compiler.ts`):** before `runBudgetLoop`, the compiler runs `verbatimAdjustedSpecificationInput` when any type has initial tier `verbatim`, then `signaturePathAdjustedSpecificationInput` when any type has initial tier `signature-path`. Type rows whose initial tier from wire `usage` is `path-only` are omitted from both synthetic-row batches; they are still assembled and demoted inside `runBudgetLoop`.

For types whose wire `usage` maps to initial tier `verbatim` (`implements`, `calls-methods`, `constructs` in `SPEC_USAGE_TO_INITIAL_TIER`, `shared/src/core/types/specification-compilation.types.ts`), `verbatimAdjustedSpecificationInput` splits imports from each body with `splitLeadingImportsAndBody`, builds synthetic `SelectedFile` rows from bodies, runs `ContentTransformerPipeline.transform` with `TransformContext` `{ directTargetPaths: [], rawMode: false }`, then `SummarisationLadder.compress` with batch budget `computeVerbatimBatchBudget` — the lesser of twenty percent of the tool `budget` rounded down toward zero and the sum of verbatim refs' wire `estimatedTokens`. Rendered bodies merge back into those type refs.

For types whose wire `usage` maps to initial tier `signature-path` (`passes-through`), `signaturePathAdjustedSpecificationInput` builds synthetic rows with `buildSignaturePathSyntheticRows` (resolved content from `signatureTierBody`), runs the same `TransformContext` through `ContentTransformerPipeline.transform` and `SummarisationLadder.compress` under `computeSignaturePathBatchBudget` — the lesser of twenty percent of the tool `budget` rounded down toward zero and the summed token count of those synthetic bodies (via the injected `tokenCounter`, not wire `estimatedTokens`), then `applySignaturePathRenderedBodies` restores leading import lines per type.

Types whose wire `usage` maps to initial tier `path-only` (`names-only`) skip both passes; `runBudgetLoop` still assigns tiers and assembles output from `TIER_BODY` for every type.

Shared-import deduplication across verbatim-tier bodies, tier assignment for every type, iterative demotion toward `budget`, ordered removal of code and prose blocks, and the truncation banner remain inside `SpecificationCompilerImpl`. Demotion priority and tie-breaks are listed under [Project Plan section 2.7 — Agentic workflow support](project-plan.md#27-agentic-workflow-support).

Applying the full main-pipeline `ContentTransformerPipeline` / `SummarisationLadder` policy to `spec.codeBlocks`, `spec.prose`, and to demoted type bodies the same way `runPipelineSteps` treats repository files remains roadmap in [Project Plan section 2.7 — Agentic workflow support](project-plan.md#27-agentic-workflow-support). That section’s phasing table lists shipped **`spec_compile_cache`** for **`aic_compile_spec`** alongside other baseline agentic items. This subsection remains the operational contract for handler-level cache behaviour.

**`meta` on success:** `totalTokensRaw` is the sum of `estimatedTokens` across `spec.types`, `spec.codeBlocks`, and `spec.prose`. `totalTokensCompiled` is the token count of the final `compiledSpec` string. `reductionPct` and `transformTokensSaved` derive from raw versus compiled counts (`specification-compiler.ts`). `typeTiers` maps sorted composite keys `name + "\u0000" + path` to **final** inclusion tiers after the budget loop (not necessarily the initial tier implied by wire `usage` alone). When every type is `path-only`, all code and prose blocks are removed, and the assembly still exceeds budget, `compiledSpec` appends a fixed truncation banner (`WARN_TRUNCATION` in `specification-compiler.ts`).

---

## 4d. Additional implementation notes

### First-run UX (shipped surface)

`CompilationMeta` in `shared/src/core/types/compilation-types.ts` does not include `firstRun` or `firstRunMessage`. New users rely on `aic_last`, `aic_status`, and prompt commands to see compilation outcomes. A dedicated first-run payload remains a possible future enhancement.

---

### Model-derived budgets (shipped subset and roadmap)

> **Shipped today.** Default **`maxTokens` 0** turns on **auto headroom** in `BudgetAllocator` using **`effectiveWindow`** (config **`contextWindow`**, else session **`contextWindow`** from **`deriveSessionContext`**, else **`CONTEXT_WINDOW_DEFAULT`**) minus **`RESERVED_RESPONSE_DEFAULT`**, **`conversationTokens`**, and **`TEMPLATE_OVERHEAD_DEFAULT`** — see Step 3 and [Model Context Window Guard](#model-context-window-guard). **`runPipelineSteps`** subtracts **overhead** and passes **codeBudget** to selection and the main summarisation ladder; **`maxFiles` 0** enables `resolveAutoMaxFiles` (base from repo size in **[5, 40]**, scaled by **`SessionBudgetContext.contextWindow` when present else `CONTEXT_WINDOW_DEFAULT`**, ceiling **300**). Implemented in `budget-allocator.ts`, `run-pipeline-steps.ts`, `resolved-config.ts`, `load-config-from-file.ts`.

> **Roadmap:** Per-model formula-derived bases (`maxContextWindow × windowRatio`, floors/ceilings), Ollama `num_ctx` probing, utilization-based **auto-tuning** of caps, and automated `windowRatio` recommendations — described in [Project Plan §2.7](project-plan.md#27-agentic-workflow-support) — are not implemented beyond the shipped **`effectiveWindow`** + literals path above.

**Shipped utilization surface:** The `aic_status` tool exposes **`budgetMaxTokens`** from resolved config (when **`maxTokens` is `0`**, a **fixed** ceiling in `mcp/src/diagnostic-payloads.ts` without a **`conversationTokens`** term) and **`budgetUtilizationPct`** from the last **`compilation_log`** row’s **`tokensCompiled`** over that ceiling (see [§4c — `aic_status`](#aic_status-mcp-tool)); that pair is a **diagnostic** surface, not identical to each compile’s **`BudgetAllocator`** total when session clamping or non-default **`effectiveWindow`** applies.

**Budget feedback storage (read-only, not in Step 3):** `BudgetFeedbackSource` and `SqliteBudgetFeedbackReader` in `shared/src/storage/sqlite-budget-feedback-reader.ts` expose **`getRollingBudgetUtilisation`** over historical **`compilation_log`** rows for injected callers; **`BudgetAllocator`** does not call that interface during **`runPipelineSteps`**, and shipped MCP composition does not yet wire the reader into tools. Utilization-based **auto-tuning** remains deferred per [Project Plan — Non-goals](project-plan.md#non-goals-phase-0-baseline) (**Agentic session management**) and the [§2.7 budget roadmap](project-plan.md#budget-allocation-shipped-auto-budget-overhead-aware-pipeline-and-roadmap).

---

### Trigger Rule Robustness

The trigger rule installed during bootstrap (`.cursor/rules/AIC.mdc` on Cursor) instructs the editor's AI to call `aic_compile`. The trigger rule is suggestive — compliance varies with the model and editor. In Cursor, the integration layer (hooks) provides stronger enforcement via `preToolUse` gating unless the emergency bypass is active (`devMode` and `skipCompileGate` both true in `aic.config.json` — [Cursor integration layer](technical/cursor-integration-layer.md) §7.3). In editors without hook support, the trigger rule is the sole mechanism.

**Per-editor trigger formats (shipped):**

| Editor      | Trigger file            | Key attributes                                                                                                                                                                                                                                                                                 |
| ----------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cursor      | `.cursor/rules/AIC.mdc` | `alwaysApply: true`, no `globs` restriction — included in every prompt. Integration hooks provide stronger enforcement via `preToolUse` gate unless the emergency bypass is active (`devMode` + `skipCompileGate` — §7.3 in [Cursor integration layer](technical/cursor-integration-layer.md)) |
| Claude Code | `.claude/CLAUDE.md`     | Instruction appended to project-level system context                                                                                                                                                                                                                                           |
| Generic MCP | N/A                     | Relies on editor invoking registered MCP tools; no trigger rule needed                                                                                                                                                                                                                         |

**Trigger rule content pattern:**

```
Before responding to any user request, call the aic_compile MCP tool with the
user's intent as the argument. Use the returned compiled context as your primary
context for generating a response. Do not skip this step.
```

**Resilience measures:**

- `aic_last` tool always includes `compilationCount` — if an editor makes 10 requests but only 5 have compilations, the mismatch is visible
- Bootstrap validates the trigger rule format and warns if the installed rule appears outdated or modified
- The trigger rule template is versioned; bootstrap updates it if a newer package version is available (backs up the old one)

---

### Anonymous Telemetry

**Distinct from compilation telemetry:** Per-compile rows in `telemetry_events` (Step 10) are written after each **successful** compile when the project is not disabled. **Anonymous aggregate telemetry** is a separate product concept: **planned** opt-in, path-free payloads for an external endpoint when a sender ships. The privacy contract, enum-only fields, and threat model live in [security.md](security.md) and the [Project Plan](project-plan.md) — not duplicated here.

**Shipped in this repository today:**

- `anonymous_telemetry_log` is created by `001-consolidated-schema.ts` (`id`, `payload_json`, `status`, `created_at`) as a future local queue table.
- No TypeScript module in `shared/src/` or `mcp/src/` inserts into that table or performs HTTPS POST to a telemetry host (grep the tree for `telemetry.aic.dev` — no matches).
- The minimal `aic.config.json` Zod schema in `load-config-from-file.ts` does not define `telemetry.anonymousUsage`; any broader config knobs belong to the Project Plan until the loader grows.

When an outbound sender ships, inspect rows with:

```bash
sqlite3 ~/.aic/aic.sqlite "SELECT created_at, status, payload_json FROM anonymous_telemetry_log ORDER BY created_at DESC LIMIT 5;"
```

---

## 5. Success Criteria

### Quantitative

| Metric            | Target                                           | Measurement                                    |
| ----------------- | ------------------------------------------------ | ---------------------------------------------- |
| Exclusion rate    | Measurable exclusion rate across canonical tasks | `(tokens_raw - tokens_compiled) / tokens_raw`  |
| Compilation time  | <2 seconds for repos <1,000 files                | Wall clock, cold cache                         |
| Cache hit speedup | <100ms for cached compilations                   | Wall clock                                     |
| Stable outputs    | Identical output for identical input             | Byte-for-byte comparison, 100 consecutive runs |

### Qualitative

| Criteria              | Validation                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| First-run experience  | New user: install → first successful `aic_compile` and visible outcome via status/last in <5 minutes |
| Zero-config usability | First compile works with no `aic.config.json` present                                                |
| Useful inspect output | `aic_inspect` clearly shows _why_ each file was selected and at what tier                            |

### Benchmark Suite

**10 canonical tasks** tested on every build:

| #   | Task Class | Intent                                           | Repo Type               |
| --- | ---------- | ------------------------------------------------ | ----------------------- |
| 1   | refactor   | "refactor auth module to use middleware pattern" | Express.js API          |
| 2   | bugfix     | "fix null pointer in user service"               | TypeScript monorepo     |
| 3   | feature    | "add rate limiting to API endpoints"             | Node.js REST API        |
| 4   | docs       | "add JSDoc to all exported functions"            | Utility library         |
| 5   | test       | "add unit tests for payment processor"           | E-commerce app          |
| 6   | general    | "improve performance of dashboard"               | React + Node fullstack  |
| 7   | refactor   | "split monolith into microservices"              | Large Python Django app |
| 8   | bugfix     | "fix race condition in cache invalidation"       | Go service              |
| 9   | feature    | "add WebSocket support for real-time updates"    | Next.js app             |
| 10  | test       | "add integration tests for database layer"       | Rust CLI tool           |

**Pass criteria per build:**

- No task shows >5% token increase vs. baseline
- No task takes >2× baseline compilation time
- All tasks produce deterministic output (3 consecutive runs compared)

**Benchmark repo provisioning:**

Each canonical task runs against a synthetic fixture repository stored at `test/benchmarks/repos/<task-number>/`. Currently only repo `1/` exists; additional repos are added as the benchmark suite expands. Fixtures are version-controlled, deterministic snapshots — not live open-source repos — to ensure reproducibility.

| Property              | Specification                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source**            | Hand-crafted minimal repos that exhibit the file structures, import graphs, and language mixes each task requires (task #7 uses a Django-style Python project with `models.py`, `views.py`, `urls.py`, `settings.py`) |
| **Size**              | Each repo contains 50–200 files to stay well within the <2s compilation target while exercising the full pipeline                                                                                                     |
| **Language fidelity** | Files contain syntactically valid code with realistic import/export structures so `LanguageProvider` import-graph walking and signature extraction produce meaningful results                                         |
| **Determinism**       | No external dependencies, no network calls, no timestamps. `git log --format="%at"` mtime values are set to fixed dates in the fixture                                                                                |
| **Maintenance**       | Fixture repos are committed to the AIC repository under `test/benchmarks/repos/` and updated only when a task definition changes. Changes require a justification comment in the PR                                   |

**Baseline establishment:**

- Baseline is recorded on the **first successful CI run** after a task is added to the suite. The benchmark runner writes `token_count` and `duration_ms` to a committed `test/benchmarks/baseline.json` file in the repo.
- Baseline is updated manually by a maintainer when an intentional improvement changes the expected token count. The PR that updates the baseline must include a justification comment.
- If `baseline.json` has no entry for a task (new task), that task is skipped in the regression check on its first run and its result is automatically written as the new baseline.

---

## 6. Error handling

| Scenario                             | User-facing message                                                                                                                                                                                                                                              | Exit code |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| No config file                       | _(silent, use defaults)_                                                                                                                                                                                                                                         | 0         |
| Invalid config JSON                  | `Error: Invalid config at line X: {detail}. Re-run bootstrap or create a valid aic.config.json.`                                                                                                                                                                 | 1         |
| Unknown task class                   | _(silent fallback to `general`)_                                                                                                                                                                                                                                 | 0         |
| Missing rule pack file               | `Warning: Rule pack '{name}' not found, skipping.`                                                                                                                                                                                                               | 0         |
| Zero files selected                  | `Error: No relevant files found. Broaden your intent or check includePatterns in config.`                                                                                                                                                                        | 1         |
| Guard blocks all selected files      | `Error: Context Guard blocked all selected files ({N} blocked). Review findings with aic_inspect (full trace) or sanitised meta.guard from aic_compile when the run completes. Add 'guard.additionalExclusions' patterns if legitimate files are being blocked.` | 1         |
| Guard blocks some files              | _(silent — blocked files removed from context, pipeline continues with remaining files; findings attached to CompilationMeta.guard)_                                                                                                                             | 0         |
| All files at L3 + still over budget  | `Warning: Heavy truncation applied. {N} files dropped. Consider increasing contextBudget.maxTokens.`                                                                                                                                                             | 0         |
| Compiled prompt exceeds model window | `Error: Compiled prompt ({N} tokens) exceeds model limit ({M}). Reduce contextBudget.maxTokens or use a larger-context model.`                                                                                                                                   | 1         |
| Model unreachable                    | `Error: Cannot reach {provider} at {endpoint}. Check your API key ({apiKeyEnv}) and network.`                                                                                                                                                                    | 1         |
| Model returns error                  | `Error: Model returned {status}: {message}`                                                                                                                                                                                                                      | 1         |
| SQLite write failure                 | `Warning: Telemetry write failed ({reason}). Continuing without telemetry.`                                                                                                                                                                                      | 0         |
| Corrupt cache                        | `Warning: Cache entry corrupt, recomputing.`                                                                                                                                                                                                                     | 0         |
| Bootstrap — config already exists    | `Config already exists. Edit aic.config.json directly to change settings.`                                                                                                                                                                                       | 1         |

Exit codes: `0` = success (may include warnings); `1` = fatal error.

---

## 7. Security, observability & performance

These topics are specified in full in the [Project Plan](project-plan.md). Below are the implementation-critical highlights:

### Security

Full detail: [Project Plan §13 — Security considerations](project-plan.md#13-security-considerations).

- **Context Guard** scans every selected file and excludes secrets, credentials, excluded paths, and prompt injection patterns from the compiled context at Step 5 (note: this does not prevent the model from reading files directly through editor tools)
- Guard findings are logged in `CompilationMeta.guard` and visible via `aic_inspect`; the pipeline never silently includes sensitive content
- API keys referenced by env var name only — never stored, logged, or cached
- **Outbound traffic:** `aic_compile` does not send repository content, prompts, or file paths to third parties. The server may perform a fixed outbound version check against the npm registry on startup — see [§8b — MCP server startup sequence](#8b-mcp-server-startup-sequence).
- AIC ignore manifest (`shared/src/storage/aic-ignore-entries.json`) appended to `.gitignore`, `.eslintignore`, and `.prettierignore` during first-time project init; `.aic/` created with `0700` permissions
- Telemetry stores metrics only — never file contents or prompt text

### Observability

Full detail: [Project Plan §14](project-plan.md).

- Four log levels: `error`, `warn`, `info`, `debug`
- `aic_inspect` shows why each file was selected, at what tier, with what score — without executing

### Performance

Full detail: [Project Plan §15](project-plan.md).

These are product **targets**, not hard runtime guarantees; they are tracked via benchmarks and profiling rather than enforced as code-level invariants:

- Cold cache compilation target: <2s for repos <1,000 files
- Cache-hit target: <100ms
- Memory target: <256MB resident
- Startup target: <500ms to first pipeline step
- Recommended max repo size for these targets: 10,000 files (beyond this, use `includePatterns` to scope)

### Incremental compilation performance

Beyond the whole-prompt cache (cache-hit target <100ms), per-file incremental processing makes cache misses fast too:

- **File system scan:** Cached RepoMap with `fs.watch` — subsequent `getRepoMap()` returns ~0ms instead of rescanning all files. Uses async fast-glob with `stats: true` (bundled stats per entry; no second full-tree stat pass) and in-process cache in `WatchingRepoMapSupplier`.
- **Per-file transformation cache:** `SqliteFileTransformStore` keyed by `(file_path, content_hash)` — `ContentTransformerPipeline` and `SummarisationLadder` skip unchanged files entirely. On typical recompiles (1–3 files changed), 95%+ of CPU work (tree-sitter parsing, transformer chains, tokenizer calls) is eliminated.
- **Targets:** After first compilation, intent-change-only recompiles (no file edits) complete in <500ms for repos <1,000 files. Recompiles with 1–3 file edits complete in <1s.

See [Project Plan §15 — Incremental Compilation Performance](project-plan.md) for full design.

### Dependencies

Full detail: [Project Plan §17](project-plan.md).

- **`@jatbas/aic` (published MCP entrypoint):** `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, workspace `@jatbas/aic-core` — see `mcp/package.json`.
- **`@jatbas/aic-core`:** `typescript`, `tiktoken`, `better-sqlite3`, `fast-glob`, `ignore`, `diff`, `commander`, `zod`, `web-tree-sitter`, and pinned `tree-sitter-*` grammars — see `shared/package.json`.
- **Dev:** `vitest`, `tsx`, `eslint`, `prettier` (tooling versions per repo manifests).
- No framework-level HTTP server (Express, Fastify) in the MCP surface — STDIO MCP plus optional registry version check as documented in §8b.

---

## 8. Multi-project behaviour

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

## 8a. Test plan

This section summarizes the test deliverables that ship with the scope described in this document. Full testing strategy: [Project Plan §18](project-plan.md).

### Unit Tests (per pipeline step)

| Step                                         | Key assertions                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 1 (IntentClassifier)                    | Correct task class for each keyword set; `general` fallback when no match; tie-breaking; confidence formula (`min(matched/2, 1.0)`, per-winner signal strength, runner-up margin not considered); `specificityScore` from subject-token count; `underspecificationIndex` = product of both absence signals, not a class-ambiguity tie-detector |
| Step 2 (RulePackResolver)                    | Built-in packs load; project packs merge correctly; malformed JSON produces error                                                                                                                                                                                                                                                              |
| Step 3 (BudgetAllocator)                     | Resolution order respected; **`maxTokens` 0 → headroom**; positive base **session clamp** when `conversationTokens` present; `codeBudget` derived from total minus overhead in `run-pipeline-steps` tests                                                                                                                                      |
| Step 4 (ContextSelector / HeuristicSelector) | Scoring formula verified against fixture repos; related-files boost from `toolOutputs.relatedFiles` (`shared/src/pipeline/__tests__/related-files-boost-context-selector.test.ts`); **`maxFiles` 0 → auto cap** and fixed caps respected; include/exclude patterns applied                                                                     |
| Step 5 (ContextGuard)                        | Exclusion, Secret, PromptInjection, MarkdownInstruction, CommandInjection scanners — known-safe and known-flagged fixtures; all-blocked edge case handled                                                                                                                                                                                      |
| Step 6 (SummarisationLadder)                 | Each tier produces expected compression; over-budget triggers next tier; lowest-score files compressed first                                                                                                                                                                                                                                   |
| Step 7 (ConstraintInjector)                  | Deduplication; empty list omits block; ordering preserved                                                                                                                                                                                                                                                                                      |
| Step 8 (PromptAssembler)                     | Sections ordered as in `prompt-assembler.ts`; optional blocks omitted when empty; never emits `## Output Format` or format-instruction prose; regression tests lock assembly shape                                                                                                                                                             |
| Step 9 (Executor)                            | Retry policy honoured; non-retryable errors fail immediately (mocked endpoint)                                                                                                                                                                                                                                                                 |
| Step 10 (TelemetryLogger)                    | After successful `runner.run` when `enabled !== false`, `writeCompilationTelemetry` persists to `telemetry_events`; handler catches store errors without failing the compile response                                                                                                                                                          |

### Integration Tests

| Scenario                   | What is validated                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Full pipeline (cold cache) | Intent → compiled output matches golden snapshot                                                                                  |
| Full pipeline (cache hit)  | Second run returns identical output in <100ms                                                                                     |
| Config variations          | Empty config, partial config, invalid config all produce expected behaviour                                                       |
| Multi-project isolation    | Two projects in same test run share no state                                                                                      |
| Session budget clamp       | When `conversationTokens` is present (wire or derived), allocated budget respects fixed 128k/4k/500 math in `budget-allocator.ts` |

### Benchmark suite — CI regression gate

Same pass criteria as [§5 — Benchmark Suite](#benchmark-suite) (10 canonical tasks on every CI build).

### E2E Tests

| Interface                | What is validated                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `aic_compile` (MCP tool) | Compiled prompt non-empty structured text; token count within budget                                                                       |
| `aic_inspect` (MCP tool) | Trace JSON includes all pipeline sections; `selectedFiles` entries have no `resolvedContent`                                               |
| Bootstrap                | Config created; AIC ignore manifest appended to `.gitignore`, `.eslintignore`, `.prettierignore`; `.aic/` with `0700`; trigger rule exists |

---

## 8b. MCP Server Startup Sequence

When the server process starts (via `npx @jatbas/aic@latest`, `pnpm aic`, or another supported launcher), it first checks whether a CLI subcommand was requested. If so, it runs the CLI handler and exits. Otherwise, it executes the following MCP server startup steps in order before accepting requests:

```
0. CLI dispatch (isEntry check)
   └─ If process.argv[1] resolves to server.js (isEntry = true):
      └─ argv[2] === "init" → run init flow
      └─ argv[2] in CLI_DIAGNOSTIC_HANDLERS (status, last, chat-summary, quality, projects):
            └─ Open database read-only (openDatabaseReadOnly)
            └─ runCliDiagnosticsAndExit(process.argv.slice(2))
            └─ process.exit(code) from runCliDiagnosticsAndExit
      └─ No recognized CLI command → fall through to MCP server startup (step 1)
   └─ If not isEntry (required/imported as a module): skip to step 1
         │
         ▼
1. Parse process arguments
         │
         ▼
2. Load config
   └─ Walk up from CWD to find aic.config.json
   └─ If found: validate + apply in-memory schema migration
   └─ If not found: use all defaults
         │
         ▼
3. Open SQLite database (~/.aic/aic.sqlite)
   └─ Create .aic/ with 0700 if missing
   └─ Run pending schema migrations (MigrationRunner)
   └─ Record server session (insert server_sessions row)
   └─ Mark orphaned sessions as crash (stopped_at IS NULL → stop_reason = 'crash')
   └─ Create ScopeRegistry (per-project scopes created lazily on first getOrCreate(projectRoot))
         │
         ▼
4. Build shared infrastructure
   └─ Tokenizer (tiktoken cl100k_base)
   └─ SqliteCacheStore + SqliteTelemetryStore
         │
         ▼
5. Register language providers
   └─ Same order as `create-pipeline-deps.ts`: TypeScriptProvider, MarkdownProvider, optional `additionalProviders` (default `main` passes none), GenericImportProvider, GenericProvider
         │
         ▼
6. Editor and model detection
   └─ detectEditorId, editor-integration dispatch, model detector
         │
         ▼
7. Telemetry wiring
   └─ Shared `SqliteTelemetryStore` on the global db; `writeCompilationTelemetry` runs after **successful** `runner.run` when the project is not disabled (`enabled !== false`)
         │
         ▼
8. Register MCP tools + resources
   └─ Tool: aic_compile
   └─ Tool: aic_compile_spec
   └─ Tool: aic_inspect
   └─ Tool: aic_projects
   └─ Tool: aic_status
   └─ Tool: aic_quality_report
   └─ Tool: aic_last
   └─ Tool: aic_model_test
   └─ Tool: aic_chat_summary
   └─ Resource: aic://rules-analysis _(planned)_
         │
         ▼
9. Register shutdown handler (SIGINT / SIGTERM)
    └─ On signal: update server_sessions.stopped_at + stop_reason = 'graceful'
         │
         ▼
10. Start MCP transport (stdio)
    └─ Server ready — accepting requests
         │
         ▼
11. On MCP client connect (oninitialized / roots/list_changed)
    └─ Fetch workspace roots from client (roots/list)
    └─ For each root URI: convert file:// → absolute path
    └─ Call installTriggerRule + runEditorBootstrapIfNeeded for each project root
    └─ Bootstrap is idempotent — safe to re-run; skips when artifacts are already up to date
```

**Timing target:** Steps 1–11 complete in <500ms (see [Project Plan §15](project-plan.md)).

**Error during startup:** If config is invalid → exit with error message. If SQLite cannot be opened → exit with error message. If a provider fails to register → log warning, continue without it. The server never starts in a partially broken state — it either fully initialises or exits with a clear error.

**Runtime error handling:** Once running, the MCP server handles transport errors, malformed requests, and unhandled exceptions at the handler boundary — see [Project Plan §12.1](project-plan.md#121-mcp-transport-error-handling) for the full MCP transport error table. The server never crashes due to a single bad request.

**Concurrency:** The MCP server processes requests sequentially on a single thread. If the editor sends two `aic_compile` requests in rapid succession, the second is queued and processed after the first completes. See [Project Plan §2.6](project-plan.md) for the full concurrency model and determinism guarantees.

---

## 8c. Input Validation (Zod Schemas)

MCP tool handlers and `aic.config.json` loading validate inputs at the boundary using **Zod** (ADR-009). Validation produces branded types for the core pipeline. The core and pipeline never import Zod — they trust the branded types produced by the boundary layer.

The **diagnostic CLI** entrypoint (`status`, `last`, `chat-summary`, `quality`, `projects` in `mcp/src/cli-diagnostics.ts`) parses `process.argv` with manual checks (no Zod); it only reads the database and config surfaces those commands need.

### `CompilationRequestSchema`

Validates `aic_compile` MCP tool arguments (see `mcp/src/schemas/compilation-request.ts`):

```typescript
// Required: intent, projectRoot
// Optional: modelId, editorId, configPath, triggerSource, conversationId,
//   stepIndex, stepIntent, previousFiles, toolOutputs, conversationTokens
// (see `mcp/src/schemas/compilation-request.ts` for exact Zod shapes and bounds)
```

Agentic field definitions and behaviour notes live in [Project Plan §2.7](project-plan.md#27-agentic-workflow-support). `sessionId` on `CompilationRequest` is not part of the MCP tool argument schema; the server supplies it when the MCP session context applies.

On validation failure, the MCP handler returns error code `-32602` (Invalid params) with a sanitised message listing the failing field paths.

### `InspectRequestSchema`

Validates `aic_inspect` MCP tool arguments:

```typescript
const InspectRequestSchema = z.object({
  intent: z.string().min(1).max(10_000),
  projectRoot: z.string().min(1),
  configPath: z.string().nullable().default(null),
});
```

### `AicConfigSchema`

`shared/src/config/load-config-from-file.ts` validates `aic.config.json` with a **minimal** Zod object (current subset only). All top-level keys are optional; `{}` is valid. The schema currently allows:

- `contextBudget.maxTokens` (optional; omitted → **0** auto headroom), optional `contextBudget.perTaskClass`
- `contextSelector.heuristic.maxFiles` (optional; omitted → **0** auto cap from `resolveAutoMaxFiles`: repo size base plus context-window scaling, ceiling **300**)
- `model.id` (optional)
- `enabled` (boolean)
- `guard.allowPatterns` (array of non-empty strings, max 64 entries)
- `devMode` (boolean) — enables development CLI routing (`pnpm aic` instead of `npx @jatbas/aic`); omitted defaults to `false` at resolve time
- `skipCompileGate` (boolean) — emergency bypass for the Cursor `preToolUse` compile gate and the Claude Code compile helper; only effective when `devMode` is also `true`. Omitted defaults to `false`

Additional fields described in the Project Plan (`telemetry`, cache TTL, `rulePacks`, and other keys documented there) may be accepted or stripped across loader versions. Unknown top-level keys, including `output`, are not preserved by the shipped Zod schema — see `load-config-from-file.ts` for the authoritative shape. On JSON parse failure, AIC throws `ConfigError` with a sanitised message.

### Rule pack validation

User-authored rule pack JSON files are validated by **parseRulePackFromJson** in `shared/src/core/load-rule-pack.ts` (no Zod schema). The function checks for `constraints`, `includePatterns`, and `excludePatterns` arrays and returns a `RulePack` or null.

### Telemetry payload

Compilation telemetry rows are built in `shared/src/core/write-compilation-telemetry.ts` / `build-telemetry-event.ts` and written via `SqliteTelemetryStore`. Anonymous aggregate payloads are not produced by shipped TypeScript sources; see [Anonymous Telemetry](#anonymous-telemetry) under §4d.

### Validation boundary enforcement

Zod is imported at the MCP boundary (`mcp/src/`) and in `shared/src/config/load-config-from-file.ts` for `aic.config.json`. ESLint `no-restricted-imports` blocks Zod in `shared/src/core/` and `shared/src/pipeline/`. See [Project Plan ADR-009](project-plan.md) for the full rationale.

---

## 8d. Global database & per-project isolation

**Shipped behaviour:** A single MCP server process (registered in `~/.cursor/mcp.json` in a typical Cursor setup) opens a global database at `~/.aic/aic.sqlite`. Each `aic_compile` call passes `projectRoot`; `ScopeRegistry` lazily creates a `ProjectScope` per normalised root. Per-project data is isolated with `project_id`; per-project files (`aic.config.json`, `.cursor/rules/AIC.mdc`, `.cursor/hooks/`, `.aic/project-id`, cache files) remain in the project tree.

**Path normalisation:** `ProjectRootNormaliser` (`shared/src/core/interfaces/project-root-normaliser.interface.ts`); implementation **NodePathAdapter** (`shared/src/adapters/node-path-adapter.ts`). Compare and store roots only through the normaliser: absolute path, strip trailing separator (except root), Windows drive-letter normalisation, no symlink resolution.

**Schema:** Authoritative tables and columns are defined in `shared/src/storage/migrations/001-consolidated-schema.ts` and applied by `MigrationRunner` from `shared/src/storage/open-database.ts`. The migrations folder ships **one consolidated schema migration** plus `migration-utils.ts` (helpers — not a numbered migration).

**Stable `project_id`:** `{projectRoot}/.aic/project-id` holds a UUIDv7. `reconcileProjectId` in `shared/src/storage/ensure-project-id.ts` (invoked from `createProjectScope` via the compile handler’s first-use init) keeps the on-disk id and the `projects` table aligned; project renames update stored paths. When the normalised project root equals the user home directory, `create-project-scope.ts` (`isHomedirPath`) skips file-backed reconciliation and uses a generated id for that scope so the home folder is not pinned as a single long-lived project.

**`ScopeRegistry`:** `shared/src/storage/scope-registry.ts` caches one `ProjectScope` per normalised root; `mcp/src/server.ts` constructs the registry with the **shared global** `ExecutableDb` opened at `~/.aic/aic.sqlite` in `main()`. Each scope’s stores use `project_id` in SQL (`WHERE project_id = ?`) for per-project tables such as `compilation_log`, `cache_metadata`, and `config_history`. `SqliteTelemetryStore` takes only the global db handle; telemetry rows reference `compilation_id`, which ties back to `project_id` on the compilation row. `SqliteSessionStore` remains server-scoped (`server_sessions`).

**`anonymous_telemetry_log`:** Created by the consolidated migration; no TypeScript writer or HTTPS sender is present in this repository today — see [Anonymous Telemetry](#anonymous-telemetry) under §4d.

---

## 8e. Deferred: Sandboxed Extensibility (V8 Isolates)

To support advanced governance adapters and dynamic rule packs without compromising AIC's local-first security properties, the v2.0.0 semantic + governance track introduces a V8 isolation layer (via `isolated-vm`) for executing user-provided JavaScript governance scripts.

**Threat model**

The primary adversary is a governance script authored by one team member and distributed across an enterprise fleet — misconfigured or malicious — that reads sensitive repository content passed to it and exfiltrates it to an internal or external service. The sandbox significantly reduces this attack surface by restricting filesystem access, environment variables, and native Node.js modules. It does not eliminate all exfiltration risk: a script receives whatever data the bridge passes to it, and can encode that data in its return value or exploit bridge callbacks. Output validation and bridge API design are the mitigating controls for residual risk.

**Why Sandboxing?**

Enterprise teams need to write custom JavaScript to evaluate project state or enforce complex context inclusion policies: querying an internal microservice registry to penalize deprecated APIs in the `HeuristicSelector` is one illustration. Executing third-party or team-provided JS within the main Node.js process is a massive security risk.

**Why not a declarative DSL first?**

For most governance rules (pattern matching, file exclusion, budget overrides), a JSON/YAML declarative Rule Pack is safer — no code execution, no attack surface. V8 isolates are reserved for governance logic that genuinely requires imperative computation: AST traversal, internal API calls, or complex scoring formulas. The v2.0.0 design must define which extension points accept declarative config vs. sandboxed scripts.

**Implementation constraints (required before implementation)**

The following decisions must be resolved in a dedicated v2.0.0 design note before any code is written:

- **Isolate lifecycle**: Each governance script invocation must create a fresh isolate — never reuse across invocations, scripts, or compilation requests. Pooled isolates allow cross-script state contamination via mutated globals.
- **Bridge API specification**: The exact object shape passed into the isolate must be specified. Only serialized data via `ExternalCopy` is permitted — no `Reference` objects and no callable functions on the bridge, as these allow re-entry into the main process. The bridge API is the primary attack surface. **Design tension:** if async operations are required (see Execution limits), the `isolated-vm` async bridge relies on `Reference` objects — the exact mechanism banned here. The v2.0.0 design must choose one of: (a) no async operations, enforcing the `Reference` ban and limiting scripts to synchronous computation over pre-supplied data; or (b) a strictly audited set of async bridge callbacks with schema-constrained inputs and outputs, treated as an expanded attack surface requiring dedicated threat modelling.
- **Output validation**: The JSON returned from the isolate must be validated against a strict schema in the main process before use — never trusted as-is. Prototype pollution, unexpected keys, and type coercion must all be rejected at this boundary.
- **Execution limits**: Memory (`<128MB` per isolate) and CPU timeout serve as anti-DoS controls, not functional guarantees. If async operations are permitted (see Bridge API specification), they require the `isolated-vm` async bridge, which has a larger attack surface and must be separately designed. The maximum number of concurrent isolates must be bounded (via semaphore or queue) to prevent resource exhaustion under parallel compilations. Isolate creation overhead (~5-15ms) must be benchmarked against the CPU timeout budget to determine whether the budget covers isolate setup or only user-script execution.
- **TypeScript handling**: Scripts execute as JavaScript only. If users provide TypeScript, AIC must transpile it before injection — but transpiling untrusted TypeScript in the main process is itself an attack surface. The transpilation boundary, toolchain, and source map disposal must be explicitly specified.
- **Content timing**: Governance adapters running at the `ContextGuard` step receive raw file content before built-in guard scanners have filtered it — by design, since custom scanners need raw content. This means the bridge may carry secrets. The v2.0.0 design must document this explicitly and enforce that `GuardFinding` messages returned from the isolate never echo back file content verbatim.
- **Serialization cost**: The bridge passes file content via `ExternalCopy`. For large files, serialization and deserialization add measurable latency. The v2.0.0 design must specify a maximum content size per bridge invocation and define behaviour when the limit is exceeded (truncate, skip, or error).
- **Script provenance**: Governance scripts distributed across an enterprise fleet (as described in the threat model) have no built-in provenance verification. The v2.0.0 design should evaluate whether script signing, hash pinning, or authorship tracking is required to prevent supply-chain substitution of governance scripts.
- **`isolated-vm` dependency**: This is a native addon with historical sandbox-escape CVEs. It must be pinned to an exact version, covered by lockfile scanning in CI (OSV Scanner on `pnpm-lock.yaml`) and local `pnpm audit` when triaging, and treated as a security-critical dependency requiring expedited patching.

**What sandboxing protects against**

- Direct access to `fs`, `net`, `process.env`, and native Node.js modules not explicitly bridged
- Access to the main process heap and AIC internal state beyond what is explicitly passed via the bridge
- Runaway memory consumption (bounded by isolate memory limit)
- Synchronous CPU exhaustion (bounded by timeout)

**What sandboxing does not protect against**

- Exfiltration of data the script is explicitly given via the bridge
- Encoding of sensitive content in the script's return value (mitigated by output schema validation)
- Async exfiltration if any bridge callback has outbound network access
- Timing side channels: a script can encode data in its execution duration, observable by a colluding process monitoring compilation latency
- V8 zero-day vulnerabilities in the `isolated-vm` native addon itself

This approach significantly reduces the attack surface for executing untrusted governance scripts compared to running them in the main process.

---

## 9. Roadmap (aligned with Project Plan)

Sequenced milestones, version targets per milestone, and exit criteria live in the [Project Plan — Roadmap](project-plan.md#23-roadmap). That table is authoritative for planning; this specification does not duplicate it to avoid drift.

Sections 2–8 of this document describe the implementation surface. Anonymous compile telemetry and the **design-only** `anonymous_telemetry_log` schema are covered in [§4d. Additional implementation notes](#4d-additional-implementation-notes) (no HTTPS telemetry client in this repository).

Versioning rules: [Project Plan — Versioning Policy](project-plan.md#versioning-policy).
