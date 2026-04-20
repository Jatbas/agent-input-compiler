# Best Practices for AI-Assisted Coding with AIC

These are best practices for getting the most out of AI-assisted coding. **AIC** (AI Context Compiler) amplifies them by supplying task-focused context — files and rules chosen for the current task.

> This doc assumes AIC is installed and enabled; see [Installation](installation.md) for setup, MCP approval, and troubleshooting. Terms are in the [Glossary](#glossary).

---

## Glossary

| Term                    | Definition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AIC**                 | AI Context Compiler — compiles project code and rules into task-focused context for the AI assistant. See [Architecture](architecture.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Compilation**         | Classifying your intent, selecting relevant files, and assembling context. **Claude Code** runs compilation on session start, on every user message (UserPromptSubmit hook), and before compaction (PreCompact). **Cursor** injects compiled context at session start; on later turns the assistant should call the `aic_compile` MCP tool (project rules reinforce this), and preToolUse enforces `aic_compile` before other tools via per-generation marker, default 300s recency fallback (`compileRecencyWindowSecs` in `aic.config.json` overrides), and a sibling-race poll before deny (no strike limit) unless the emergency bypass is active (both `devMode` and `skipCompileGate` true in `aic.config.json`). See [Architecture](architecture.md) and [installation.md](installation.md).                                                                                                                                                                                        |
| **Compiled context**    | Output of compilation: files, rules, and metadata for the assistant. **Cursor** injects the initial bulk at session start. **Claude Code** can refresh it each user message via hooks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Context window**      | The fixed-size input the model sees — your messages plus any injected content. When it fills up, the editor may compact (summarize) earlier content.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Context Guard**       | Strips secrets and excluded paths from **AIC-compiled** bulk context only. It does not limit what the assistant reads through normal editor file tools. See [Architecture](architecture.md) and [Security](security.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Session-start hooks** | Scripts the editor runs when a new chat begins. AIC uses them for the first compile and injection where the editor supports it. **Claude Code** also compiles on every user message via a separate hook path. See [Installation](installation.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Tool gate**           | **Cursor:** preToolUse (`AIC-require-aic-compile.cjs`) enforces `aic_compile` before other tools via per-generation marker, default 300s recency fallback (`compileRecencyWindowSecs` overrides), and a sibling-race poll before deny (no strike limit) unless the emergency bypass is active (both `devMode` and `skipCompileGate` true in `aic.config.json`). **Claude Code:** `UserPromptSubmit` drives compilation on each user message; an additional unmatched PreToolUse hook (`aic-pre-tool-gate.cjs`) blocks other tools until compile recency or per-turn markers pass, with the same poll behavior before deny ([Cursor §7.3](technical/cursor-integration-layer.md#73-pretooluse-unmatched--aic_compile-enforcement-gate) defines the shared rationale). Text-only turns skip PreToolUse when no tool calls fire. See [cursor-integration-layer.md](technical/cursor-integration-layer.md) and [claude-code-integration-layer.md](technical/claude-code-integration-layer.md). |
| **PreCompact**          | A hook (in Claude Code) that runs before the editor compacts the context window, so AIC can re-compile and keep context relevant in long sessions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

## One task, one session

### Why

Dedicate each chat session to a single, focused task. Mixing concerns — "fix the auth bug, then refactor the database layer" — splits the model's attention across unrelated code and fills the context window with files from both tasks. Neither task gets the model's full focus.

LLMs show degraded accuracy when context contains irrelevant information (the ["Lost in the Middle"](https://arxiv.org/abs/2307.03172) effect: models attend less to the middle of long context).

When you finish a task or need to switch topics, start a new session. A new session gives the model a clean context window — no stale variable names, no outdated file contents, no prior reasoning that might conflict with the new task.

### How AIC helps

**Cursor:** A new chat runs session-start compilation so file selection reflects the current tree for the next task.

**Claude Code:** Hooks compile on session start and on every user message; a new chat still clears stale transcript and prior reasoning while the next compile aligns selection to one task. Each compile pass uses the repo as it exists then.

---

## Be specific with your intent

### Why

The more specific your intent, the better the model understands what you need. Vague prompts like "fix the bug" give the model nothing to anchor on — it must guess which files matter.

Name paths, symbols, or behaviors so the assistant can focus without broad exploration that burns tokens.

### How AIC helps

AIC uses your intent to classify the task and select which files to include. A specific intent produces higher-confidence classification and better file scoring — the model sees the right code from the start instead of a broad, unfocused selection.

---

## Keep sessions short

### Why

Long conversations accumulate noise. The model's context window fills with previous messages, tool outputs, and intermediate results.

When the context window reaches capacity, the editor compacts (summarizes) earlier content, and the model loses details from the beginning of the conversation — including AIC's compiled context. Short sessions reduce how often that happens.

### How AIC helps

In a short session, compiled context stays near the start of the window longer.

**Claude Code:** Can re-compile before compaction via the `PreCompact` hook so refreshed context survives compaction better.

**Cursor:** Does not re-inject compiled context on that path (see [Architecture](architecture.md)).

The compiled payload has a hard token ceiling, so its contribution to context window fill is bounded and predictable.

---

## Don't switch models mid-chat

### Why

Changing the assistant model inside the same chat is still one thread.

**Cursor:** Session-start hooks do not run again, so the new model may not see the same system prompt injection as at chat open, and it may not call `aic_compile` before other tools unless rules and the preToolUse gate apply (gate enforcement is always on unless the emergency bypass is active — both `devMode` and `skipCompileGate` true in `aic.config.json`).

**Claude Code:** Your next user message still runs hook-driven compilation, but the thread already contains the prior model's outputs — behavior can feel inconsistent.

### How AIC helps

**Cursor:** After a model switch, open a new chat so session-start compilation runs again and the tool gate can require `aic_compile` before tools.

**Claude Code:** The next message refreshes compiled context via hooks; start a new chat if the thread feels polluted.

---

## Review before accepting

### Why

AI hallucinations happen even with good context. The model might generate plausible-looking code that references APIs that don't exist, uses wrong method signatures, or subtly breaks edge cases.

Better context reduces the frequency of hallucinations but cannot eliminate them — the model is still probabilistic.

### How AIC helps

AIC tightens the hallucination surface by surfacing relevant project code in compiled context.

> Context Guard keeps secrets and excluded paths out of that compiled bulk only; the assistant can still read files through editor tools. See [Security](security.md).

### Still required

> Verify generated changes — run tests, read diffs, and use your team's review process before merging.

---

## See also

- [Installation & Delivery](installation.md) — install steps, prerequisites, verification (including the **show aic …** prompt commands — now including **show aic quality** — which always run the Bash CLI and relay stdout; never the MCP diagnostic tools — plus the MCP-only **run aic model test** probe), and troubleshooting when hooks or MCP fail.
- [Architecture](architecture.md) — how AIC compiles context and how Cursor vs Claude Code differ.
- [Security](security.md) — Context Guard scope, secrets, and telemetry.
- [Cursor integration layer](technical/cursor-integration-layer.md) — session start, preToolUse gate, and Cursor-specific limits.
- [Claude Code integration layer](technical/claude-code-integration-layer.md) — UserPromptSubmit, PreCompact, and Claude-specific behavior.
