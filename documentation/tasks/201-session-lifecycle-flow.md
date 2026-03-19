# Task 201: Document session lifecycle flow per editor

> **Status:** Pending
> **Phase:** AH (Session Lifecycle Markers Simplification)
> **Layer:** documentation
> **Depends on:** —

## Goal

Create a single reference document that shows the full session lifecycle flow (session start → compile/marker → prompt-compile check → session end cleanup) for Cursor and Claude Code, with sequence diagrams and an explicit note of the Claude Code hooks vs plugin cleanup divergence.

## Architecture Notes

- New document only; no edits to existing integration layer docs in this task.
- Mermaid sequence diagrams per editor; developer-reference tone.
- Cross-reference [cursor-integration-layer.md](../cursor-integration-layer.md) and [claude-code-integration-layer.md](../claude-code-integration-layer.md) for hook details; this doc focuses on end-to-end flow.
- No phase names, task numbers, or temporal milestones in the body.

## Files

| Action | Path |
| ------ | ---- |
| Create | `documentation/session-lifecycle-flow.md` |

## Change Specification

### Change 1: Create new document (full content)

**Current text:**

> (No existing file.)

**Required change:** Create `documentation/session-lifecycle-flow.md` with the following content so integration maintainers have a single reference for session lifecycle flow per editor.

**Target text:**

