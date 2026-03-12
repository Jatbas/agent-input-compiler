# Installation & Delivery

How AIC gets installed, what artifacts it creates, and how its components interact across editors and environments.

## Table of Contents

- [AIC Server](#aic-server)
  - [What Gets Published](#what-gets-published)
  - [First-Compile Bootstrap](#first-compile-bootstrap)
  - [Per-Project Artifacts](#per-project-artifacts)
  - [Per-Project Disable](#per-project-disable)
  - [Global vs Workspace Server](#global-vs-workspace-server)
  - [Known Gap: Hooks Fire When Disabled](#known-gap-hooks-fire-when-disabled)
- [Cursor](#cursor)
  - [One-Click Install (Deeplink)](#one-click-install-deeplink)
  - [What the Deeplink Does](#what-the-deeplink-does)
  - [Trigger Rule](#trigger-rule)
  - [Hooks](#hooks)
  - [Hook Lifecycle](#hook-lifecycle)
  - [How Hooks Are Delivered](#how-hooks-are-delivered)
- [AIC Development Environment](#aic-development-environment)
  - [Dev Server Configuration](#dev-server-configuration)
  - [Global Server Conflict](#global-server-conflict)
  - [Recommended Dev Setup](#recommended-dev-setup)
- [Claude Code](#claude-code)

---

## AIC Server

### What Gets Published

The npm package `@jatbas/aic` ships:

- `dist/` — the compiled MCP server (`server.js` with shebang for `npx` execution)
- `hooks/` — 9 Cursor hook scripts (`.cjs` files) bundled for auto-installation into user projects

The server is the primary interface. It exposes these MCP tools: `aic_compile` (compile context), `aic_status` (project-level status), `aic_last` (most recent compilation), `aic_chat_summary` (per-conversation summary), and `aic_projects` (list known projects). All four prompt commands—"show aic status", "show aic last", "show aic chat summary", "show aic projects"—are available as tools in any editor without server-identifier dependencies; the AI calls the tool by name (e.g. `aic_status`, `aic_last`). Editors call the server, and the server returns compiled context or status JSON.

### First-Compile Bootstrap

On the first `aic_compile` call for a new project, `ensureProjectInit` runs:

1. Creates `.aic/` directory with `0700` permissions
2. Generates a stable UUIDv7 project ID in `.aic/project-id`
3. Writes `aic.config.json` with defaults (`contextBudget.maxTokens: 8000`)
4. Adds `.aic/` to `.gitignore`, `.eslintignore`, `.prettierignore`
5. Installs the trigger rule (editor-specific — e.g., `.cursor/rules/AIC.mdc`)
6. Installs editor hooks (editor-specific — e.g., `.cursor/hooks.json` + `.cursor/hooks/AIC-*.cjs`)

Steps 5 and 6 are idempotent. If the trigger rule or hooks already exist, they are merged (new entries added, existing entries preserved).

After bootstrap, the server compiles context normally. Subsequent calls skip bootstrap entirely (guarded by a per-project once-flag in the compile handler).

### Per-Project Artifacts

After bootstrap, each project contains:

| Path                      | Purpose                                                 | Committed to git?          |
| ------------------------- | ------------------------------------------------------- | -------------------------- |
| `aic.config.json`         | Project configuration (budget, guard, cache, telemetry) | Yes                        |
| `.aic/`                   | AIC data directory (DB, cache, project-id)              | No (auto-gitignored)       |
| `.aic/project-id`         | Stable UUIDv7 — survives folder renames                 | No                         |
| `.cursor/rules/AIC.mdc`   | Trigger rule — tells the AI to call `aic_compile`       | Depends on team preference |
| `.cursor/hooks.json`      | Hook registrations — tells Cursor which hooks to run    | Depends on team preference |
| `.cursor/hooks/AIC-*.cjs` | Hook scripts — the actual hook logic                    | Depends on team preference |

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

AIC is a global server. It registers once in `~/.cursor/mcp.json` and runs for every project opened in Cursor. There is no per-project or workspace-scoped installation for end users.

The only workspace-scoped server is the AIC development environment, which runs from TypeScript source instead of the published npm package. See [AIC Development Environment](#aic-development-environment) for details.

W10 detects when AIC is registered in both global and workspace configs (the dev scenario) and emits a warning to stderr and in the `aic_status` tool payload.

### Known Gap: Hooks Fire When Disabled

When `"enabled": false` is set in `aic.config.json`, the MCP server returns early — but Cursor hooks still fire. Hooks are registered in `.cursor/hooks.json` and Cursor invokes them regardless of AIC's config state. The hooks cannot check the config before running because they execute independently of the MCP server.

This means a disabled project still pays the cost of hook invocations (though the `aic_compile` call inside the hooks returns immediately). A future improvement could have each hook script check `aic.config.json` directly and exit early, but this adds file I/O to every hook invocation.

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
3. The AI sends its first message, triggering `aic_compile`
4. The server runs `ensureProjectInit` (see [First-Compile Bootstrap](#first-compile-bootstrap))
5. Bootstrap creates `aic.config.json`, `.aic/`, trigger rule, hooks — all inside the project directory
6. From this point on, every AI message in this project gets compiled context

No per-project install step is needed. The global server auto-bootstraps each new project.

### Trigger Rule

On bootstrap, AIC creates `.cursor/rules/AIC.mdc` with `alwaysApply: true`. This rule instructs the AI to call `aic_compile` as its first action on every message. The rule is the primary mechanism that makes the AI call AIC.

The trigger rule is suggestive — compliance depends on the model. Hooks provide stronger enforcement (see below).

If `.cursor/rules/AIC.mdc` already exists, AIC does not overwrite it.

### Hooks

AIC installs 9 Cursor hooks that provide lifecycle integration beyond what the trigger rule can achieve:

| Hook                              | Cursor Event         | Purpose                                                              |
| --------------------------------- | -------------------- | -------------------------------------------------------------------- |
| `AIC-session-init.cjs`            | `sessionStart`       | Injects architectural invariants as `additional_context`             |
| `AIC-compile-context.cjs`         | `sessionStart`       | Pre-compiles context so it's ready for the first message             |
| `AIC-before-submit-prewarm.cjs`   | `beforeSubmitPrompt` | Prewarms the compile cache before the AI responds                    |
| `AIC-require-aic-compile.cjs`     | `preToolUse`         | Blocks all tools until `aic_compile` has been called (enforcement)   |
| `AIC-inject-conversation-id.cjs`  | `preToolUse`         | Injects `conversationId` and `editorId` into `aic_compile` args      |
| `AIC-post-compile-context.cjs`    | `postToolUse`        | Injects confirmation `additional_context` after successful compile   |
| `AIC-after-file-edit-tracker.cjs` | `afterFileEdit`      | Tracks edited files for quality checks                               |
| `AIC-session-end.cjs`             | `sessionEnd`         | Cleanup and session metrics                                          |
| `AIC-stop-quality-check.cjs`      | `stop`               | Runs lint/typecheck on edited files; auto-fix via `followup_message` |

### Hook Lifecycle

Hooks run as Cursor spawns them — they are independent processes, not part of the MCP server. Cursor reads `.cursor/hooks.json` and invokes the registered commands at the appropriate lifecycle events.

Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Cursor does.

### How Hooks Are Delivered

The hook scripts (`.cjs` files) are bundled inside the npm package under `hooks/`. On first-compile bootstrap, `installCursorHooks` performs two actions:

1. **Registers hooks** — creates or merges `.cursor/hooks.json` with the hook definitions (event type, command, matcher, timeout, etc.)
2. **Copies scripts** — copies the 9 `AIC-*.cjs` files from the npm package's `hooks/` directory into the project's `.cursor/hooks/` directory

On subsequent compilations (when hooks already exist), the merge logic adds any missing hook entries without removing or overwriting user-added hooks. Hook scripts are re-copied on every bootstrap to ensure they stay up to date with the installed AIC version.

---

## AIC Development Environment

The AIC source repository (`/Users/jatbas/Desktop/AIC`) uses a workspace-scoped MCP server that runs directly from source code, not the published npm package.

### Dev Server Configuration

The workspace `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "aic-dev": {
      "command": "sh",
      "args": [
        "-c",
        "cd /Users/jatbas/Desktop/AIC && pnpm --filter @jatbas/aic-core build >&2 && npx tsx mcp/src/server.ts"
      ]
    }
  }
}
```

This builds the `shared` package and runs the server from TypeScript source via `tsx`. It uses the key `"aic-dev"`, distinct from the production server's `"aic"`.

The hooks in this workspace are hand-maintained (not auto-installed). They include an extra dev-only hook (`AIC-block-no-verify.cjs` for `beforeShellExecution`) not present in the published package.

### Global Server Conflict

If the developer also installs AIC globally (via the deeplink or manual `~/.cursor/mcp.json` entry), **both servers run simultaneously** when the AIC project is open in Cursor:

| Server              | Key         | Source                  | Runs from                     |
| ------------------- | ----------- | ----------------------- | ----------------------------- |
| Dev (workspace)     | `"aic-dev"` | Local TypeScript source | `mcp/src/server.ts` via `tsx` |
| Production (global) | `"aic"`     | Published npm package   | `npx -y @jatbas/aic@latest`   |

Consequences:

- **Both target the same `projectRoot`** (`/Users/jatbas/Desktop/AIC`) and write to the same `~/.aic/aic.sqlite` database
- **The AI sees duplicate `aic_compile` tools** — one from each server
- **The global server overwrites dev hooks** — `installCursorHooks` copies the published hook scripts into `.cursor/hooks/`, replacing the dev versions

### Recommended Dev Setup

Do not install AIC globally while actively developing. The global `~/.cursor/mcp.json` should remain empty:

```json
{
  "mcpServers": {}
}
```

If global installation is needed for testing in other projects, add a disable override to the AIC project's workspace `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "aic-dev": {
      "command": "sh",
      "args": [
        "-c",
        "cd /Users/jatbas/Desktop/AIC && pnpm --filter @jatbas/aic-core build >&2 && npx tsx mcp/src/server.ts"
      ]
    },
    "aic": { "disabled": true }
  }
}
```

This suppresses the production `"aic"` server for this project while keeping the dev `"aic-dev"` server active. The hooks remain controlled by the dev workspace. The names are unambiguously different — no case-sensitivity risk.

---

## Claude Code

Phase T (Claude Code Hook-Based Delivery) and Phase U (Claude Code Zero-Install) are pending. The architecture mirrors the Cursor model:

- A trigger rule in `.claude/CLAUDE.md` instructs the AI to call `aic_compile`
- Hooks in `.claude/settings.local.json` provide lifecycle integration (`UserPromptSubmit`, `SubagentStart`, `PreCompaction`, `SessionEnd`)
- Auto-install detects Claude Code and creates the appropriate artifacts

See `documentation/future/claude-code-hook-integration.md` for the full design. This section will be expanded when Phase T/U are implemented.
