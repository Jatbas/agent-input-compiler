# Installation & Delivery

How AIC gets installed, what artifacts it creates, and how its components interact across editors and environments.

## Table of Contents

- [Glossary](#glossary)
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
  - [Plugin (Recommended)](#plugin-recommended)
  - [Direct Installer](#direct-installer)
  - [Prerequisite](#prerequisite)
  - [Trigger Rule](#trigger-rule-1)
  - [Hooks](#hooks-1)
  - [Hook Lifecycle](#hook-lifecycle-1)
  - [How Hooks Are Delivered](#how-hooks-are-delivered-1)
  - [Update Notifications](#update-notifications)
  - [Troubleshooting](#troubleshooting)
- [Other Editors](#other-editors)
- [AIC Development Environment](#aic-development-environment)
- [Uninstall](#uninstall)
  - [Cursor](#uninstall-cursor)
  - [Claude Code (plugin)](#uninstall-claude-code-plugin)
  - [Claude Code (direct installer)](#uninstall-claude-code-direct)
  - [Other editors](#uninstall-other-editors)
  - [Optional: remove all data](#uninstall-optional--remove-all-data)

---

## Glossary

| Term             | Definition                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP**          | Model Context Protocol — how the editor talks to AIC. The editor runs an AIC server process and calls tools such as `aic_compile`.                            |
| **Hooks**        | Scripts the editor runs at specific events (e.g. session start, before a message is sent). AIC uses them to inject context and enforce that compilation runs. |
| **Bootstrap**    | One-time setup on first use in a project: creates `.aic/`, `aic.config.json`, and editor-specific trigger rule and hooks.                                     |
| **Trigger rule** | The file (e.g. `.cursor/rules/AIC.mdc` or `.claude/CLAUDE.md`) that instructs the AI to call `aic_compile` as its first action on every message.              |

---

## AIC Server

### What Gets Published

The npm package `@jatbas/aic` ships:

- `dist/` — the compiled MCP server (`server.js` with shebang for `npx` execution)
- `hooks/` — integration hook scripts (`.cjs` files) bundled for auto-installation into user projects (Cursor); Claude Code hooks are provided by the plugin or the direct installer (see [Claude Code](#claude-code)).

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

On the first `aic_compile` call for a new project (or when the server first sees the project via workspace roots), `ensureProjectInit` runs:

1. Creates `.aic/` directory with `0700` permissions
2. Generates a stable UUIDv7 project ID in `.aic/project-id`
3. Writes `aic.config.json` with defaults (`contextBudget.maxTokens: 8000`)
4. Adds `.aic/` to `.gitignore`, `.eslintignore`, `.prettierignore`
5. Installs the trigger rule (editor-specific — e.g., `.cursor/rules/AIC.mdc` for Cursor, `.claude/CLAUDE.md` for Claude Code)
6. Installs editor-specific artifacts: for **Cursor**, per-project hook files and trigger rule (`.cursor/hooks/`, `.cursor/hooks.json`, `.cursor/rules/AIC.mdc`); for **Claude Code**, the server may run the direct installer to deploy hooks to `~/.claude/hooks/` and merge into `~/.claude/settings.json` (global), and may write `.claude/CLAUDE.md` in the project when the installer is run from a project directory (see the [Cursor](#cursor) and [Claude Code](#claude-code) sections).

Step 6 runs when the server lists workspace roots (e.g. when Cursor connects). For Cursor, roots are typically listed before the first message, so hooks are in place by then. Steps 5 and 6 are idempotent. Hook registrations (e.g. `.cursor/hooks.json`) are merged when they already exist (new entries added, existing preserved). Hook scripts (`.cjs` files) are re-copied on every bootstrap to stay in sync with the installed AIC version. The trigger rule is updated only if the installed version differs from the current package version.

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
| `.claude/CLAUDE.md`       | Trigger rule for Claude Code                                 | Depends on team preference |

Note: With the **plugin** path, the plugin provides hooks and MCP registration globally — no per-project hook files. With the **direct installer** path, the installer copies hook scripts to `~/.claude/hooks/` and merges AIC hook entries into `~/.claude/settings.json`, so every project gets compiled context with one install. Claude Code hook scripts and settings are global (`~/.claude/`); the only optional per-project artifact is `.claude/CLAUDE.md`.

The database lives globally at `~/.aic/aic.sqlite`. Per-project data is isolated via a `project_id` foreign key.

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

| Editor          | Global config file                                         | Install method                             |
| --------------- | ---------------------------------------------------------- | ------------------------------------------ |
| **Cursor**      | `~/.cursor/mcp.json`                                       | One-click deeplink (see [Cursor](#cursor)) |
| **Claude Code** | Plugin or project config (see [Claude Code](#claude-code)) | Plugin (recommended) or direct installer   |

There is no per-project or workspace-scoped server installation for end users. The global server handles every project automatically via the first-compile bootstrap.

The only workspace-scoped server is the AIC development environment, which runs from TypeScript source instead of the published npm package. See [AIC Development Environment](#aic-development-environment) for details.

The server detects when AIC is registered in both global and workspace configs (the dev scenario) and emits a warning to stderr and in the `aic_status` tool payload.

### Version Updates

AIC is installed with `@latest`, so `npx` fetches the newest published version on each editor launch. When a new version includes updated hook scripts:

- **Cursor:** Scripts are re-copied into the project's `.cursor/hooks/` on the next bootstrap run. This is automatic — no manual update step.
- **Claude Code (plugin):** With auto-update enabled (see [Plugin (Recommended)](#plugin-recommended)), the plugin updates automatically at startup. Otherwise, update via `/plugin` in the Installed tab.
- **Claude Code (direct installer):** Re-run `node integrations/claude/install.cjs` (from the AIC repo or a directory that contains the script). The installer updates scripts in `~/.claude/hooks/` and re-merges hook entries in `~/.claude/settings.json`.

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

No per-project install step is needed. The global server auto-bootstraps each new project. To verify: send a message in the project; the first compile will run and subsequent messages will receive compiled context (or use the `aic_status` tool if your editor exposes MCP tools).

### Trigger Rule

On bootstrap, AIC creates `.cursor/rules/AIC.mdc` with `alwaysApply: true`. This rule instructs the AI to call `aic_compile` as its first action on every message. The rule is the primary mechanism that makes the AI call AIC.

The trigger rule is suggestive — compliance depends on the model. Hooks provide stronger enforcement (see below).

If `.cursor/rules/AIC.mdc` already exists, AIC does not overwrite it unless the installed rule version differs from the current package version (in which case the file is updated).

### Hooks

AIC installs 10 Cursor hooks that provide lifecycle integration beyond what the trigger rule can achieve:

| Hook                              | Cursor Event           | Purpose                                                                                                                                         |
| --------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIC-session-init.cjs`            | `sessionStart`         | Injects architectural invariants as `additional_context`                                                                                        |
| `AIC-compile-context.cjs`         | `sessionStart`         | Pre-compiles context so it's ready for the first message                                                                                        |
| `AIC-before-submit-prewarm.cjs`   | `beforeSubmitPrompt`   | Prewarms the compile cache before the AI responds                                                                                               |
| `AIC-require-aic-compile.cjs`     | `preToolUse`           | Blocks all tools until `aic_compile` has been called (enforcement)                                                                              |
| `AIC-inject-conversation-id.cjs`  | `preToolUse`           | Injects `conversationId` into `aic_compile` and `aic_chat_summary` args. Editor ID is determined by the MCP server from client and environment. |
| `AIC-post-compile-context.cjs`    | `postToolUse`          | Injects confirmation `additional_context` after successful compile                                                                              |
| `AIC-after-file-edit-tracker.cjs` | `afterFileEdit`        | Tracks edited files for quality checks                                                                                                          |
| `AIC-session-end.cjs`             | `sessionEnd`           | Cleanup and session metrics                                                                                                                     |
| `AIC-stop-quality-check.cjs`      | `stop`                 | Runs lint/typecheck on edited files; auto-fix via `followup_message`                                                                            |
| `AIC-block-no-verify.cjs`         | `beforeShellExecution` | Blocks `--no-verify` flag in git commands                                                                                                       |

### Hook Lifecycle

Hooks run as Cursor spawns them — they are independent processes, not part of the MCP server. Cursor reads `.cursor/hooks.json` and invokes the registered commands at the appropriate lifecycle events.

Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Cursor does.

### How Hooks Are Delivered

Hook scripts are authored in `integrations/cursor/hooks/` and deployed to each project's
`.cursor/hooks/` by the Cursor installer (`integrations/cursor/install.cjs`). On first-compile bootstrap, the installer:

1. **Registers hooks** — creates or merges `.cursor/hooks.json` with the hook definitions (event type, command, matcher, timeout, etc.)
2. **Copies scripts** — copies the 10 `AIC-*.cjs` files from `integrations/cursor/hooks/` into the project's `.cursor/hooks/` directory

The `.cursor/` directory is a **deployment target** — hook scripts are never authored there directly.
On subsequent compilations, merge logic adds any missing hook entries without overwriting user-added hooks. Scripts are re-copied on every bootstrap to stay in sync with the installed AIC version.

---

## Claude Code

AIC supports Claude Code via two installation paths: the plugin (recommended) and the direct installer (for development).

### Plugin (Recommended)

For most users, install AIC as a Claude Code Plugin. The plugin auto-starts the MCP server and registers all hooks; no manual config edits are required.

1. Add the AIC marketplace: `/plugin marketplace add Jatbas/agent-input-compiler`
2. Install the plugin: `/plugin install aic@aic-tools`

Once installed, the plugin provides the AIC MCP server and the 8 lifecycle hooks. Every project you open in Claude Code gets compiled context automatically.

**Enable auto-updates:** Third-party marketplaces (including AIC) do not auto-update by default. To receive updates automatically when a new version is pushed:

1. Run `/plugin` to open the plugin manager
2. Go to the **Marketplaces** tab
3. Select **Enable auto-update** for the AIC marketplace

With auto-update enabled, Claude Code refreshes the marketplace and updates the plugin at startup. If the plugin was updated, a notification prompts you to run `/reload-plugins` to activate the changes.

### Direct Installer

Run `node integrations/claude/install.cjs` from the AIC repo (or from a path where the script and `integrations/claude/hooks/` are available). The installer copies the AIC hook scripts (8 event hooks plus the compile helper and conversation-id script) to `~/.claude/hooks/` and merges AIC hook entries into `~/.claude/settings.json`. Every project you open in Claude Code then gets compiled context. Optionally, the installer writes `.claude/CLAUDE.md` in the current working directory for the trigger-rule fallback.

### Prerequisite

The AIC MCP server must be runnable as `npx @jatbas/aic@latest` (Node 20+). Ensure the package is available before relying on hooks or the compile flow. The plugin path uses this under the hood; the direct installer path assumes you are in the AIC repo or have the server on your path.

### Trigger Rule

Claude Code supports custom context files. `.claude/CLAUDE.md` in the project root is the fallback when hooks are disabled — it instructs the model to call `aic_compile`. The direct installer may write it when run from a project directory; plugin users who set `disableAllHooks: true` can add it manually.

### Hooks

Claude Code provides a richer hook lifecycle than Cursor, including the critical `UserPromptSubmit` event.

| Hook                              | Claude Code Event          | Purpose                                                        |
| --------------------------------- | -------------------------- | -------------------------------------------------------------- |
| `aic-prompt-compile.cjs`          | `UserPromptSubmit`         | Pre-compiles context for every user message (PRIMARY delivery) |
| `aic-session-start.cjs`           | `SessionStart`             | Injects architectural invariants (with dual-path fallback)     |
| `aic-subagent-inject.cjs`         | `SubagentStart`            | Injects context into Bash, Explore, and Plan subagents         |
| `aic-block-no-verify.cjs`         | `PreToolUse` (Bash)        | Blocks `--no-verify` flag in git commands                      |
| `aic-after-file-edit-tracker.cjs` | `PostToolUse` (Edit/Write) | Tracks edited files for quality checks                         |
| `aic-stop-quality-check.cjs`      | `Stop`                     | Runs lint/typecheck on edited files; blocks finish on failure  |
| `aic-pre-compact.cjs`             | `PreCompact`               | Re-compiles context before window compaction                   |
| `aic-session-end.cjs`             | `SessionEnd`               | Cleanup and session metrics                                    |

### Hook Lifecycle

Hooks run as Claude Code spawns them — they are independent processes, not part of the MCP server. Claude Code reads the active settings (plugin-provided or `~/.claude/settings.json`) and invokes the registered commands at the relevant lifecycle events.

Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Claude Code does.

### How Hooks Are Delivered

- **Plugin path:** The plugin provides the 8 lifecycle hooks (and supporting scripts) and registers them with Claude Code; no per-project deployment.
- **Direct installer path:** The installer copies hook scripts to `~/.claude/hooks/` and merges AIC hook entries into `~/.claude/settings.json`; bootstrap runs the installer on first use so every project gets compiled context.

See `documentation/claude-code-integration-layer.md` for how hooks are packaged and delivered in each path.

### Update Notifications

AIC checks for newer published versions during compilation. When a newer version is available, the `aic_compile` response includes an `updateMessage` that the model surfaces to the user in the chat. This works identically to the Cursor update notification — no additional setup is needed.

### Troubleshooting

**Hooks not firing**

- Check whether `disableAllHooks` is set in your Claude Code settings; if it is true, hooks are disabled. Use `.claude/CLAUDE.md` in the project root so the model still knows to call `aic_compile` on every message.
- If using the plugin: verify the plugin is enabled (for example via the `/plugin` command in Claude Code).
- If using the direct installer: confirm `~/.claude/settings.json` contains `aic-` hook entries and that `~/.claude/hooks/` contains the AIC hook scripts; use `.claude/CLAUDE.md` in the project root for the trigger fallback if needed.

---

## Other Editors

Any editor that supports the MCP protocol can run AIC. Register it as a global MCP server using the standard server entry:

```json
"aic": {
  "command": "npx",
  "args": ["-y", "@jatbas/aic@latest"]
}
```

Add this to your editor's global MCP configuration file and restart the editor. The exact file path depends on your editor — consult its MCP documentation.

Once registered, AIC auto-bootstraps on the first `aic_compile` call: it creates `aic.config.json`, the `.aic/` data directory, and installs any available trigger rules and hooks for your editor. Editors without a dedicated integration layer still benefit from the MCP tools (`aic_compile`, `aic_status`, etc.) — lifecycle hooks are simply not available until a dedicated integration is added.

---

## AIC Development Environment

The dev server is pre-configured in `.cursor/mcp.json` (checked into the repo as `"aic-dev"`). It runs from TypeScript source and uses hand-maintained hooks that include dev-only extras not present in the published package. No setup is needed — cloning the repo is sufficient.

**The production server must be disabled while developing AIC.** If both run simultaneously, the production server overwrites dev hooks with published versions, the AI sees duplicate `aic_compile` tools, and both write to the same database. Disable the production server in whatever IDE you are using before opening the AIC project.

In Cursor, this means keeping `~/.cursor/mcp.json` empty (or with the `"aic"` entry removed). When you need to use AIC as an end user in another project, add the entry back. Toggle as needed — this is the standard MCP server development workflow.

No `aic.config.json` changes are needed. The `"enabled"` flag would disable both servers since they read the same config file.

---

## Uninstall

Uninstall stops AIC from running in your editor and removes the config and hooks the installers added. Optionally you can remove all AIC data (compilation history and cache) as described below.

### Uninstall: Cursor

1. From the AIC repo (or a directory that contains the script), run: `node integrations/cursor/uninstall.cjs`. If you no longer have the repo, copy `integrations/cursor/uninstall.cjs` from the [AIC repository](https://github.com/jatbas/AIC) and run it with Node from the same directory.
2. To also remove AIC from the **current project** (hooks and trigger rule), run the same command with `--project`: `node integrations/cursor/uninstall.cjs --project`.
3. Restart Cursor (or use **MCP: Reload Configurations**) so the editor picks up the change.

This removes the global AIC entry from `~/.cursor/mcp.json`. With `--project`, it also removes AIC hooks and the trigger rule from the current project’s `.cursor/` directory.

### Uninstall: Claude Code (plugin)

1. In Claude Code, run `/plugin` and uninstall the AIC plugin. No script is required.
2. Restart or reload Claude Code if needed.

### Uninstall: Claude Code (direct installer)

1. From the AIC repo (or the directory where the script lives), run: `node integrations/claude/uninstall.cjs`.
2. Restart Claude Code (or reload) so the editor picks up the change.

This removes AIC hook entries from `~/.claude/settings.json` and deletes the AIC scripts in `~/.claude/hooks/`.

### Uninstall: Other editors

Remove the `aic` entry from your editor’s global MCP config (the file and key name depend on the editor). Optionally delete the project’s `.aic/` directory to remove local AIC data for that project.

### Uninstall: Optional — remove all data

To delete compilation history and cache (global and per-project), remove the `~/.aic/` directory.
