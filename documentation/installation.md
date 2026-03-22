# Installation & Delivery

How AIC gets installed, what artifacts it creates, and how its components interact across editors and environments. Terms used in this document are defined in the [Glossary](#glossary) or in context.

## Table of Contents

- [Glossary](#glossary)
- [AIC Server](#aic-server)
  - [What Gets Published](#what-gets-published)
  - [CLI Standalone Usage](#cli-standalone-usage)
  - [First-Compile Bootstrap](#first-compile-bootstrap)
  - [Per-Project Artifacts](#per-project-artifacts)
  - [Per-Project Disable](#per-project-disable)
  - [Server Scope](#server-scope)
  - [Version Updates](#version-updates)
  - [Known Gap: Cursor Hooks Fire When Disabled](#known-gap-cursor-hooks-fire-when-disabled)
- [Cursor](#cursor)
  - [One-Click Install (Deeplink)](#one-click-install-deeplink)
  - [Prerequisite](#prerequisite)
  - [What the Deeplink Does](#what-the-deeplink-does)
  - [Trigger Rule](#trigger-rule)
  - [Hooks](#hooks)
  - [Hook Lifecycle](#hook-lifecycle)
  - [How Hooks Are Delivered](#how-hooks-are-delivered)
  - [Troubleshooting](#troubleshooting-cursor)
- [Claude Code](#claude-code)
  - [Plugin (Recommended)](#plugin-recommended)
  - [Direct Installer](#direct-installer)
  - [Prerequisite](#prerequisite-1)
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

| Term             | Definition                                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP**          | Model Context Protocol — how the editor talks to AIC. The editor runs an AIC server process and calls tools such as `aic_compile`.                                                                                  |
| **Hooks**        | Scripts the editor runs at specific events (e.g. session start, before a message is sent). AIC uses them to inject context and enforce that compilation runs.                                                       |
| **Bootstrap**    | One-time setup on first use: `.aic/`, `aic.config.json`, ignore files, trigger rule; Cursor hook files only after `integrations/cursor/install.cjs` runs (see [First-Compile Bootstrap](#first-compile-bootstrap)). |
| **Trigger rule** | The file (e.g. `.cursor/rules/AIC.mdc` or `.claude/CLAUDE.md`) that instructs the AI to call `aic_compile` as its first action on every message.                                                                    |

---

## AIC Server

### What Gets Published

The npm package `@jatbas/aic` ships only `dist/` — the compiled MCP server (`server.js` with shebang for `npx` execution). Cursor hook scripts live in the repository (`integrations/cursor/hooks/`) and are deployed by the Cursor installer when it runs (see [Cursor](#cursor)). Claude Code hooks are provided by the plugin or the direct installer (see [Claude Code](#claude-code)).

The server is the primary interface. It exposes these MCP tools:

| Tool               | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `aic_compile`      | Compile context for the current AI message      |
| `aic_inspect`      | Inspect a previous compilation                  |
| `aic_status`       | Project-level status and compilation aggregates |
| `aic_last`         | Most recent compilation details                 |
| `aic_chat_summary` | Per-conversation compilation stats              |
| `aic_projects`     | List all known AIC projects                     |

The four prompt commands ("show aic status", "show aic last", "show aic chat summary", "show aic projects") invoke CLI subcommands via Bash. The AI runs `npx @jatbas/aic <subcommand>` (or `pnpm aic <subcommand>` when `AIC_DEV_MODE=1`) and relays stdout — no MCP tool call needed.

### CLI Standalone Usage

The same binary that runs as the MCP server also works as a standalone CLI tool. You can invoke the four diagnostic subcommands directly from a terminal — no editor required:

| Subcommand                     | What it does                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `status`                       | Project-level AIC status (compilations, token stats, budget, guard findings) |
| `last`                         | Most recent compilation details (intent, files, tokens, reduction)           |
| `chat-summary --project <dir>` | Per-conversation compilation stats for the given project directory           |
| `projects`                     | All known AIC projects (ID, path, last seen, compilation count)              |

**Usage:**

```bash
# Published release — works from any directory
npx @jatbas/aic status
npx @jatbas/aic last
npx @jatbas/aic chat-summary --project /path/to/project
npx @jatbas/aic projects

# Development mode — requires pnpm build; run from repo root
pnpm aic status
pnpm aic last
pnpm aic chat-summary --project /path/to/project
pnpm aic projects
```

If your shell working directory is not registered in the global AIC database (including some git worktree roots), pass `--project <absolute path>` to `status`, `last`, and `chat-summary` in addition to the `chat-summary` examples above. See [CONTRIBUTING.md — Local MCP testing](CONTRIBUTING.md#local-mcp-testing).

Each subcommand opens the database read-only, prints formatted table output to stdout, and exits. The tables use the same human-readable labels as the four **show aic …** prompt commands (for example Compilations, Project path, Last compilation).

### First-Compile Bootstrap

On the first `aic_compile` call for a new project (or when the server first sees the project via workspace roots), `ensureProjectInit` runs:

1. Creates `.aic/` directory with `0700` permissions
2. Generates a stable UUIDv7 project ID in `.aic/project-id`
3. Writes `aic.config.json` with defaults (`contextBudget.maxTokens: 8000`)
4. Appends missing lines to `.gitignore`, `.eslintignore`, and `.prettierignore` for `.aic/`, `aic.config.json`, `.cursor/rules/AIC.mdc`, `.cursor/hooks.json`, and `.cursor/hooks/AIC-*.cjs` (same list for all three files; existing entries are left unchanged)
5. Installs the trigger rule (editor-specific — e.g., `.cursor/rules/AIC.mdc` for Cursor, `.claude/CLAUDE.md` for Claude Code)
6. **Cursor:** If `<project>/integrations/cursor/install.cjs` exists (e.g. the AIC repo is the workspace, or that tree was copied in), the server runs that installer on init — it writes `.cursor/hooks.json` and copies the 11 `AIC-*.cjs` scripts into `.cursor/hooks/`. The published npm package does not ship that path inside arbitrary projects; for those, steps 1–5 still run, but **hooks are not written until** you run `node integrations/cursor/install.cjs` once from an AIC repo checkout with the shell cwd set to your project (see [Troubleshooting (Cursor)](#troubleshooting-cursor)). **Claude Code:** If `<project>/integrations/claude/install.cjs` exists, the server may run it to merge global hook entries; the **plugin** path installs hooks globally without per-project scripts (see [Claude Code](#claude-code)).

When the Cursor installer does run, it is idempotent: hook registrations merge (new entries added, user hooks preserved) and scripts are re-copied to match the checkout version. The trigger rule updates only when the installed rule version differs from the current package version. Init runs when the server lists workspace roots or on first `aic_compile`, depending on the client.

After bootstrap, the server compiles context normally. Subsequent calls skip bootstrap entirely (guarded by a per-project once-flag in the compile handler).

### Per-Project Artifacts

After bootstrap, each project contains:

| Path                      | Purpose                                                                                                                                                                                                              | Committed to git?                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `aic.config.json`         | Project configuration (budget, guard, cache, telemetry). Example: `"guard": { "allowPatterns": ["test/fixtures/**", "docs/**"] }` — see [Implementation Spec — Step 5](implementation-spec.md#step-5-context-guard). | Usually no — bootstrap appends it to `.gitignore`; delete that line to commit shared config |
| `.aic/`                   | Project-local AIC directory (`project-id`, ephemeral files)                                                                                                                                                          | No (auto-gitignored)                                                                        |
| `.aic/project-id`         | Stable UUIDv7 — survives folder renames                                                                                                                                                                              | No                                                                                          |
| `.cursor/rules/AIC.mdc`   | Trigger rule for Cursor — tells the AI to call `aic_compile`                                                                                                                                                         | Depends on team preference                                                                  |
| `.cursor/hooks.json`      | Hook registrations for Cursor                                                                                                                                                                                        | Depends on team preference                                                                  |
| `.cursor/hooks/AIC-*.cjs` | Cursor hook scripts — auto-bootstrapped per project                                                                                                                                                                  | Depends on team preference                                                                  |
| `.claude/CLAUDE.md`       | Trigger rule for Claude Code                                                                                                                                                                                         | Depends on team preference                                                                  |

> With the **plugin** path, the plugin provides hooks and MCP registration globally — no per-project hook files. With the **direct installer** path, the installer copies hook scripts to `~/.claude/hooks/` and merges AIC hook entries into `~/.claude/settings.json`, so every project gets compiled context with one install. Claude Code hook scripts and settings are global (`~/.claude/`); the only optional per-project artifact is `.claude/CLAUDE.md`.
>
> The database lives globally at `~/.aic/aic.sqlite`. Per-project data is isolated via a `project_id` foreign key.

### Per-Project Disable

Set `"enabled": false` in `aic.config.json`:

```json
{
  "enabled": false
}
```

When disabled:

- `aic_compile` returns early with: `AIC is disabled for this project. Set "enabled": true in aic.config.json to re-enable.`
- No data is written to the database
- `aic_status` returns `projectEnabled: false` (when using the **show aic status** prompt command, the Project row is shown as **Disabled**)

> Default is `true` (omitted means enabled).

### Server Scope

AIC is a **global** MCP server — it registers once per user and serves every project without per-project installation:

| Editor          | Global config file                                         | Install method                             |
| --------------- | ---------------------------------------------------------- | ------------------------------------------ |
| **Cursor**      | `~/.cursor/mcp.json`                                       | One-click deeplink (see [Cursor](#cursor)) |
| **Claude Code** | Plugin or project config (see [Claude Code](#claude-code)) | Plugin (recommended) or direct installer   |

There is no per-project or workspace-scoped server installation for end users. The global server handles every project automatically via the first-compile bootstrap.

The only workspace-scoped server is the AIC development environment, which runs from TypeScript source instead of the published npm package. See [AIC Development Environment](#aic-development-environment) for details.

> The server detects when AIC is registered in both global and workspace configs (the dev scenario) and emits a warning to stderr and in the `aic_status` tool payload.

### Version Updates

AIC is installed with `@latest`, so `npx` fetches the newest published version on each editor launch. When a new version includes updated hook scripts:

- **Cursor:** After you re-run the Cursor installer (from a repo checkout, or when your project already contains `integrations/cursor/install.cjs` and init runs again), scripts in `.cursor/hooks/` are refreshed. Deeplink-only setups re-run the installer from the repo when you want updated hook files.
- **Claude Code (plugin):** With auto-update enabled (see [Plugin (Recommended)](#plugin-recommended)), the plugin updates automatically at startup. Otherwise, update via `/plugin` in the Installed tab.
- **Claude Code (direct installer):** Re-run `node integrations/claude/install.cjs` (from the AIC repo or a directory that contains the script). The installer updates scripts in `~/.claude/hooks/` and re-merges hook entries in `~/.claude/settings.json`.

### Known Gap: Cursor Hooks Fire When Disabled

> Setting `"enabled": false` in `aic.config.json` makes the MCP server return early, but **Cursor hooks** still fire because Cursor invokes them independently of the MCP server. The practical impact is minimal — hooks run but `aic_compile` returns immediately — though each invocation still pays a small process-spawn cost. A future improvement could have hook scripts check `aic.config.json` directly and exit early.
>
> Claude Code is different: hooks are global, but they still call MCP tools such as `aic_compile` the same way — when disabled, those calls return immediately with the same early-return message.

---

## Cursor

### One-Click Install (Deeplink)

The primary installation method for Cursor users. A deeplink URL registers AIC in the global MCP config:

[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://jatbas.github.io/agent-input-compiler/install/cursor-install.html)

Or copy this URL into your browser:

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=aic&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBqYXRiYXMvYWljQGxhdGVzdCJdfQ==
```

The base64 payload decodes to:

```json
{ "command": "npx", "args": ["-y", "@jatbas/aic@latest"] }
```

### Prerequisite

The AIC MCP server must be runnable as `npx -y @jatbas/aic@latest` (Node 20+). Ensure Node is installed and the package is reachable before relying on the deeplink or hooks.

### What the Deeplink Does

The deeplink writes the entry above into `~/.cursor/mcp.json`. That registers the global MCP server only.

> On first connection or first `aic_compile`, the server creates `aic.config.json`, `.aic/`, ignore-file entries, and the Cursor trigger rule in the project. **Cursor lifecycle hooks** (`.cursor/hooks.json` and `AIC-*.cjs`) are **not** written by the npm package alone — run `node …/integrations/cursor/install.cjs` from an AIC repo checkout with cwd at your project (see [Troubleshooting (Cursor)](#troubleshooting-cursor)).

Typical flow:

1. User opens a project in Cursor; Cursor spawns the server (`npx -y @jatbas/aic@latest`).
2. With **roots** capability, init bootstraps each root (trigger rule, config, ignores); hook install runs only if `integrations/cursor/install.cjs` exists in that root.
3. Without roots, the same steps run on the first `aic_compile`.
4. After hooks are installed (if you ran the installer), enforcement and context injection match the tables below; otherwise the trigger rule alone asks the model to call `aic_compile`.

No per-project MCP registration is needed. To verify the server: use `aic_status` or send a message so `aic_compile` runs.

### Trigger Rule

On bootstrap, AIC creates `.cursor/rules/AIC.mdc` with `alwaysApply: true`. This rule instructs the AI to call `aic_compile` as its first action on every message. The rule is the primary mechanism that makes the AI call AIC.

> The trigger rule is suggestive — compliance depends on the model. Hooks provide stronger enforcement (see below). If `.cursor/rules/AIC.mdc` already exists, AIC does not overwrite it unless the installed rule version differs from the current package version (in which case the file is updated).

### Hooks

When the Cursor installer has run, the project has 11 hook scripts registered like this:

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
| `AIC-subagent-compile.cjs`        | `subagentStart`        | Calls `aic_compile` for telemetry; Cursor subagentStart cannot inject `additional_context`                                                      |
| `AIC-stop-quality-check.cjs`      | `stop`                 | Runs lint/typecheck on edited files; auto-fix via `followup_message`                                                                            |
| `AIC-block-no-verify.cjs`         | `beforeShellExecution` | Blocks `--no-verify` flag in git commands                                                                                                       |

### Hook Lifecycle

Hooks run as Cursor spawns them — they are independent processes, not part of the MCP server. Cursor reads `.cursor/hooks.json` and invokes the registered commands at the appropriate lifecycle events.

> Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Cursor does. For the full edited-files flow (tracker → stop → cleanup and temp file behavior), see [edited-files flow](edited-files-flow.md).

### How Hooks Are Delivered

Hook scripts are authored in `integrations/cursor/hooks/` and deployed to each project's
`.cursor/hooks/` by the Cursor installer (`integrations/cursor/install.cjs`). When you run `node integrations/cursor/install.cjs` (from the server init if that script exists in the project, or manually from a repo checkout):

1. **Registers hooks** — creates or merges `.cursor/hooks.json` with the hook definitions (event type, command, matcher, timeout, etc.)
2. **Copies scripts** — copies the 11 `AIC-*.cjs` files from `integrations/cursor/hooks/` into the project's `.cursor/hooks/` directory

The `.cursor/` directory is a **deployment target** — hook scripts are never authored there directly.
Re-running the installer merges any missing hook entries without overwriting user-added hooks and re-copies scripts from the repo copy you ran against.

### Troubleshooting (Cursor)

**Hooks not firing**

- Confirm `.cursor/hooks.json` and `.cursor/hooks/AIC-*.cjs` exist. The deeplink MCP install does not place them automatically — run from a clone: `cd /path/to/your-project && node /path/to/agent-input-compiler/integrations/cursor/install.cjs` (or copy `integrations/cursor/` from the repo and run `install.cjs` with cwd at your project). Then reload Cursor.
- If `npx` cannot reach the registry (proxy, offline), fix network or use an npm mirror before the MCP server can start.
- Ensure the AIC MCP server is enabled in Cursor: Settings → MCP → AIC server on.

**`aic_compile` tool not found or not called**

- In Cursor: Settings → MCP → ensure the AIC server is enabled and the `aic_compile` tool is set to "Always allow". Reload the window (Cmd+Shift+P → Reload Window) after changing MCP settings.

---

## Claude Code

AIC supports Claude Code via two installation paths: the plugin (recommended) and the direct installer (for development). There is no one-click install URL for Claude Code; use the plugin or the direct installer below.

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

The AIC MCP server must be runnable as `npx -y @jatbas/aic@latest` (Node 20+), same as Cursor. Ensure the package is reachable from your network before relying on hooks or the compile flow. The plugin path uses this under the hood; the direct installer path assumes you are in the AIC repo or have the server on your path.

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

> Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Claude Code does. For the full edited-files flow (tracker → stop → cleanup and temp file behavior), see [edited-files flow](edited-files-flow.md).

### How Hooks Are Delivered

- **Plugin path:** The plugin provides the 8 lifecycle hooks (and supporting scripts) and registers them with Claude Code; no per-project deployment.
- **Direct installer path:** The installer copies hook scripts to `~/.claude/hooks/` and merges AIC hook entries into `~/.claude/settings.json`; bootstrap runs the installer on first use so every project gets compiled context.

See [Claude Code integration layer](technical/claude-code-integration-layer.md) for how hooks are packaged and delivered in each path.

### Update Notifications

AIC checks for newer published versions during compilation. When a newer version is available, the `aic_compile` response includes an `updateMessage` that the model surfaces to the user in the chat. This works identically to the Cursor update notification — no additional setup is needed.

### Troubleshooting

**Hooks not firing**

- Check whether `disableAllHooks` is set in your Claude Code settings; if it is true, hooks are disabled. Use `.claude/CLAUDE.md` in the project root so the model still knows to call `aic_compile` on every message.
- If using the plugin: verify the plugin is enabled (for example via the `/plugin` command in Claude Code).
- If using the direct installer: confirm `~/.claude/settings.json` contains `aic-` hook entries and that `~/.claude/hooks/` contains the AIC hook scripts; use `.claude/CLAUDE.md` in the project root for the trigger fallback if needed.

---

## Other Editors

AIC requires a dedicated integration layer — hooks and a trigger rule — to compile context automatically on every message. Cursor and Claude Code have first-class integration layers; no integration layer exists yet for other editors.

To request support for your editor or contribute an integration layer, [open an issue](https://github.com/Jatbas/agent-input-compiler/issues).

---

## AIC Development Environment

The dev server is pre-configured in `.cursor/mcp.json` (checked into the repo as `"aic-dev"`). It runs from TypeScript source and uses hand-maintained hooks that include dev-only extras not present in the published package. No setup is needed — cloning the repo is sufficient.

> **The production server must be disabled while developing AIC.** If both run simultaneously, the production server overwrites dev hooks with published versions, the AI sees duplicate `aic_compile` tools, and both write to the same database. Disable the production server in whatever IDE you are using before opening the AIC project. In Cursor, remove only the **`aic`** entry from `~/.cursor/mcp.json` (leave other MCP servers intact). When you need AIC as an end user elsewhere, add that entry back. In Claude Code, disable the AIC plugin (via `/plugin` → disable or uninstall) or remove the AIC MCP and hook entries from `~/.claude/settings.json` if you use the direct installer. Re-enable or re-run the installer when you want to use AIC as an end user again.
>
> No `aic.config.json` changes are needed. The `"enabled"` flag would disable both servers since they read the same config file.

---

## Uninstall

Uninstall stops AIC from running in your editor and removes the config and hooks the installers added. Optionally you can remove all AIC data (compilation history and cache) as described below.

### <a id="uninstall-cursor"></a>Cursor

One run of the Cursor uninstall script does all of the following when it finds something to remove:

- Removes the AIC entry from **`~/.cursor/mcp.json`** (global MCP).
- Removes the AIC entry from **`<project>/.cursor/mcp.json`** if that file exists (workspace-scoped MCP).
- In **`<project>/.cursor/`**: strips AIC hook entries from `hooks.json`, deletes the deployed `AIC-*.cjs` scripts under `hooks/`, and removes the trigger rule `rules/AIC.mdc`.
- Under **`~/.aic/`** (global data dir): removes cache and other non-database files while keeping `aic.sqlite` (and WAL/SHM) unless you opt out. To remove **`~/.aic/` entirely** including the database, pass `--keep-aic-database=0` or set `AIC_UNINSTALL_KEEP_AIC_DATABASE=false` (see `integrations/clean-global-aic-dir.cjs`).

**Project directory** (`<project>`) is resolved in this order: environment variable `AIC_UNINSTALL_PROJECT_ROOT` (if set and non-empty); otherwise the `--project-root` / `--project-root=<path>` argument; otherwise the **current working directory** when you run Node.

From a terminal, change to the AIC repository (or use an absolute path to the script), then run:

```bash
cd /path/to/agent-input-compiler
node integrations/cursor/uninstall.cjs
```

To clean hooks and workspace MCP for a **different** project while running the script from the repo:

```bash
cd /path/to/agent-input-compiler
node integrations/cursor/uninstall.cjs --project-root /path/to/your-project
```

Equivalent using the environment variable:

```bash
AIC_UNINSTALL_PROJECT_ROOT=/path/to/your-project node /path/to/agent-input-compiler/integrations/cursor/uninstall.cjs
```

If you do not have the repo, copy **`integrations/cursor/uninstall.cjs`** and **`integrations/cursor/aic-hook-scripts.json`** from the [AIC repository](https://github.com/Jatbas/agent-input-compiler) into the same folder, then run `node` on `uninstall.cjs` from a shell whose working directory is the project you want to clean (or set `AIC_UNINSTALL_PROJECT_ROOT` / `--project-root` as above).

Restart Cursor (or use **MCP: Reload Configurations**) after a successful uninstall so the editor picks up the change.

### <a id="uninstall-claude-code-plugin"></a>Claude Code (plugin)

1. In Claude Code, run `/plugin` and uninstall the AIC plugin. No script is required.
2. Restart or reload Claude Code if needed.

### <a id="uninstall-claude-code-direct"></a>Claude Code (direct installer)

The direct-installer uninstall removes AIC hook entries from **`~/.claude/settings.json`** and deletes the AIC scripts under **`~/.claude/hooks/`**. It applies the same **`~/.aic/`** cleanup rules as the Cursor uninstall (default: strip non-database files; optional full removal via `--keep-aic-database=0` / `AIC_UNINSTALL_KEEP_AIC_DATABASE=false`).

From a terminal:

```bash
cd /path/to/agent-input-compiler
node integrations/claude/uninstall.cjs
```

If the script is elsewhere, use the full path to `integrations/claude/uninstall.cjs` (it must sit next to **`integrations/claude/aic-hook-scripts.json`** in the tree). Restart Claude Code (or reload) after a successful uninstall.

### <a id="uninstall-other-editors"></a>Other editors

Remove the `aic` entry from your editor’s global MCP config (the file and key name depend on the editor). Optionally delete the project’s `.aic/` directory for local metadata; compilation history for all projects still lives in **`~/.aic/aic.sqlite`** until you remove `~/.aic` (see [Optional: remove all data](#uninstall-optional--remove-all-data)).

### <a id="uninstall-optional--remove-all-data"></a>Optional — remove all data

If you already ran an uninstall with **`--keep-aic-database=0`** (or `AIC_UNINSTALL_KEEP_AIC_DATABASE=false`), the global database is gone. Otherwise, to delete compilation history and cache (global DB and per-project rows), remove the data directory:

```bash
rm -rf ~/.aic
```
