# Session lifecycle flow per editor

This document describes the end-to-end session lifecycle for the AIC integration layer: session start, context compilation or marker checks, and session end cleanup. It covers Cursor and Claude Code only. Event names follow each editor's API (Cursor: camelCase; Claude Code: PascalCase). For hook registration, input fields, and deployment, see [Cursor integration layer](cursor-integration-layer.md) and [Claude Code integration layer](claude-code-integration-layer.md).

## Table of contents

- [Cursor](#cursor)
- [Claude Code](#claude-code)
- [Cross-references](#cross-references)

---

## Cursor

**Cursor** does not use marker or lock files. Session context is injected at session start via two hooks; session end cleans up temp files and appends one line to `session-log.jsonl`.

**sessionStart:** Two hooks run in order. `AIC-session-init.cjs` reads the Critical reminders section from the AIC-architect rule and injects it as `additional_context`. `AIC-compile-context.cjs` calls `aic_compile` via JSON-RPC with a fixed intent, then injects the compiled context as `additional_context` and `env` (e.g. `AIC_PROJECT_ROOT`, `AIC_CONVERSATION_ID`). There is no lock or marker; each session start runs both hooks.

**sessionEnd:** `AIC-session-end.cjs` runs once. The hook removes AIC temp files in `os.tmpdir()` whose names start with `aic-gate-`, `aic-deny-`, or `aic-prompt-`, then appends one JSONL line to `.aic/session-log.jsonl` with fields `session_id`, `reason`, `duration_ms`, and `timestamp` (when the project root and `.aic` exist).

```mermaid
sequenceDiagram
  participant Editor as Cursor
  participant Init as AIC-session-init.cjs
  participant Compile as AIC-compile-context.cjs
  participant MCP as MCP server
  participant End as AIC-session-end.cjs

  Editor->>Init: sessionStart (stdin)
  Init->>Editor: additional_context
  Editor->>Compile: sessionStart (stdin)
  Compile->>MCP: aic_compile (JSON-RPC)
  MCP-->>Compile: compiledPrompt
  Compile->>Editor: additional_context + env

  Note over Editor,End: ... conversation ...

  Editor->>End: sessionEnd (stdin)
  End->>End: cleanup aic-gate-*, aic-deny-*, aic-prompt-*
  End->>End: append .aic/session-log.jsonl
```

---

## Claude Code

**Claude Code** uses two files under `.aic/` to coordinate session lifecycle: `.session-start-lock` (atomic lock to prevent concurrent SessionStart compilations) and `.session-context-injected` (marker written after a successful SessionStart, read by UserPromptSubmit to decide whether to skip invariant injection).

**SessionStart:** The hook (or plugin script) creates `.aic/` with mode `0o700` if missing, then acquires an atomic lock by opening `.session-start-lock` with `fs.openSync(path, "wx")`. If the lock already exists, it checks `.session-context-injected`; if that file has content (a prior run succeeded), it removes the stale lock and returns without compiling. Otherwise it returns without compiling. On successful lock acquisition, it calls `aic_compile`, writes `sessionId` to `.session-context-injected`, returns the compiled context, then releases the lock by deleting `.session-start-lock`.

**UserPromptSubmit (prompt-compile):** The hook reads `.session-context-injected`. If the file exists and its trimmed content equals the current `sessionId`, it treats context as already injected and skips prepending invariants. Otherwise it calls `aic_compile` and prepends the invariants.

**SessionEnd:** The hook appends one JSONL line to `.aic/prompt-log.jsonl` (fields: `sessionId`, `reason`, `timestamp`), then deletes `.session-context-injected` and a temp edited-files path. Cleanup of the lock file differs by deployment:

- **Hooks deployment** (`integrations/claude/hooks/aic-session-end.cjs`): deletes `.aic/.session-start-lock`.
- **Plugin deployment** (`integrations/claude/plugin/scripts/aic-session-end.cjs`): deletes `.aic/.current-conversation-id` instead of `.session-start-lock`.

For integration maintainers: this divergence is unresolved; the intended behavior is under investigation.

```mermaid
sequenceDiagram
  participant Editor as Claude Code
  participant Start as aic-session-start.cjs
  participant Prompt as aic-prompt-compile.cjs
  participant MCP as MCP server
  participant End as aic-session-end.cjs

  Editor->>Start: SessionStart (stdin)
  Start->>Start: mkdir .aic (0o700)
  Start->>Start: openSync(.session-start-lock, wx)
  Start->>MCP: aic_compile (via helper)
  MCP-->>Start: compiledPrompt
  Start->>Start: writeFileSync(.session-context-injected, sessionId)
  Start->>Start: unlink .session-start-lock
  Start->>Editor: hookSpecificOutput (additionalContext)

  Editor->>Prompt: UserPromptSubmit (stdin)
  Prompt->>Prompt: read .session-context-injected
  alt markerContent === sessionId
    Prompt->>Editor: (skip invariants)
  else
    Prompt->>MCP: aic_compile
    MCP-->>Prompt: compiledPrompt
    Prompt->>Editor: invariants + context
  end

  Note over Editor,End: ... conversation ...

  Editor->>End: SessionEnd (stdin)
  End->>End: append .aic/prompt-log.jsonl
  End->>End: unlink .session-context-injected
  End->>End: unlink .session-start-lock (hooks) or .current-conversation-id (plugin)
  End->>End: unlink temp edited-files
```

---

## Cross-references

| Document                                                             | Use                                                               |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [cursor-integration-layer.md](cursor-integration-layer.md)           | sessionStart (§6.1, §7.1), sessionEnd (§6.8, §7.9), hook layout   |
| [claude-code-integration-layer.md](claude-code-integration-layer.md) | SessionStart, UserPromptSubmit, SessionEnd, hook protocol         |
| [mvp-progress.md](tasks/progress/mvp-progress.md)                    | Target state after session lifecycle refactoring (shared modules) |
