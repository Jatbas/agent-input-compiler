# Architecture

AIC has two distinct layers:

**1. Core Pipeline (editor-agnostic)** — The compilation engine. Takes an intent and a project root, runs a deterministic pipeline (classify, select, guard, transform, compress, assemble), and returns compiled context. The pipeline handles every compilation scenario — session start, per-prompt, per-subagent, pre-compaction — identically. It doesn't know or care who called it.

**2. Integration Layer (per-editor)** — Thin adapters that ensure the core pipeline runs at the right time and delivers its output to the model. Each editor exposes different hook capabilities, so each integration layer calls `aic_compile` at different points in the editor's lifecycle.

**What this means:** AIC's compilation capabilities are complete. Any perceived limitation in what AIC "can do" is actually a limitation of the editor's hook system — whether the editor gives AIC the opportunity to run at a given moment. Because AIC follows SOLID principles (dependency injection, interface segregation), adding a new integration layer for a new editor means writing thin hook scripts that call the same core pipeline. No core changes needed.

---

## What AIC needs from an editor

For full AIC integration, an editor should expose these hook capabilities:

| Capability                             | What it enables                                                                        | Required?    |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
| **Session start + context injection**  | Compile context once and inject into the conversation. Model starts with curated code. | Recommended  |
| **Per-prompt + context injection**     | Compile intent-specific context on every user message. Adapts to topic changes.        | Ideal        |
| **Pre-tool-use gating**                | Block tool calls until `aic_compile` runs. Enforces compilation on tool-using turns.   | Recommended  |
| **Subagent start + context injection** | Inject compiled context when subagents spawn. Closes the biggest agentic gap.          | Ideal        |
| **Session end**                        | Log session lifecycle for telemetry.                                                   | Nice to have |
| **Pre-compaction**                     | Re-compile before context window compaction. Preserves quality during long sessions.   | Nice to have |
| **Trigger rule**                       | Text instruction asking the model to call `aic_compile`. Minimum viable integration.   | Minimum      |

No editor has a complete AIC integration for all of these yet. But the core pipeline is ready for all of them — the only variable is which hooks the editor provides and whether AIC's integration layer has been built for them.

---

## Editor hook coverage and integration status

**Integrated** = editor exposes the hook and AIC's integration is built. **Hook available** = editor exposes the hook but AIC integration is not yet built. **—** = editor does not expose this hook.

| Capability                         | Cursor                         | Claude Code    |
| ---------------------------------- | ------------------------------ | -------------- |
| Session start + context injection  | Integrated                     | Hook available |
| Per-prompt + context injection     | —                              | Hook available |
| Pre-tool-use gating                | Integrated                     | Hook available |
| Subagent start + context injection | —                              | Hook available |
| Subagent start (gating only)       | Hook available                 | —              |
| Session end                        | Integrated                     | Hook available |
| Pre-compaction                     | Hook available (observational) | Hook available |
| Trigger rule                       | Integrated                     | Hook available |

Cursor exposes sessionEnd, preCompact, subagentStart (gating only — no context injection), stop, afterFileEdit, and others (see cursor.com/docs/agent/hooks). AIC uses sessionEnd (Task 110), stop and afterFileEdit (Task 111) where implemented. Cursor has the most mature AIC integration. Claude Code's hook system covers all 7 capabilities, but the integration layer is not yet built — making it the highest-impact target for future work.

---

## Cursor Integration

AIC's integration layer currently targets **Cursor**, which has the most mature integration for context injection and tool gating.

### What the Cursor integration does

Cursor exposes sessionEnd, preCompact, subagentStart (gating only), subagentStop, postToolUse, postToolUseFailure, stop, afterAgentResponse, afterAgentThought (see cursor.com/docs/agent/hooks). AIC uses sessionEnd (Task 110), stop and afterFileEdit tracking (Task 111) where implemented.

| Hook               | What happens                                                                                                                                                                      | When                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Session start**  | AIC compiles context with your project's current state and injects it into the conversation's system prompt. The model starts every session with a curated view of your codebase. | Once, when you open a new chat |
| **Prompt capture** | Records your message so the compilation can be targeted to your specific intent                                                                                                   | Every time you send a message  |
| **Tool gate**      | Ensures the model calls `aic_compile` before using other tools, so it always has compiled context rather than reading raw files                                                   | Before each tool call          |
| **Edit tracking**  | Records which files the agent edits during the session                                                                                                                            | After each file edit           |
| **Stop check**     | Runs ESLint and TypeScript type-checking on all files edited during the session, and reports errors for the agent to fix                                                          | When the agent finishes        |

Note: this table lists all hooks in the Cursor integration, including operational hooks (prompt capture, edit tracking, stop check) that are not compilation capabilities. The coverage table above focuses on compilation-relevant capabilities only. Prompt capture records the user's intent for use in the next compilation — it does not compile and inject context on every prompt (that would require per-prompt context injection, which Cursor does not expose).

### The value of session-start context

When AIC compiles context at session start, it selects the most relevant files from your codebase and compresses them into a token-efficient representation. This compiled context persists for the entire conversation, meaning:

- The model starts with a curated understanding of your codebase from the first message
- It doesn't need to spend tokens reading raw files to orient itself
- File selection is algorithmic and deterministic, not dependent on the model's guesswork
- Security scanning (Context Guard) runs before any code reaches the model

Even if AIC doesn't compile every subsequent prompt in the conversation (that depends on the agent's behavior and the tool gate), the initial compilation provides a foundation that benefits every turn.

---

## Editor-specific integration gaps

Each editor exposes a different subset of the hook capabilities AIC can use. Gaps in one editor may not exist in another:

- **Cursor** supports sessionEnd and preCompact as hooks (AIC uses sessionEnd; preCompact is observational only — no context injection). Cursor does not support per-prompt context injection or subagent context injection; subagentStart is gating only (no additional_context). AIC can inject compiled context at session start and enforce compilation via tool gating, but text-only turns and subagent spawns bypass AIC for context injection.
- **Claude Code** supports all hook capabilities AIC needs (including per-prompt and subagent injection), but the integration layer is not yet built.
- **Other editors** without hooks rely solely on the trigger rule, which is suggestive — the model may or may not call `aic_compile`.