> # Session lifecycle flow per editor
>
> This document describes the end-to-end session lifecycle for the AIC integration layer: session start, context compilation or marker checks, and session end cleanup. It covers Cursor and Claude Code only. For hook registration, input fields, and deployment, see [Cursor integration layer](cursor-integration-layer.md) and [Claude Code integration layer](claude-code-integration-layer.md).
>
> ## Table of contents
>
> - [Cursor](#cursor)
> - [Claude Code](#claude-code)
> - [Cross-references](#cross-references)
>
> ---
>
> ## Cursor
>
> **Cursor** does not use marker or lock files. Session context is injected at session start via two hooks; session end cleans up temp files and appends one line to `session-log.jsonl`.
>
> **sessionStart:** Two hooks run in order. `AIC-session-init.cjs` reads the Critical reminders section from the AIC-architect rule and injects it as `additional_context` plus `env` (e.g. `AIC_PROJECT_ROOT`, `AIC_CONVERSATION_ID`). `AIC-compile-context.cjs` calls `aic_compile` via JSON-RPC with a fixed intent, then injects the compiled context as `additional_context`. There is no lock or marker; each session start runs both hooks.
>
> **sessionEnd:** `AIC-session-end.cjs` runs once. It removes AIC temp files in `os.tmpdir()` whose names start with `aic-gate-`, `aic-deny-`, or `aic-prompt-`. It then appends one JSONL line to `.aic/session-log.jsonl` with fields `session_id`, `reason`, `duration_ms`, and `timestamp` (when the project root and `.aic` exist).
>
> ```mermaid
> sequenceDiagram
>   participant Editor as Cursor
>   participant Init as AIC-session-init.cjs
>   participant Compile as AIC-compile-context.cjs
>   participant MCP as MCP server
>   participant End as AIC-session-end.cjs
>
>   Editor->>Init: sessionStart (stdin)
>   Init->>Editor: additional_context + env
>   Editor->>Compile: sessionStart (stdin)
>   Compile->>MCP: aic_compile (JSON-RPC)
>   MCP-->>Compile: compiledPrompt
>   Compile->>Editor: additional_context
>
>   Note over Editor,End: ... conversation ...
>
>   Editor->>End: sessionEnd (stdin)
>   End->>End: cleanup aic-gate-*, aic-deny-*, aic-prompt-*
>   End->>End: append .aic/session-log.jsonl
> ```
>
> ---
>
> ## Claude Code
>
> **Claude Code** uses two files under `.aic/` to coordinate session lifecycle: `.session-start-lock` (atomic lock to prevent concurrent SessionStart compilations) and `.session-context-injected` (marker written after a successful SessionStart, read by UserPromptSubmit to decide whether to skip invariant injection).
>
> **SessionStart:** The hook (or plugin script) creates `.aic/` with mode `0o700` if missing, then acquires an atomic lock by opening `.session-start-lock` with `fs.openSync(path, "wx")`. If the lock already exists, it checks `.session-context-injected`; if that file has content (a prior run succeeded), it removes the stale lock and returns without compiling. Otherwise it waits/returns. On successful lock acquisition, it calls `aic_compile`, writes `sessionId` to `.session-context-injected`, returns the compiled context, then releases the lock by deleting `.session-start-lock`.
>
> **UserPromptSubmit (prompt-compile):** The hook reads `.session-context-injected`. If the file exists and its trimmed content equals the current `sessionId`, it treats context as already injected and skips prepending invariants. Otherwise it calls `aic_compile` and prepends the invariants.
>
> **SessionEnd:** The hook appends one JSONL line to `.aic/prompt-log.jsonl` (fields: `sessionId`, `reason`, `timestamp`). It then deletes `.session-context-injected` and a temp edited-files path. Cleanup of the lock file differs by deployment:
>
> - **Hooks deployment** (`integrations/claude/hooks/aic-session-end.cjs`): deletes `.aic/.session-start-lock`.
> - **Plugin deployment** (`integrations/claude/plugin/scripts/aic-session-end.cjs`): deletes `.aic/.current-conversation-id` instead of `.session-start-lock`.
>
> This divergence is unresolved; the intended behavior is under investigation.
>
> ```mermaid
> sequenceDiagram
>   participant Editor as Claude Code
>   participant Start as aic-session-start.cjs
>   participant Prompt as aic-prompt-compile.cjs
>   participant MCP as MCP server
>   participant End as aic-session-end.cjs
>
>   Editor->>Start: SessionStart (stdin)
>   Start->>Start: mkdir .aic (0o700)
>   Start->>Start: openSync(.session-start-lock, wx)
>   Start->>MCP: aic_compile (via helper)
>   MCP-->>Start: compiledPrompt
>   Start->>Start: writeFileSync(.session-context-injected, sessionId)
>   Start->>Start: unlink .session-start-lock
>   Start->>Editor: hookSpecificOutput (additionalContext)
>
>   Editor->>Prompt: UserPromptSubmit (stdin)
>   Prompt->>Prompt: read .session-context-injected
>   alt markerContent === sessionId
>     Prompt->>Editor: (skip invariants)
>   else
>     Prompt->>MCP: aic_compile
>     MCP-->>Prompt: compiledPrompt
>     Prompt->>Editor: invariants + context
>   end
>
>   Note over Editor,End: ... conversation ...
>
>   Editor->>End: SessionEnd (stdin)
>   End->>End: append .aic/prompt-log.jsonl
>   End->>End: unlink .session-context-injected
>   End->>End: unlink .session-start-lock (hooks) or .current-conversation-id (plugin)
>   End->>End: unlink temp edited-files
> ```
>
> ---
>
> ## Cross-references
>
> | Document | Use |
> | -------- | --- |
> | [cursor-integration-layer.md](cursor-integration-layer.md) | sessionStart (§6.1, §7.1), sessionEnd (§6.8, §7.9), hook layout |
> | [claude-code-integration-layer.md](claude-code-integration-layer.md) | SessionStart, UserPromptSubmit, SessionEnd, hook protocol |
> | [mvp-progress.md](mvp-progress.md) | Target state after session lifecycle refactoring (shared modules) |

## Writing Standards

- **Tone:** Developer reference — precise, technical. Match cursor-integration-layer and claude-code-integration-layer.
- **Audience:** Integration maintainers and contributors implementing or refactoring session lifecycle logic.
- **Terminology:** Use `sessionStart` / `sessionEnd` for Cursor (camelCase as in Cursor docs); use `SessionStart` / `SessionEnd` / `UserPromptSubmit` for Claude Code (PascalCase as in Claude Code docs). Marker file: `.session-context-injected`. Lock file: `.session-start-lock`. Do not use phase names or task identifiers in the body.
- **Formatting:** Mermaid code blocks for sequence diagrams; bold **Cursor** / **Claude Code** for section intros; table for cross-references only.
- **Cross-reference format:** Relative markdown links to sibling docs; link text describes the target (e.g. "Cursor integration layer").

## Cross-Reference Map

| Document | References this doc | This doc references |
| -------- | ------------------- | -------------------- |
| `cursor-integration-layer.md` | Optional — "See also" link | Yes — sessionStart, sessionEnd |
| `claude-code-integration-layer.md` | Optional — "See also" link | Yes — SessionStart, UserPromptSubmit, SessionEnd |
| `mvp-progress.md` | No | Yes — target state (refactoring) |

## Config Changes

- None.

## Steps

### Step 1: Create session lifecycle flow document

Create `documentation/session-lifecycle-flow.md` with the exact content from the Change Specification target text (Change 1). Preserve line breaks and structure. Include the Table of Contents, both editor sections with narratives and Mermaid diagrams, and the Cross-references table.

**Verify:** File exists; `head -5 documentation/session-lifecycle-flow.md` shows the title and TOC.

### Step 2: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm knip` (no new code; knip may report nothing for docs). Grep the new file for temporal references: `grep -n -E 'Phase [A-Z]|AH0[0-9]|task [0-9]+|will be added|in the next' documentation/session-lifecycle-flow.md`. Expected: no matches (or only "under investigation" in context, not as a phase/task reference).

## Tests

| Test case | Description |
| --------- | ----------- |
| (none) | Documentation task; verification is file existence and grep for temporal refs. |

## Acceptance Criteria

- [ ] `documentation/session-lifecycle-flow.md` created with content per Change Specification
- [ ] Document has title, TOC, Cursor section (narrative + Mermaid), Claude Code section (narrative + Mermaid + divergence callout), Cross-references table
- [ ] No phase names, task numbers, or "will be added" / "in the next phase" in body
- [ ] Links to cursor-integration-layer.md and claude-code-integration-layer.md use correct relative paths
- [ ] Mermaid blocks are valid (syntax check or render in viewer)
- [ ] `pnpm lint` passes

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
