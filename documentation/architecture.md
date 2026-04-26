# Architecture

AIC has two distinct layers:

**1. Core Pipeline (editor-agnostic)** — The compilation engine. Each compile takes intent, project root, and optional request fields (session identity, tool outputs, token hints, and more). `runPipelineSteps` classifies the task, resolves rule packs, allocates a **total** token budget, and loads the repo map. Measured **overhead** includes structural map text, optional recent-step session summary, the in-pipeline spec-ladder slice on `isSpecPath` files (`SpecFileDiscoverer` → Context Guard → Content Transformer → Summarisation Ladder; the ladder slice is capped relative to total budget), token-counted rule-pack constraint strings, and a fixed 100-token task header. Subtracting that sum from the total yields **codeBudget** ([Pipeline orchestration (`runPipelineSteps`)](implementation-spec.md#pipeline-orchestration-runpipelinesteps)). It runs intent-aware file discovery, selects main-path files within **codeBudget**, then runs main-path Context Guard, Content Transformer, and Summarisation Ladder on that selection, optional line-level pruning when subject tokens are present, and **PromptAssembler** (structural map, session summary snippet, spec ladder files, and main pruned files). Authoritative execution order, budget math, and MCP edge cases (weak intent, reparent-only paths, cache) are documented in that implementation-spec section and its **Agentic workflows** note. The same orchestration backs every successful compile that runs the pipeline; which optional stages and fields apply is determined by the request and integration, not the editor identity. It doesn't know or care who called it. Compile requests may include `toolOutputs` entries with optional `relatedFiles` on each entry; those strings are normalised to project-root–relative paths at the MCP boundary. Wire details and which shipped hooks populate agentic fields differ by editor—see section 2.1 in [Cursor integration](technical/cursor-integration-layer.md) and [Claude Code integration](technical/claude-code-integration-layer.md). The MCP server assembles `PipelineStepsDeps` through `shared/src/bootstrap/create-pipeline-deps.ts`, wrapping `HeuristicSelector` with `RelatedFilesBoostContextSelector` so those paths merge into heuristic boost patterns before scoring. When the deduplicated related-path set is non-empty, the compilation cache key includes a canonical encoding of those paths so cache hits cannot ignore tool-output changes ([ContextSelector (Step 4)](implementation-spec.md#step-4-contextselector-relatedfilesboostcontextselector)). For step-by-step pipeline detail (rule packs, budgets, and types), see [implementation-spec](implementation-spec.md).

For the two MCP compile tools and the in-pipeline spec ladder, see [MCP compile entrypoints](#mcp-compile-entrypoints).

**2. Integration Layer (per-editor)** — Thin adapters that ensure the core pipeline runs at the right time and delivers its output to the model. Each editor exposes different hook capabilities, so each integration layer calls `aic_compile` at different points in the editor's lifecycle. `integrations/shared/conversation-id.cjs` centralises `conversationId` resolution; Cursor-native payload detection lives in `integrations/cursor/is-cursor-native-hook-payload.cjs`. See [Integrations shared modules reference](technical/integrations-shared-modules.md). This “adapter” layer is separate from third-party library wrappers under `shared/src/adapters/` (hexagonal boundary — one file per external dependency).

For practical usage patterns after you understand the architecture, see [best-practices.md](best-practices.md).

> **What this means:** AIC's compilation capabilities are complete. Any perceived limitation in what AIC "can do" is actually a limitation of the editor's hook system — whether the editor gives AIC the opportunity to run at a given moment. Because AIC follows SOLID principles (dependency injection, interface segregation), adding a new integration layer for a new editor means writing thin hook scripts that call the same core pipeline. No core changes needed.

**Composition root** — `mcp/src/server.ts` is the main entrypoint for the shipped MCP server: it wires the scope registry, compilation runner cache, inspect support, MCP tool registration, and startup maintenance. Handlers and CLI helpers under `mcp/src` still construct concrete SQLite stores or adapters where needed (including tool-invocation logging in `mcp/src/handlers/compile-handler.ts` and `mcp/src/handlers/compile-spec-handler.ts`, and status reads in `mcp/src/diagnostic-payloads.ts` and `mcp/src/cli-diagnostics.ts`). Pipeline packages stay interface-first; hook scripts call `aic_compile` over MCP and do not import `shared/src` or `mcp/src` TypeScript modules directly.

---

## MCP compile entrypoints

The shipped server exposes two MCP tools whose names include `compile`; they are not interchangeable. The full nine-tool inventory also appears under [CLI Interface](#cli-interface) — MCP server mode.

**`aic_compile`** runs the full repository-context compilation pipeline via `runPipelineSteps` when the compilation runner misses the cache; on a cache hit it returns stored output without re-invoking `runPipelineSteps` ([Selection trace (persistence and tools)](implementation-spec.md#selection-trace-persistence-and-tools)). Step order and handler branches are under [Pipeline orchestration (`runPipelineSteps`)](implementation-spec.md#pipeline-orchestration-runpipelinesteps). Editor hooks and the trigger rule invoke this tool. On success, the handler returns JSON that includes `compiledPrompt`, `meta`, `conversationId`, `updateMessage`, and conditionally `configUpgraded` and `warnings` per [implementation-spec](implementation-spec.md). A narrow `subagent_stop` reparent path updates stored rows without running the pipeline; see [implementation-spec](implementation-spec.md).

**`aic_compile_spec`** is a separate MCP tool. The handler validates the request with Zod, records invocations in `tool_invocation_log`, maps the wire `spec` into `SpecificationInput`, and awaits `deps.specificationCompiler.compile` (wired to `SpecificationCompilerImpl` in `mcp/src/server.ts`; tier assignment, demotion toward budget, and truncation handling live in `shared/src/pipeline/specification-compiler.ts`). For **verbatim** wire types, `SpecificationCompilerImpl` first runs `ContentTransformerPipeline` and `SummarisationLadder` on synthetic body rows under a capped batch budget, then runs the spec budget loop. On success the tool returns `compiledSpec` and `meta` with raw versus compiled token totals, reduction metrics, and final `typeTiers` after the budget loop. When every type is path-only, code and prose blocks are removed, and the composed string still exceeds budget, the compiler appends a fixed truncation warning to `compiledSpec`. [Implementation-spec — `aic_compile_spec`](implementation-spec.md#aic_compile_spec-mcp-tool) defines the full contract, including validation errors and MCP `structuredContent` parity with the JSON `text` payload. The AIC Server tools table in [installation.md](installation.md#aic-server) lists the tool alongside its siblings.

**In-pipeline spec ladder vs `aic_compile_spec`:** The optional spec ladder inside `runPipelineSteps` selects repo-map files whose paths match `isSpecPath` (`documentation/`, `.cursor/rules/`, `.claude/skills/`, and paths starting with `adr-`), then runs guard, transform, and compress stages as part of **`aic_compile`** (see [implementation-spec](implementation-spec.md)). The **`aic_compile_spec`** MCP tool compiles the structured `spec` object carried in the tool request, not that repo-map selection branch.

## What AIC needs from an editor

For full AIC integration, an editor should expose these hook capabilities:

| Capability                             | What it enables                                                                                                                                                                                                                                       | Required?    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **Session start + context injection**  | Compile context once and inject into the conversation. Model starts with curated code.                                                                                                                                                                | Recommended  |
| **Per-prompt + context injection**     | Compile intent-specific context on every user message. Adapts to topic changes.                                                                                                                                                                       | Ideal        |
| **Pre-tool-use gating**                | Enforce `aic_compile` before other tools (per-generation marker, recency fallback, sibling-race poll before deny — see [Cursor integration layer §7.3](technical/cursor-integration-layer.md#73-pretooluse-unmatched--aic_compile-enforcement-gate)). | Recommended  |
| **Subagent start + context injection** | Inject compiled context when subagents spawn. Closes the biggest agentic gap.                                                                                                                                                                         | Ideal        |
| **Session end**                        | Log session lifecycle for telemetry.                                                                                                                                                                                                                  | Nice to have |
| **Pre-compaction**                     | Re-compile before context window compaction. Preserves quality during long sessions.                                                                                                                                                                  | Nice to have |
| **Trigger rule**                       | Text instruction asking the model to call `aic_compile`. Minimal integration (no hooks).                                                                                                                                                              | Minimum      |

> No editor currently has a complete AIC integration for all of these. But the core pipeline is ready for all of them — the only variable is which hooks the editor provides and whether AIC's integration layer has been built for them.

---

## Value of compiled context

When AIC compiles context (at session start or per-prompt), it selects the most relevant files and compresses them into a token-efficient representation. That means:

- The model starts or continues with a curated view of the codebase
- File selection is algorithmic and deterministic, not dependent on the model's guesswork
- Security scanning (Context Guard) runs before any code reaches the model
- The compiled context is bounded by the token budget, so its contribution to context window fill is predictable and leaves stable headroom

> Even when the editor compiles only at session start (Cursor does this), that initial compilation provides a foundation that benefits every turn.

---

## Editor hook coverage and integration status

**Integrated** — The editor exposes the hook, and AIC's integration is built. **Hook available** — The editor exposes the hook, but AIC does not register it or build integration for it. **Hook available (observational)** — The editor exposes the hook; AIC does not register it or inject context (Cursor `preCompact`). **—** — The editor does not expose this hook. See [cursor-integration-layer](technical/cursor-integration-layer.md) and [claude-code-integration-layer](technical/claude-code-integration-layer.md) for hook-by-hook detail.

| Capability                         | Cursor                         | Claude Code |
| ---------------------------------- | ------------------------------ | ----------- |
| Session start + context injection  | Integrated                     | Integrated  |
| Per-prompt + context injection     | —                              | Integrated  |
| Pre-tool-use gating                | Integrated                     | Integrated  |
| Subagent start + context injection | —                              | Integrated  |
| Subagent start (gating only)       | Hook available                 | —           |
| Session end                        | Integrated                     | Integrated  |
| Pre-compaction                     | Hook available (observational) | Integrated  |
| Trigger rule                       | Integrated                     | Integrated  |

Cursor exposes sessionEnd, preCompact, subagentStart (gating only — no context injection), subagentStop (lifecycle hook when a Task-tool subagent completes), stop, afterFileEdit, and others; see [Cursor agent hooks](https://cursor.com/docs/agent/hooks). AIC uses sessionEnd, stop, afterFileEdit, and subagentStop (to reparent `compilation_log` to the parent conversation) where the editor exposes them. Claude Code's hook system covers all 7 capabilities, and AIC's integration layer is built for them.

---

## Cursor

AIC's integration layer for **Cursor** provides session-start context injection, pre-tool-use gating, session end, stop quality check, and afterFileEdit tracking. The compile gate in `preToolUse` enforces `aic_compile` on every tool-using turn; an emergency bypass is available when both `devMode` and `skipCompileGate` are true in `aic.config.json` ([installation.md](installation.md); full hook layout and §7.3 in [cursor-integration-layer.md](technical/cursor-integration-layer.md)).

## Claude Code

AIC's integration layer for **Claude Code** provides all seven capabilities (session start, per-prompt and subagent context injection, pre-tool-use gating, session end, pre-compaction, trigger rule). For hook-by-hook behavior, deployment, and known issues, see [claude-code-integration-layer](technical/claude-code-integration-layer.md).

---

## Editor-specific integration gaps

Each editor exposes a different subset of the hook capabilities AIC can use. Gaps in one editor may not exist in another:

- **Cursor** supports sessionEnd and preCompact as hooks (AIC uses sessionEnd; preCompact is observational only — no context injection). Cursor does not support per-prompt context injection or subagent context injection; subagentStart is gating only (no additional_context). AIC registers subagentStop so compilations from Task-tool subagents roll up to the parent conversation for per-chat diagnostics. The compile gate enforces `aic_compile` unless the emergency bypass is active (both `devMode` and `skipCompileGate` true in `aic.config.json`); text-only turns and subagent spawns bypass AIC for context injection.
- **Claude Code** supports all hook capabilities AIC needs (including per-prompt and subagent injection), and AIC's integration layer is built for them (session start, per-prompt, subagent inject, pre-tool-use gating, pre-compaction, session end, trigger rule). See [claude-code-integration-layer](technical/claude-code-integration-layer.md).
- **Other editors** without hooks rely solely on the trigger rule, which is suggestive — the model may or may not call `aic_compile`.

---

## CLI Interface

In this repository the built entrypoint is `mcp/dist/server.js`. In the published `@jatbas/aic` package the same program is exposed as `dist/server.js` at the package root (`bin` in `mcp/package.json`). It has a dual interface:

- **MCP server mode** (default) — when invoked without a recognized CLI subcommand, the process starts as a long-running MCP stdio server and accepts requests from editors. The shipped server registers nine MCP tools (`aic_compile`, `aic_inspect`, `aic_projects`, `aic_quality_report`, `aic_status`, `aic_last`, `aic_model_test`, `aic_chat_summary`, `aic_compile_spec`); see [installation.md — AIC Server](installation.md#aic-server) and [implementation-spec.md](implementation-spec.md).
- **CLI mode** — when invoked with `status`, `last`, `chat-summary`, `quality`, or `projects` as the first argument, the process opens the database read-only, prints formatted table output to stdout, and exits. A separate `init` subcommand runs project bootstrap (writes local project artifacts; not a read-only diagnostic — see [installation.md](installation.md)). No MCP transport is started on these paths.

**MCP JSON vs CLI output:** MCP tools return structured JSON. The five diagnostic subcommands above print fixed-width tables from the same read-only store. `aic_last` / `last` include **Cache** on every row, **Guard (this run)** and **Top files** / **Excluded by** when the `last` table formatter includes those rows (visibility and label form — [Implementation spec — `aic_last` (MCP tool)](implementation-spec.md#aic_last-mcp-tool)); the full **`selection`** object (per-file signals and complete excluded list) is JSON-only. `selection` is JSON `null` when no trace was stored (including when the latest compilation was served from the compilation cache — see [Selection trace (persistence and tools)](implementation-spec.md#selection-trace-persistence-and-tools)). `aic_compile`'s `meta` does not carry that trace ([MCP response shape](implementation-spec.md#4-core-pipeline--implementation-detail)). For a fresh Steps 1–8 decision trace without writing through the compilation cache, use `aic_inspect` (`{ trace: … }`; shape differs from persisted `selection`) — [`aic_inspect` (MCP tool)](implementation-spec.md#aic_inspect-mcp-tool).

The dispatch happens at process entry via an `isEntry` check. Diagnostic CLI subcommands are one-shot and read-only against the global database — they do not start MCP.

This dual interface means you can query AIC diagnostic data from a terminal using the same binary that serves as the MCP server, with or without an MCP-connected editor:

```bash
npx @jatbas/aic status      # published release
npx @jatbas/aic status 14d  # optional rolling window: N days (N integer 1..3660)
pnpm aic status             # development (requires pnpm build; run from repo root)
```

For all five diagnostic subcommands and their usage, see [installation.md — CLI Standalone Usage](installation.md#cli-standalone-usage).
