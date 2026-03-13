# Installation & Delivery

How AIC gets installed, what artifacts it creates, and how its components interact across editors and environments.

## Table of Contents

- [AIC Server](#aic-server)
  - [What Gets Published](#what-gets-published)
  - [First-Compile Bootstrap](#first-compile-bootstrap)
  - [Per-Project Artifacts](#per-project-artifacts)
  - [Per-Project Disable](#per-project-disable)
  - [Server Scope](#server-scope)
  - [Version Updates](#version-updates)
  - [Known Gap: Cursor Hooks Fire When Disabled](#known-gap-cursor-hooks-fire-when-disabled)
- [Cursor](#cursor)
  - [One-Click Install (Deeplink)](#one-click-install-deeplink)
  - [What the Deeplink Does](#what-the-deeplink-does)
  - [Trigger Rule](#trigger-rule)
  - [Hooks](#hooks)
  - [Hook Lifecycle](#hook-lifecycle)
  - [How Hooks Are Delivered](#how-hooks-are-delivered)
- [Claude Code](#claude-code)
  - [Global Installation (Zero-Intervention)](#global-installation-zero-intervention)
  - [Trigger Rule](#trigger-rule-1)
  - [Hooks](#hooks-1)
  - [Hook Lifecycle](#hook-lifecycle-1)
  - [How Hooks Are Delivered](#how-hooks-are-delivered-1)
- [AIC Development Environment](#aic-development-environment)
- [Uninstall](#uninstall)

---

## AIC Server

### What Gets Published

The npm package `@jatbas/aic` ships:

- `dist/` — the compiled MCP server (`server.js` with shebang for `npx` execution)
- `hooks/` — integration hook scripts (`.cjs` files) bundled for auto-installation into user projects (currently Cursor; Claude Code hooks ship in Phase T)

The server is the primary interface. It exposes these MCP tools:

| Tool               | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `aic_compile`      | Compile context for the current AI message      |
| `aic_inspect`      | Inspect a previous compilation                  |
| `aic_status`       | Project-level status and compilation aggregates |
| `aic_last`         | Most recent compilation details                 |
| `aic_chat_summary` | Per-conversation compilation stats              |
| `aic_projects`     | List all known AIC projects                     |

The four prompt commands ("show aic status", "show aic last", "show aic chat summary", "show aic projects") map directly to tools. The AI calls them by name — no editor-specific server identifiers needed.

### First-Compile Bootstrap

On the first `aic_compile` call for a new project, `ensureProjectInit` runs:

1. Creates `.aic/` directory with `0700` permissions
2. Generates a stable UUIDv7 project ID in `.aic/project-id`
3. Writes `aic.config.json` with defaults (`contextBudget.maxTokens: 8000`)
4. Adds `.aic/` to `.gitignore`, `.eslintignore`, `.prettierignore`
5. Installs the trigger rule (editor-specific — e.g., `.cursor/rules/AIC.mdc` for Cursor, `.claude/CLAUDE.md` for Claude Code)
6. Installs per-project artifacts (editor-specific — see the [Cursor](#cursor) and [Claude Code](#claude-code) sections)

Steps 5 and 6 are idempotent. If the trigger rule or artifacts already exist, they are merged (new entries added, existing entries preserved).

After bootstrap, the server compiles context normally. Subsequent calls skip bootstrap entirely (guarded by a per-project once-flag in the compile handler).

### Per-Project Artifacts

After bootstrap, each project contains:

| Path                      | Purpose                                                      | Committed to git?          |
| ------------------------- | ------------------------------------------------------------ | -------------------------- |
| `aic.config.json`         | Project configuration (budget, guard, cache, telemetry)      | Yes                        |
| `.aic/`                   | AIC data directory (DB, cache, project-id)                   | No (auto-gitignored)       |
| `.aic/project-id`         | Stable UUIDv7 — survives folder renames                      | No                         |
| `.cursor/rules/AIC.mdc`   | Trigger rule for Cursor — tells the AI to call `aic_compile` | Depends on team preference |
| `.cursor/hooks.json`      | Hook registrations for Cursor                                | Depends on team preference |
| `.cursor/hooks/AIC-*.cjs` | Cursor hook scripts — auto-bootstrapped per project          | Depends on team preference |
| `.claude/CLAUDE.md`       | Trigger rule for Claude Code (Phase T)                       | Depends on team preference |

Note: Claude Code's hook scripts are installed globally in `~/.claude/hooks/` (not per-project) and registered in `~/.claude/settings.json`. Only the trigger rule `.claude/CLAUDE.md` is a per-project artifact for Claude Code.

The database lives globally at `~/.aic/aic.sqlite` (per Phase W). Per-project data is isolated via a `project_id` foreign key.

### Per-Project Disable

Set `"enabled": false` in `aic.config.json`:

```json
{
  "enabled": false
}
```

When disabled:

- `aic_compile` returns early with a message: "AIC is disabled for this project."
- No data is written to the database
- `show aic status` shows "Disabled" for this project

Default is `true` (omitted means enabled).

### Server Scope

AIC is a **global** MCP server — it registers once per user and serves every project without per-project installation:

| Editor          | Global config file                    | Install method                             |
| --------------- | ------------------------------------- | ------------------------------------------ |
| **Cursor**      | `~/.cursor/mcp.json`                  | One-click deeplink (see [Cursor](#cursor)) |
| **Claude Code** | `~/.claude.json` (`mcpServers` field) | `npx @aic/mcp init` (Phase U)              |

There is no per-project or workspace-scoped server installation for end users. The global server handles every project automatically via the first-compile bootstrap.

The only workspace-scoped server is the AIC development environment, which runs from TypeScript source instead of the published npm package. See [AIC Development Environment](#aic-development-environment) for details.

W10 detects when AIC is registered in both global and workspace configs (the dev scenario) and emits a warning to stderr and in the `aic_status` tool payload.

### Version Updates

AIC is installed with `@latest`, so `npx` fetches the newest published version on each editor launch. When a new version includes updated hook scripts:

- **Cursor:** Scripts are re-copied into the project's `.cursor/hooks/` on the next bootstrap run. This is automatic — no manual update step.
- **Claude Code:** Scripts are re-copied into `~/.claude/hooks/` on the next `npx @aic/mcp init` or first-compile bootstrap. Global hook settings in `~/.claude/settings.json` are re-merged to add any new entries.

### Known Gap: Cursor Hooks Fire When Disabled

Setting `"enabled": false` in `aic.config.json` makes the MCP server return early, but **Cursor hooks** still fire because Cursor invokes them independently of the MCP server. The practical impact is minimal — hooks run but `aic_compile` returns immediately — though each invocation still pays a small process-spawn cost. A future improvement could have hook scripts check `aic.config.json` directly and exit early.

This does not affect Claude Code, whose hooks are global and invoke the MCP server directly.

---

## Cursor

### One-Click Install (Deeplink)

The primary installation method for Cursor users. A deeplink URL registers AIC in the global MCP config:

```
cursor://anysphere.cursor-deeplink/mcp/install?name=aic&config=<base64>
```

The base64 payload decodes to:

```json
{ "command": "npx", "args": ["-y", "@jatbas/aic@latest"] }
```

The install page is hosted at `install/cursor-install.html`. It redirects to the deeplink automatically and falls back to the GitHub repo after 1.5 seconds.

### What the Deeplink Does

The deeplink writes the entry above into `~/.cursor/mcp.json`. This is the **only** thing the install step does. Everything else happens automatically on first use:

1. User opens any project in Cursor
2. Cursor spawns the AIC MCP server process (`npx -y @jatbas/aic@latest`)
3. If Cursor advertises workspace roots (`roots/list_changed`), the server proactively bootstraps each root — installing the trigger rule and hooks before any AI message is sent
4. Otherwise, bootstrap runs on the first `aic_compile` call (see [First-Compile Bootstrap](#first-compile-bootstrap))
5. Bootstrap creates `aic.config.json`, `.aic/`, trigger rule, hooks — all inside the project directory
6. From this point on, every AI message in this project gets compiled context

No per-project install step is needed. The global server auto-bootstraps each new project.

### Trigger Rule

On bootstrap, AIC creates `.cursor/rules/AIC.mdc` with `alwaysApply: true`. This rule instructs the AI to call `aic_compile` as its first action on every message. The rule is the primary mechanism that makes the AI call AIC.

The trigger rule is suggestive — compliance depends on the model. Hooks provide stronger enforcement (see below).

If `.cursor/rules/AIC.mdc` already exists, AIC does not overwrite it.

### Hooks

AIC installs 10 Cursor hooks that provide lifecycle integration beyond what the trigger rule can achieve:

| Hook                              | Cursor Event           | Purpose                                                              |
| --------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `AIC-session-init.cjs`            | `sessionStart`         | Injects architectural invariants as `additional_context`             |
| `AIC-compile-context.cjs`         | `sessionStart`         | Pre-compiles context so it's ready for the first message             |
| `AIC-before-submit-prewarm.cjs`   | `beforeSubmitPrompt`   | Prewarms the compile cache before the AI responds                    |
| `AIC-require-aic-compile.cjs`     | `preToolUse`           | Blocks all tools until `aic_compile` has been called (enforcement)   |
| `AIC-inject-conversation-id.cjs`  | `preToolUse`           | Injects `conversationId` and `editorId` into `aic_compile` args      |
| `AIC-post-compile-context.cjs`    | `postToolUse`          | Injects confirmation `additional_context` after successful compile   |
| `AIC-after-file-edit-tracker.cjs` | `afterFileEdit`        | Tracks edited files for quality checks                               |
| `AIC-session-end.cjs`             | `sessionEnd`           | Cleanup and session metrics                                          |
| `AIC-stop-quality-check.cjs`      | `stop`                 | Runs lint/typecheck on edited files; auto-fix via `followup_message` |
| `AIC-block-no-verify.cjs`         | `beforeShellExecution` | Blocks `--no-verify` flag in git commands                            |

### Hook Lifecycle

Hooks run as Cursor spawns them — they are independent processes, not part of the MCP server. Cursor reads `.cursor/hooks.json` and invokes the registered commands at the appropriate lifecycle events.

Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Cursor does.

### How Hooks Are Delivered

Hook scripts are authored in `integrations/cursor/hooks/` and deployed to each project's
`.cursor/hooks/` by the installer. On first-compile bootstrap, `installCursorHooks` performs:

1. **Registers hooks** — creates or merges `.cursor/hooks.json` with the hook definitions (event type, command, matcher, timeout, etc.)
2. **Copies scripts** — copies the 10 `AIC-*.cjs` files from `integrations/cursor/hooks/` into the project's `.cursor/hooks/` directory

The `.cursor/` directory is a **deployment target** — hook scripts are never authored there directly.
On subsequent compilations, merge logic adds any missing hook entries without overwriting user-added hooks. Scripts are re-copied on every bootstrap to stay in sync with the installed AIC version.

---

## AIC Development Environment

The dev server is pre-configured in `.cursor/mcp.json` (checked into the repo as `"aic-dev"`). It runs from TypeScript source and uses hand-maintained hooks that include dev-only extras not present in the published package. No setup is needed — cloning the repo is sufficient.

**The production server must be disabled while developing AIC.** If both run simultaneously, the production server overwrites dev hooks with published versions, the AI sees duplicate `aic_compile` tools, and both write to the same database. Disable the production server in whatever IDE you are using before opening the AIC project.

In Cursor, this means keeping `~/.cursor/mcp.json` empty (or with the `"aic"` entry removed). When you need to use AIC as an end user in another project, add the entry back. Toggle as needed — this is the standard MCP server development workflow.

No `aic.config.json` changes are needed. The `"enabled"` flag would disable both servers since they read the same config file.

---

## Uninstall

GAP — uninstall instructions will be added in a future task.

---

## Claude Code

Phase T (Claude Code Hook-Based Delivery) and Phase U (Claude Code Zero-Install) implement the same zero-intervention architecture as Cursor, mapped to Claude Code's config paths:

### Global Installation (Zero-Intervention)

Like Cursor, AIC is a global MCP server for Claude Code. The install process (`npx @aic/mcp init`) requires zero per-project intervention:

1. **Global MCP Registration:** AIC appends its server definition to the `mcpServers` object in `~/.claude.json`. This makes `aic_compile` available to Claude Code in every directory globally. ([source: MCP scopes — user scope](https://code.claude.com/docs/en/mcp#user-scope))
2. **Global Hook Registration:** AIC merges its 8 hook entries into the `hooks` object in `~/.claude/settings.json`. This ensures the full lifecycle fires for all projects with zero per-project setup. ([source: Hook locations](https://code.claude.com/docs/en/hooks#hook-locations))
3. **Hook Script Deployment:** The `.cjs` scripts are copied into `~/.claude/hooks/`. Hook commands in `settings.json` reference these absolute paths — no project-relative paths needed.

### Trigger Rule

Claude Code supports custom context files. AIC creates `.claude/CLAUDE.md` (or merges into it) during first-compile bootstrap to instruct the model to call `aic_compile`.

### Hooks

Claude Code provides a richer hook lifecycle than Cursor, including the critical `UserPromptSubmit` event.

| Hook                              | Claude Code Event    | Purpose                                                        |
| --------------------------------- | -------------------- | -------------------------------------------------------------- |
| `aic-prompt-compile.cjs`          | `UserPromptSubmit`   | Pre-compiles context for every user message (PRIMARY delivery) |
| `aic-session-start.cjs`           | `SessionStart`       | Injects architectural invariants (with dual-path fallback)     |
| `aic-subagent-inject.cjs`         | `SubagentStart`      | Injects context into Bash, Explore, and Plan subagents         |
| `aic-block-no-verify.cjs`         | `PreToolUse` (Bash)  | Blocks `--no-verify` flag in git commands                      |
| `aic-after-file-edit-tracker.cjs` | `PostToolUse` (Edit) | Tracks edited files for quality checks                         |
| `aic-stop-quality-check.cjs`      | `Stop`               | Runs lint/typecheck on edited files; blocks finish on failure  |
| `aic-pre-compact.cjs`             | `PreCompact`         | Re-compiles context before window compaction                   |
| `aic-session-end.cjs`             | `SessionEnd`         | Cleanup and session metrics                                    |

### Hook Lifecycle

Hooks run as Claude Code spawns them — they are independent processes, not part of the MCP server. Claude Code reads `~/.claude/settings.json` and invokes the registered commands at the appropriate lifecycle events.

Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Claude Code does.

Unlike Cursor's `hooks.json`, Claude Code's settings file is global — it applies to every project the user opens. No per-project hook activation is needed.

### How Hooks Are Delivered

Hook scripts are authored in `integrations/claude/hooks/` and installed **once, globally** by
the installer. This is fundamentally different from Cursor's per-project deployment:

1. `npx @aic/mcp init` copies the 8 `aic-*.cjs` scripts from `integrations/claude/hooks/` into `~/.claude/hooks/`
2. It merges the AIC hook entries into `~/.claude/settings.json` pointing to those absolute paths
3. From this point on, **every project** the user opens with Claude Code automatically gets full AIC hook coverage — no per-project bootstrap step for hooks

The `~/.claude/hooks/` directory is a **deployment target** — hook scripts are never authored there directly. When a new AIC version ships updated hook scripts, re-running `npx @aic/mcp init` re-copies the scripts and re-merges the settings. Any new hook events are appended; existing user hooks are never overwritten.

The trigger rule (`.claude/CLAUDE.md`) is the only per-project artifact for Claude Code — it is still written during first-compile bootstrap.

See `documentation/claude-code-integration-layer.md` for the full design of the Claude Code implementation.
