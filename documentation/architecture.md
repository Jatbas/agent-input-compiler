# Architecture

AIC has two distinct layers:

**1. Core Pipeline (editor-agnostic)** — The compilation engine. Takes an intent and a project root, runs a deterministic pipeline (classify, select, guard, transform, compress, assemble), and returns compiled context. The pipeline handles every compilation scenario — session start, per-prompt, per-subagent, pre-compaction — identically. It doesn't know or care who called it. For full pipeline detail (rule packs, budget, and step-by-step pipeline description), see [implementation-spec](implementation-spec.md).

**2. Integration Layer (per-editor)** — Thin adapters that ensure the core pipeline runs at the right time and delivers its output to the model. Each editor exposes different hook capabilities, so each integration layer calls `aic_compile` at different points in the editor's lifecycle.

> **What this means:** AIC's compilation capabilities are complete. Any perceived limitation in what AIC "can do" is actually a limitation of the editor's hook system — whether the editor gives AIC the opportunity to run at a given moment. Because AIC follows SOLID principles (dependency injection, interface segregation), adding a new integration layer for a new editor means writing thin hook scripts that call the same core pipeline. No core changes needed.

**Composition root** — `mcp/src/server.ts` is the only place that wires concrete implementations (storage, adapters, pipeline runner) for the shipped server. Core and pipeline code depend on interfaces; hook scripts call `aic_compile` over MCP and do not import `shared/` or `mcp/src` TypeScript modules directly.

---

## What AIC needs from an editor

For full AIC integration, an editor should expose these hook capabilities:

| Capability                             | What it enables                                                                                     | Required?    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------ |
| **Session start + context injection**  | Compile context once and inject into the conversation. Model starts with curated code.              | Recommended  |
| **Per-prompt + context injection**     | Compile intent-specific context on every user message. Adapts to topic changes.                     | Ideal        |
| **Pre-tool-use gating**                | Enforce `aic_compile` before other tools (per-generation marker, recency fallback, deny-count cap). | Recommended  |
| **Subagent start + context injection** | Inject compiled context when subagents spawn. Closes the biggest agentic gap.                       | Ideal        |
| **Session end**                        | Log session lifecycle for telemetry.                                                                | Nice to have |
| **Pre-compaction**                     | Re-compile before context window compaction. Preserves quality during long sessions.                | Nice to have |
| **Trigger rule**                       | Text instruction asking the model to call `aic_compile`. Minimal integration (no hooks).            | Minimum      |

> No editor currently has a complete AIC integration for all of these. But the core pipeline is ready for all of them — the only variable is which hooks the editor provides and whether AIC's integration layer has been built for them.

---

## Value of compiled context

When AIC compiles context (at session start or per-prompt), it selects the most relevant files and compresses them into a token-efficient representation. That means:

- The model starts or continues with a curated view of the codebase
- File selection is algorithmic and deterministic, not dependent on the model's guesswork
- Security scanning (Context Guard) runs before any code reaches the model
- The compiled context is bounded by the token budget, so its contribution to context window fill is predictable and leaves stable headroom

> Even when the editor compiles only at session start (e.g. Cursor), that initial compilation provides a foundation that benefits every turn.

---

## Editor hook coverage and integration status

**Integrated** — The editor exposes the hook, and AIC's integration is built. **Hook available** — The editor exposes the hook, but AIC does not register it or build integration for it. **Hook available (observational)** — The editor exposes the hook; AIC does not register it or inject context (e.g. Cursor preCompact). **—** — The editor does not expose this hook. See [cursor-integration-layer](technical/cursor-integration-layer.md) and [claude-code-integration-layer](technical/claude-code-integration-layer.md) for hook-by-hook detail.

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
- **Claude Code** supports all hook capabilities AIC needs (including per-prompt and subagent injection), and AIC's integration layer is built for them (session start, per-prompt, subagent inject, pre-compaction, session end, etc.). See [claude-code-integration-layer](technical/claude-code-integration-layer.md).
- **Other editors** without hooks rely solely on the trigger rule, which is suggestive — the model may or may not call `aic_compile`.

---

## CLI Interface

In this repository the built entrypoint is `mcp/dist/server.js`. In the published `@jatbas/aic` package the same program is exposed as `dist/server.js` at the package root (`bin` in `mcp/package.json`). It has a dual interface:

- **MCP server mode** (default) — when invoked without a recognized CLI subcommand, the process starts as a long-running MCP stdio server and accepts requests from editors. The shipped server registers seven MCP tools (`aic_compile`, `aic_inspect`, `aic_projects`, `aic_status`, `aic_last`, `aic_model_test`, `aic_chat_summary`); see [installation.md — AIC Server](installation.md#aic-server) and [implementation-spec.md](implementation-spec.md).
- **CLI mode** — when invoked with `status`, `last`, `chat-summary`, or `projects` as the first argument, the process opens the database read-only, prints formatted table output to stdout, and exits. No MCP transport is started.

The dispatch happens at process entry via an `isEntry` check. CLI mode is always one-shot and read-only — it never mutates state.

This dual interface means you can query AIC diagnostic data from a terminal using the same binary that serves as the MCP server, with or without an MCP-connected editor:

```bash
npx @jatbas/aic status      # published release
npx @jatbas/aic status 14d  # optional rolling window: N days (N integer 1..3660)
pnpm aic status             # development (requires pnpm build; run from repo root)
```

For all four subcommands and their usage, see [installation.md — CLI Standalone Usage](installation.md#cli-standalone-usage).
