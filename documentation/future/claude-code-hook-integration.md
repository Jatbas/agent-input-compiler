# Claude Code Hook-Based Context Delivery

> **Status:** Planned (Phase R in `mvp-progress.md`)
> **Target:** Phase 1.0
> **Prep done:** `TRIGGER_SOURCE.HOOK` added to `shared/src/core/types/enums.ts`
> **Tracked as:** Phase R (was Phase Q before Phase Q research-backed upgrades inserted)

## Problem

AIC currently delivers compiled context via an MCP tool (`aic_compile`) that Claude must remember to call on every message. This relies on:

- A trigger rule installed at `.cursor/rules/AIC.mdc` (Cursor) or `CLAUDE.md` (Claude Code)
- A reinforcement message appended to every compilation result
- The model's willingness to follow instructions

This is fragile. Models can skip the call, "remember" stale context, or decide they already have enough context. The trigger rule consumes tokens on every message even when it works perfectly.

## Solution

Claude Code's hook system provides `UserPromptSubmit` — a lifecycle event that fires before Claude processes every user message. A hook can return `additionalContext` that Claude sees as part of the conversation context.

AIC registers a `UserPromptSubmit` hook that:

1. Receives the user's raw prompt (JSON on stdin)
2. Extracts `prompt` as the intent and `cwd` as the project root
3. Runs the same `CompilationRunner` pipeline used by the MCP tool
4. Returns compiled context as `additionalContext` (JSON on stdout)
5. Exits 0

This makes context injection invisible, automatic, and 100% reliable — no trigger rule needed for Claude Code.

## Architecture

### New package: `hooks/`

```
hooks/
  package.json            # @aic/hooks, depends on @aic/shared
  tsconfig.json
  src/
    compile-hook.ts       # Main entrypoint (stdin → pipeline → stdout)
    parse-hook-input.ts   # Parse Claude Code UserPromptSubmit JSON
    format-hook-output.ts # Format hookSpecificOutput JSON
```

The hook is a short-lived Node process (not a long-running server). It starts, compiles, writes output, and exits. The MCP server remains for Cursor and other MCP clients.

### Reuse

The hook calls the same code the MCP handler calls:

- `createProjectScope()` — opens `.aic/` SQLite, creates stores
- `createFullPipelineDeps()` — wires the compilation pipeline
- `CompilationRunner.run()` — classifies intent, selects files, guards, transforms, assembles

No pipeline changes needed. Only the stdin/stdout adapter layer is new.

### Hook installer

Extend the MCP server's startup to also install Claude Code hooks when it detects a Claude Code environment (via `detectEditorId`).

**Target file:** `.claude/settings.local.json` (gitignored, per-developer — because the hook command contains an absolute path to the AIC installation).

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/aic/hooks/dist/compile-hook.js",
            "timeout": 15
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/aic/hooks/dist/session-start-hook.js"
          }
        ]
      }
    ]
  }
}
```

### Telemetry

Hook-triggered compilations use `TRIGGER_SOURCE.HOOK` (already added to enums). This allows comparing reliability and performance between hook-based and MCP-tool-based delivery in telemetry data.

## Additional hooks

### SessionStart (high value)

Inject lightweight project metadata when Claude Code starts a session:

- AIC version
- Project structure summary (file count, languages detected)
- Last compilation stats (from `compilation_log` table)
- Architectural reminders (from project rule packs)

No intent is available yet, so this is not a full compilation — just bootstrapping context.

### SubagentStart (medium value)

Inject AIC-compiled context into subagents, which lose parent context. The hook receives `agent_type` and can tailor the injection (e.g., lighter context for `Explore` agents, full context for `Plan` agents).

### Stop (low value, future)

After Claude finishes responding, persist a compilation summary for the next session to bootstrap faster.

## Coexistence with MCP

Both delivery mechanisms coexist:

| Scenario                          | Behavior                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Hook active + MCP tool called     | Hook runs first (UserPromptSubmit fires before tool use). MCP call becomes a cache hit — near-zero cost. |
| Hook active + MCP tool not called | Context delivered via hook. Trigger rule unnecessary.                                                    |
| Hook not active (Cursor)          | Falls back to MCP tool + trigger rule. Current behavior.                                                 |
| Both absent                       | No context delivered. AIC not installed.                                                                 |

The trigger rule (`AIC.mdc`) remains for Cursor. For Claude Code, the hook installer can skip or soften the trigger rule since the hook handles delivery.

## Performance considerations

The hook spawns a new Node process per user message. Key concerns:

| Concern                                           | Mitigation                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cold start (pipeline init, tiktoken, SQLite open) | Pre-compiled JS (not tsx). Target <500ms.                                                                                |
| File tree scan on every message                   | SQLite `CacheStore` persists across processes. Most compilations are cache hits.                                         |
| In-memory cache lost between invocations          | `createCachingFileContentReader` cache is per-process. Acceptable — file reads are fast, heavy work is cached in SQLite. |
| Large repos exceeding timeout                     | 15-second timeout with headroom. Benchmark needed on 1000+ file repos.                                                   |

## Known blockers

- **PostToolUse additionalContext bug (anthropics/claude-code#24788):** `additionalContext` does not work for MCP tool calls in PostToolUse hooks. Does NOT affect the `UserPromptSubmit` approach, but limits future PostToolUse-based augmentation.
- **Hooks API stability:** The hooks system is actively evolving. Hook configuration schema could change.
- **Cursor has no hooks:** This feature only benefits Claude Code users until Cursor adds equivalent lifecycle hooks.

## Implementation steps

| Step | What                                                     | Effort |
| ---- | -------------------------------------------------------- | ------ |
| 1    | `hooks/package.json` + `tsconfig.json`                   | Small  |
| 2    | `parse-hook-input.ts` — parse stdin JSON                 | Small  |
| 3    | `format-hook-output.ts` — format stdout JSON             | Small  |
| 4    | `compile-hook.ts` — main entrypoint, wires pipeline      | Medium |
| 5    | `session-start-hook.ts` — project metadata injection     | Medium |
| 6    | Hook installer in `mcp/src/install-claude-code-hooks.ts` | Medium |
| 7    | Tests for hook input/output parsing                      | Small  |
| 8    | Integration test: simulated hook invocation              | Medium |
| 9    | Benchmark: cold start time on real repos                 | Small  |

## Research sources

- Claude Code hooks reference: https://code.claude.com/docs/en/hooks
- Memory Tool API: https://docs.claude.com/en/docs/agents-and-tools/tool-use/memory-tool
- PostToolUse bug: https://github.com/anthropics/claude-code/issues/24788
- PostToolUse context injection bug: https://github.com/anthropics/claude-code/issues/18427
