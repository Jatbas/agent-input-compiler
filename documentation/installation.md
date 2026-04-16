# Installation & Delivery

How AIC gets installed, what artifacts it creates, and how its components interact across editors and environments. If you are installing for an editor, start with [Install by editor](#install-by-editor). Shared package contents, standalone CLI, first-compile bootstrap, per-project artifacts, disable, version updates, and the known gap for Cursor hooks when disabled are documented under [AIC Server](#aic-server). Terms used in this document are defined in the [Glossary](#glossary) or in context.

## Table of Contents

- [Glossary](#glossary)
- [Install by editor](#install-by-editor)
- [Cursor](#cursor)
  - [One-Click Install (Deeplink)](#one-click-install-deeplink)
  - [Prerequisite](#prerequisite)
  - [What the Deeplink Does](#what-the-deeplink-does)
  - [Claude Code hooks from Cursor](#claude-code-hooks-from-cursor)
  - [Trigger Rule](#trigger-rule)
  - [Hooks](#hooks)
  - [Hook Lifecycle](#hook-lifecycle)
  - [How Hooks Are Delivered](#how-hooks-are-delivered)
  - [Cursor update notifications](#cursor-update-notifications)
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
- [AIC Server](#aic-server)
  - [What Gets Published](#what-gets-published)
  - [CLI Standalone Usage](#cli-standalone-usage)
  - [Environment variables and project config](#environment-variables-and-project-config)
  - [First-Compile Bootstrap](#first-compile-bootstrap)
  - [Per-Project Artifacts](#per-project-artifacts)
  - [Per-Project Disable](#per-project-disable)
  - [Server Scope](#server-scope)
  - [Version Updates](#version-updates)
  - [Known Gap: Cursor Hooks Fire When Disabled](#known-gap-cursor-hooks-fire-when-disabled)
- [AIC Development Environment](#aic-development-environment)
- [Uninstall](#uninstall)
  - [Cursor](#cursor-1)
  - [Bundled uninstall paths](#bundled-uninstall-paths)
  - [Standalone single file](#standalone-single-file)
  - [Claude Code (plugin)](#claude-code-plugin)
  - [Claude Code (direct installer)](#claude-code-direct-installer)
  - [Other editors](#other-editors-1)
  - [Optional — remove all data](#optional--remove-all-data)

---

## Glossary

| Term             | Definition                                                                                                                                                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP**          | Model Context Protocol — how the editor talks to AIC. The editor runs an AIC server process and calls tools such as `aic_compile`.                                                                                                                                                                                                      |
| **Hooks**        | Scripts the editor runs at specific events (e.g. session start, before a message is sent). AIC uses them to inject context and enforce that compilation runs.                                                                                                                                                                           |
| **Bootstrap**    | One-time setup on first use: `.aic/`, `aic.config.json`, ignore files, trigger rule; for Cursor, hook files after `runEditorBootstrapIfNeeded` runs the installer — in-project `integrations/cursor/install.cjs` if present, otherwise the copy bundled inside `@jatbas/aic` (see [First-Compile Bootstrap](#first-compile-bootstrap)). |
| **Trigger rule** | The file (e.g. `.cursor/rules/AIC.mdc` or `.claude/CLAUDE.md`) that instructs the AI to call `aic_compile` as its first action on every message.                                                                                                                                                                                        |

---

## Install by editor

Use this page to pick an editor, then read shared server behavior under [AIC Server](#aic-server).

- **[Cursor](#cursor)** — MCP deeplink, lifecycle hooks, troubleshooting
- **[Claude Code](#claude-code)** — plugin or direct installer, hooks, troubleshooting
- **[Other editors](#other-editors)** — no dedicated integration layer yet; request support via issues

---

## Cursor

### One-Click Install (Deeplink)

The primary installation method for Cursor users. A deeplink URL registers AIC in the global MCP config:

[Install AIC MCP Server](https://jatbas.github.io/agent-input-compiler/install/cursor-install.html)

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

> On first connection or first `aic_compile`, the server creates `aic.config.json`, `.aic/`, ignore-file entries, and the Cursor trigger rule in the project. When Cursor is detected (`.cursor/` exists or `CURSOR_PROJECT_DIR` is set), bootstrap also runs the Cursor installer: it prefers `<project>/integrations/cursor/install.cjs` when that file exists, otherwise the installer shipped inside the npm package at package-relative `integrations/cursor/install.cjs`. That run writes `.cursor/hooks.json` and the hook scripts into `.cursor/hooks/`.

Typical flow:

1. User opens a project in Cursor; Cursor spawns the server (`npx -y @jatbas/aic@latest`).
2. With **roots** capability, init bootstraps each root (trigger rule, config, ignores, and Cursor hooks when Cursor is in use).
3. Without roots, the same steps run on the first `aic_compile`.
4. After hooks are installed, enforcement and context injection match the tables below; until then the trigger rule alone asks the model to call `aic_compile`.

No per-project MCP registration is needed. To verify the server: use `aic_status`, send a message so `aic_compile` runs, or ask the model to **run aic model test** (MCP `aic_model_test` — end-to-end probe including `aic_compile`).

### Claude Code hooks from Cursor

When you use Cursor, AIC can run the Claude Code installer during bootstrap if the official **Anthropic Claude Code** extension is installed. The server looks under `~/.cursor/extensions` for a directory whose name starts with `anthropic.claude-code` (the VS Marketplace id is `Anthropic.claude-code`). If Cursor is detected for the project and that folder is present, auto bootstrap may install or refresh global Claude Code hook entries even when the project has no `.claude/` directory and `CLAUDE_PROJECT_DIR` is unset. Standalone Claude Code workflows still rely on `.claude/` in the project, `CLAUDE_PROJECT_DIR`, or the plugin as described in [Claude Code](#claude-code).

### Trigger Rule

On bootstrap, AIC creates `.cursor/rules/AIC.mdc` with `alwaysApply: true`. This rule instructs the AI to call `aic_compile` as its first action on every message. The rule is the primary mechanism that makes the AI call AIC.

> The trigger rule is suggestive — compliance depends on the model. Hooks provide stronger enforcement (see below). If `.cursor/rules/AIC.mdc` already exists, AIC does not overwrite it unless the installed rule version differs from the current package version (in which case the file is updated).

### Hooks

When the Cursor installer has run, the project has **13** hook scripts deployed (all match `AIC-*.cjs`; `AIC-subagent-compile.cjs` loads `AIC-subagent-start-model-id.cjs`). They register like this:

| Hook                              | Cursor Event           | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIC-session-init.cjs`            | `sessionStart`         | Injects architectural invariants as `additional_context`                                                                                                                                                                                                                                                                                                                                                                                      |
| `AIC-compile-context.cjs`         | `sessionStart`         | Pre-compiles context so it's ready for the first message                                                                                                                                                                                                                                                                                                                                                                                      |
| `AIC-before-submit-prewarm.cjs`   | `beforeSubmitPrompt`   | Prewarms the compile cache before the AI responds                                                                                                                                                                                                                                                                                                                                                                                             |
| `AIC-require-aic-compile.cjs`     | `preToolUse`           | Compile gate: enforces `aic_compile` before other tools (per-generation marker, 300s default recency fallback, deny-count cap). Override the window with `compileRecencyWindowSecs` in `aic.config.json`. Emergency bypass requires both `devMode` and `skipCompileGate` set to `true` in `aic.config.json`. Uses `failClosed: true`. See [§7.3](technical/cursor-integration-layer.md).                                                      |
| `AIC-inject-conversation-id.cjs`  | `preToolUse`           | Injects `conversationId` into `aic_compile` and `aic_chat_summary` when present; for `aic_compile` also sets `editorId` to `cursor` on the augmented tool input. Runs only when `isCursorNativeHookPayload` is true (`cursor_version` / `input.cursor_version`, or fresh `editor-runtime-marker` for `cursor` when `conversationId` is present); see [§4.4](technical/cursor-integration-layer.md#44-runtime-boundary-guards-cursor_version). |
| `AIC-post-compile-context.cjs`    | `postToolUse`          | Injects confirmation `additional_context` after successful compile                                                                                                                                                                                                                                                                                                                                                                            |
| `AIC-after-file-edit-tracker.cjs` | `afterFileEdit`        | Tracks edited files for quality checks                                                                                                                                                                                                                                                                                                                                                                                                        |
| `AIC-session-end.cjs`             | `sessionEnd`           | Cleanup and session metrics                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `AIC-subagent-compile.cjs`        | `subagentStart`        | Calls `aic_compile` for telemetry; Cursor subagentStart cannot inject `additional_context`                                                                                                                                                                                                                                                                                                                                                    |
| `AIC-subagent-stop.cjs`           | `subagentStop`         | After a Task-tool subagent finishes ([Cursor agent hooks](https://cursor.com/docs/agent/hooks)), reparents `compilation_log` rows from the subagent session to the parent conversation so `aic_chat_summary` stays on one thread; best-effort `aic_compile` with no full pipeline                                                                                                                                                             |
| `AIC-stop-quality-check.cjs`      | `stop`                 | Runs lint/typecheck on edited files; auto-fix via `followup_message`                                                                                                                                                                                                                                                                                                                                                                          |
| `AIC-block-no-verify.cjs`         | `beforeShellExecution` | Blocks `--no-verify` flag in git commands                                                                                                                                                                                                                                                                                                                                                                                                     |

### Hook Lifecycle

Hooks run as Cursor spawns them — they are independent processes, not part of the MCP server. Cursor reads `.cursor/hooks.json` and invokes the registered commands at the appropriate lifecycle events.

> Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Cursor does.

### How Hooks Are Delivered

Hook scripts are authored in `integrations/cursor/hooks/` and deployed to each project's
`.cursor/hooks/` by the Cursor installer (`integrations/cursor/install.cjs`). Bootstrap invokes that script automatically for Cursor users (bundled in `@jatbas/aic`, or the in-project copy when your team commits `integrations/cursor/`). You can also run `node integrations/cursor/install.cjs` manually with the project as cwd.

1. **Registers hooks** — creates or merges `.cursor/hooks.json` with the hook definitions (event type, command, matcher, timeout, etc.)
2. **Copies scripts** — copies every `integrations/shared/*.cjs` into `.cursor/hooks/` (with `AIC-` filename prefix and rewritten hook-local `require` paths), copies Cursor-local utilities from `integrations/cursor/` (currently `is-cursor-native-hook-payload.cjs`) the same way, then copies each basename listed in `integrations/cursor/aic-hook-scripts.json` from `integrations/cursor/hooks/` into `.cursor/hooks/` under the same names

The `.cursor/` directory is a **deployment target** — hook scripts are never authored there directly.
Re-running the installer merges any missing hook entries without overwriting user-added hooks and re-copies scripts from the installer source (in-project tree or bundled package copy).

Hook-by-hook behavior, stdin/stdout contracts, and Cursor limitations are documented in [Cursor integration layer](technical/cursor-integration-layer.md).

### Cursor update notifications

AIC checks for newer published versions during compilation. When a newer version is available, the `aic_compile` response includes an `updateMessage` that the model can surface in chat. This matches the behavior described for Claude Code under [Update Notifications](#update-notifications).

### Troubleshooting (Cursor)

**Hooks not firing**

- Confirm `.cursor/hooks.json` and `.cursor/hooks/AIC-*.cjs` exist. After the deeplink, opening the project in Cursor should run bootstrap and install hooks from the published package; if they are missing, ensure `.cursor/` exists so Cursor is detected, reload the window, or run `node path/to/integrations/cursor/install.cjs` with cwd at your project (checkout copy or vendored tree). Then reload Cursor.
- If `npx` cannot reach the registry (proxy, offline), fix network or use an npm mirror before the MCP server can start.
- Ensure the AIC MCP server is enabled in Cursor: Settings → MCP → AIC server on.

### `aic_compile` tool not found or not called

- In Cursor: Settings → MCP → ensure the AIC server is enabled and the `aic_compile` tool is set to "Always allow". Reload the window (Cmd+Shift+P → Reload Window) after changing MCP settings.

---

## Claude Code

AIC supports Claude Code via two installation paths: the plugin (recommended) and the direct installer (for development). There is no one-click install URL for Claude Code; use the plugin or the direct installer below.

### Plugin (Recommended)

For most users, install AIC as a Claude Code Plugin. The plugin auto-starts the MCP server and registers all hooks; no manual config edits are required.

1. Add the AIC marketplace: `/plugin marketplace add Jatbas/agent-input-compiler`
2. Install the plugin: `/plugin install aic@aic-tools`

Once installed, the plugin provides the AIC MCP server and the full Claude Code hook set registered in `integrations/claude/settings.json.template`. Every project you open in Claude Code gets compiled context automatically.

**Enable auto-updates:** Third-party marketplaces (including AIC) do not auto-update by default. To receive updates automatically when a new version is pushed:

1. Run `/plugin` to open the plugin manager
2. Go to the **Marketplaces** tab
3. Select **Enable auto-update** for the AIC marketplace

With auto-update enabled, Claude Code refreshes the marketplace and updates the plugin at startup. If the plugin was updated, a notification prompts you to run `/reload-plugins` to activate the changes.

### Direct Installer

Run `node integrations/claude/install.cjs` from the AIC repo (or from a path where the script and `integrations/claude/hooks/` are available). The installer copies the AIC hook scripts for every command registered in `integrations/claude/settings.json.template` (including the compile helper and supporting scripts) to `~/.claude/hooks/` and merges AIC hook entries into `~/.claude/settings.json`. Every project you open in Claude Code then gets compiled context. Optionally, the installer writes `.claude/CLAUDE.md` in the current working directory for the trigger-rule fallback.

### Prerequisite

The AIC MCP server must be runnable as `npx -y @jatbas/aic@latest` (Node 20+), same as Cursor. Ensure the package is reachable from your network before relying on hooks or the compile flow. The plugin path uses this under the hood; the direct installer path assumes you are in the AIC repo or have the server on your path. In minimal or remote setups where the process cwd is not the project root, `CLAUDE_PROJECT_DIR` may be set by the environment (see [Environment variables](#environment-variables)) — analogous to `CURSOR_PROJECT_DIR` for Cursor.

### Trigger Rule

Claude Code supports custom context files. `.claude/CLAUDE.md` in the project root is the fallback when hooks are disabled — it instructs the model to call `aic_compile`. The direct installer may write it when run from a project directory; plugin users who set `disableAllHooks: true` can add it manually.

### Hooks

Claude Code provides a richer hook lifecycle than Cursor, including the critical `UserPromptSubmit` event.

| Hook                              | Claude Code Event          | Purpose                                                                                                                                                              |
| --------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aic-prompt-compile.cjs`          | `UserPromptSubmit`         | Pre-compiles context for every user message (PRIMARY delivery)                                                                                                       |
| `aic-session-start.cjs`           | `SessionStart`             | Injects architectural invariants (with dual-path fallback)                                                                                                           |
| `aic-subagent-inject.cjs`         | `SubagentStart`            | Injects context into Bash, Explore, and Plan subagents                                                                                                               |
| `aic-pre-tool-gate.cjs`           | `PreToolUse` (unmatched)   | Blocks non–`aic_compile` tool calls until compile recency or per-turn markers pass (see [Claude Code integration layer](technical/claude-code-integration-layer.md)) |
| `aic-block-no-verify.cjs`         | `PreToolUse` (Bash)        | Blocks `--no-verify` flag in git commands                                                                                                                            |
| `aic-inject-conversation-id.cjs`  | `PreToolUse` (MCP)         | Injects `conversationId`, `editorId`, and cached `modelId` into `aic_compile` when the model omits them                                                              |
| `aic-after-file-edit-tracker.cjs` | `PostToolUse` (Edit/Write) | Tracks edited files for quality checks                                                                                                                               |
| `aic-stop-quality-check.cjs`      | `Stop`                     | Runs lint/typecheck on edited files; blocks finish on failure                                                                                                        |
| `aic-pre-compact.cjs`             | `PreCompact`               | Re-compiles context before window compaction                                                                                                                         |
| `aic-subagent-stop.cjs`           | `SubagentStop`             | Reparents `compilation_log` after Task-tool subagents                                                                                                                |
| `aic-session-end.cjs`             | `SessionEnd`               | Cleanup and session metrics                                                                                                                                          |

The installer also deploys `aic-compile-helper.cjs` to `~/.claude/hooks/`; context hooks require it at runtime, but it is not registered as its own lifecycle event row above.

### Hook Lifecycle

Hooks run as Claude Code spawns them — they are independent processes, not part of the MCP server. Claude Code reads the active settings (plugin-provided or `~/.claude/settings.json`) and invokes the registered commands at the relevant lifecycle events.

> Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Claude Code does.

### How Hooks Are Delivered

- **Plugin path:** The plugin provides the same hook set as `integrations/claude/settings.json.template` (and supporting scripts) and registers them with Claude Code; no per-project deployment.
- **Direct installer path:** The installer copies hook scripts to `~/.claude/hooks/` and merges AIC hook entries into `~/.claude/settings.json`; bootstrap runs the installer on first use so every project gets compiled context.

See [Claude Code integration layer](technical/claude-code-integration-layer.md) for how hooks are packaged and delivered in each path.

For how hook-spawned helper calls relate to Claude Code's registered `aic` MCP server and tool-result size limits, see [§4.1 — Why no AIC core changes are needed](technical/claude-code-integration-layer.md#41-why-no-aic-core-changes-are-needed).

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

## AIC Server

### What Gets Published

The npm package `@jatbas/aic` ships `dist/` (the compiled MCP server with shebang for `npx` execution) and bundled copies of `integrations/cursor/`, `integrations/shared/`, and `integrations/claude/` used by bootstrap. Source hook scripts remain in the repository (`integrations/cursor/hooks/`, `integrations/claude/hooks/`); the published installers deploy them when bootstrap or a manual run executes the corresponding `install.cjs` (see [Cursor](#cursor) and [Claude Code](#claude-code)). Teams can still commit `integrations/cursor/` or `integrations/claude/` into a repo so that in-project copies override the bundled installers.

The server is the primary interface. It exposes these MCP tools:

| Tool               | Purpose                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aic_compile`      | Compile context for the current AI message                                                                                                                                                                                         |
| `aic_inspect`      | Inspect pipeline trace (JSON metadata; no per-file bodies in the tool response)                                                                                                                                                    |
| `aic_status`       | Project-level status and compilation aggregates                                                                                                                                                                                    |
| `aic_last`         | Most recent compilation details; MCP JSON also includes optional top-level `selection` (selection trace) or `null` — see [Implementation Spec — `aic_last`](implementation-spec.md#aic_last-mcp-tool)                              |
| `aic_chat_summary` | Per-conversation compilation stats                                                                                                                                                                                                 |
| `aic_projects`     | List all known AIC projects                                                                                                                                                                                                        |
| `aic_model_test`   | Optional agent capability probe (challenges, embedded `aic_compile`, structured pass/fail)                                                                                                                                         |
| `aic_compile_spec` | Structured spec compilation (`spec` required, optional `budget`); returns `{ compiledSpec, meta }` from `SpecificationCompilerImpl` — [Implementation Spec — `aic_compile_spec`](implementation-spec.md#aic_compile_spec-mcp-tool) |

The four **show aic …** prompt commands ("show aic status", "show aic last", "show aic chat summary", "show aic projects") map to the same **formatted tables** on stdout whether you run the **CLI** (`npx @jatbas/aic <subcommand>`, or `pnpm aic <subcommand>` from the repo root when developing) or the model follows the **Cursor trigger rule**, which instructs calling the MCP tools `aic_status`, `aic_last`, `aic_chat_summary`, and `aic_projects` instead of shell. Table rendering matches `mcp/src/format-diagnostic-output.ts`. MCP tool JSON for **`aic_last`** can include additional fields not printed by the CLI (notably top-level **`selection`**); use MCP JSON or [Implementation Spec — `aic_last`](implementation-spec.md#aic_last-mcp-tool) when you need the selection trace.

A fifth prompt — **run aic model test** — is **MCP-only** (no matching CLI subcommand): the model calls `aic_model_test`, completes the challenges (including an `aic_compile` with a specific intent), calls `aic_model_test` again with answers, and presents the pass/fail result. Full wording for editors lives in the installed trigger rules (for example `.cursor/rules/AIC-architect.mdc` and `.claude/CLAUDE.md`).

### CLI Standalone Usage

The same binary that runs as the MCP server also works as a standalone CLI tool. You can invoke the four diagnostic subcommands directly from a terminal — no editor required:

| Subcommand                     | What it does                                                                                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                       | Project-level AIC status (compilations, token stats, budget, guard findings). Optional rolling window: `status <N>d` with integer **N** from 1 through 3660 (for example `status 14d`); omit the suffix for all-time aggregates |
| `last`                         | Prints the same summary fields as the formatted "show aic last" table (intent, files, tokens, reduction, etc.); does not print MCP-only **`selection`** — use MCP `aic_last` JSON for the trace                                 |
| `chat-summary --project <dir>` | Per-conversation compilation stats for the given project directory                                                                                                                                                              |
| `projects`                     | All known AIC projects (ID, path, last seen, compilation count)                                                                                                                                                                 |

**Usage:**

```bash
# Published release — works from any directory
npx @jatbas/aic status
npx @jatbas/aic status 14d
npx @jatbas/aic last
npx @jatbas/aic chat-summary --project /path/to/project
npx @jatbas/aic projects

# Development mode — requires pnpm build; run from repo root
pnpm aic status
pnpm aic last
pnpm aic chat-summary --project /path/to/project
pnpm aic projects
```

If your shell working directory is not registered in the global AIC database (including some git worktree roots), pass `--project <absolute path>` to `status`, `last`, and `chat-summary` in addition to the `chat-summary` examples above. See [CONTRIBUTING.md — Local MCP testing](../CONTRIBUTING.md#local-mcp-testing).

Each subcommand opens the database read-only, prints formatted table output to stdout, and exits. The tables use the same human-readable labels as the four **show aic …** prompt commands (for example Compilations, Project path, Last compilation). For **`last`**, stdout omits the **`selection`** field that MCP JSON may include.

### Environment variables and project config

End users rarely need these; integrators and contributors use them for uninstall, CI, or repo development. Rows whose **Name** starts with a JSON field document `aic.config.json`, not a process environment variable.

| Name                                            | Where it matters                                                                                                                                      | Purpose                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIC_BOOTSTRAP_INTEGRATION`                     | MCP server startup                                                                                                                                    | Forces which editor installers run when auto-detection is wrong. Values: `auto`, `none`, `cursor`, `claude-code`, `cursor-claude-code`. See [Bootstrap integration override](#bootstrap-integration-override-remote--ci--nonstandard-layouts).                                                           |
| `AIC_UNINSTALL_PROJECT_ROOT`                    | `integrations/cursor/uninstall.cjs`, `integrations/claude/uninstall.cjs`                                                                              | Non-empty value selects the project directory when you cannot `cd` there first.                                                                                                                                                                                                                          |
| `AIC_UNINSTALL_KEEP_AIC_DATABASE`               | `integrations/clean-global-aic-dir.cjs` / uninstall flow (only when **`--global`** runs)                                                              | When `false`, global `~/.aic/` cleanup can remove `aic.sqlite`; when unset, the CLI default is to keep the database unless **`--global --remove-database`** is passed.                                                                                                                                   |
| `CURSOR_PROJECT_DIR`                            | Cursor hooks                                                                                                                                          | Project root when Cursor runs hook processes (see [Cursor integration layer](technical/cursor-integration-layer.md)).                                                                                                                                                                                    |
| `CLAUDE_PROJECT_DIR`                            | Claude Code hooks / shared resolver                                                                                                                   | Project root in minimal or remote layouts when the cwd is not the repo root (see [implementation-spec.md](implementation-spec.md) and [Claude Code integration layer](technical/claude-code-integration-layer.md)).                                                                                      |
| `AIC_PROJECT_ROOT`                              | Cursor compile hooks                                                                                                                                  | Injected after a successful `aic_compile` so later hooks resolve the same project (see [Cursor integration layer](technical/cursor-integration-layer.md)).                                                                                                                                               |
| `AIC_CONVERSATION_ID`                           | Hooks / `aic_compile`                                                                                                                                 | Stable conversation key for compile and chat-summary tooling.                                                                                                                                                                                                                                            |
| `devMode` in `aic.config.json`                  | CLI routing / uninstall scripts                                                                                                                       | When `true`, enables dev CLI routing (`pnpm aic` instead of `npx @jatbas/aic`). Uninstall scripts exit without changes unless **`--force`**.                                                                                                                                                             |
| `skipCompileGate` in `aic.config.json`          | Cursor `preToolUse` compile gate (`AIC-require-aic-compile.cjs`); Claude Code `aic-compile-helper.cjs` (reads bypass via `read-project-dev-mode.cjs`) | Emergency bypass: when `true` **and** `devMode` is also `true`, skips the Cursor compile gate and skips compile helper–driven MCP calls on the Claude path. Remove immediately after fixing the issue that required it. See [Claude Code integration layer](technical/claude-code-integration-layer.md). |
| `compileRecencyWindowSecs` in `aic.config.json` | Cursor and Claude Code compile gates (`integrations/shared/compile-recency.cjs`)                                                                      | Positive number: recency window in seconds for “recent compile” fallback (default **300** when unset).                                                                                                                                                                                                   |

### First-Compile Bootstrap

When `aic_compile` runs for a new project for the first time, `ensureProjectInit` runs:

1. Creates `.aic/` directory with `0700` permissions
2. Generates a stable UUIDv7 project ID in `.aic/project-id`
3. Writes `aic.config.json` as `{}` when the file is missing (empty object until you add fields)
4. Appends missing lines to `.gitignore`, `.eslintignore`, and `.prettierignore` using the same four ignore patterns as `shared/src/storage/aic-ignore-entries.json` (`lines` array: `.aic/`, `aic.config.json`, `.cursor/rules/AIC.mdc`, `.cursor/hooks.json`) for all three files; existing entries are left unchanged
5. Installs the trigger rule (editor-specific — e.g., `.cursor/rules/AIC.mdc` for Cursor, `.claude/CLAUDE.md` for Claude Code)
6. **Cursor:** When Cursor is detected, the server runs the Cursor installer on init — `<project>/integrations/cursor/install.cjs` if present, otherwise the copy bundled in `@jatbas/aic` (`integrations/cursor/install.cjs` relative to the installed package). That run writes `.cursor/hooks.json` and copies every script listed in `integrations/cursor/aic-hook-scripts.json` plus top-level `integrations/shared/*.cjs` into `.cursor/hooks/`. **Claude Code:** Auto bootstrap runs the Claude installer when the project has `.claude/`, `CLAUDE_PROJECT_DIR` is set, or (with Cursor detected) an `anthropic.claude-code*` extension folder exists under `~/.cursor/extensions` (see [Claude Code hooks from Cursor](#claude-code-hooks-from-cursor)). The server resolves `<project>/integrations/claude/install.cjs` first, otherwise the bundled package copy at `integrations/claude/install.cjs` relative to the installed package. The **plugin** path installs hooks globally without per-project scripts (see [Claude Code](#claude-code)).

When the Cursor installer does run, it is idempotent: hook registrations merge (new entries added, user hooks preserved) and scripts are re-copied to match the installer source (in-project tree or bundled package version). The trigger rule updates only when the installed rule version differs from the current package version. Init runs when the server lists workspace roots or on first `aic_compile`, depending on the client.

After bootstrap, the server compiles context normally. Subsequent calls skip bootstrap entirely (guarded by a per-project once-flag in the compile handler).

### Per-Project Artifacts

After bootstrap, each project contains:

| Path                      | Purpose                                                                                                                                                                                                              | Committed to git?                                                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aic.config.json`         | Project configuration (budget, guard, cache, telemetry). Example: `"guard": { "allowPatterns": ["test/fixtures/**", "docs/**"] }` — see [Implementation Spec — Step 5](implementation-spec.md#step-5-context-guard). | Usually no — bootstrap appends the AIC ignore manifest to `.gitignore`, `.eslintignore`, and `.prettierignore` (including this path); remove the `aic.config.json` line from `.gitignore` (and siblings if present) to commit shared config |
| `.aic/`                   | Project-local AIC directory (`project-id`, ephemeral files)                                                                                                                                                          | No (auto-gitignored)                                                                                                                                                                                                                        |
| `.aic/project-id`         | Stable UUIDv7 — survives folder renames                                                                                                                                                                              | No                                                                                                                                                                                                                                          |
| `.cursor/rules/AIC.mdc`   | Trigger rule for Cursor — tells the AI to call `aic_compile`                                                                                                                                                         | Depends on team preference                                                                                                                                                                                                                  |
| `.cursor/hooks.json`      | Hook registrations for Cursor                                                                                                                                                                                        | Depends on team preference                                                                                                                                                                                                                  |
| `.cursor/hooks/AIC-*.cjs` | Cursor hook scripts — present after bootstrap runs the Cursor installer (bundled or in-project; see [First-Compile Bootstrap](#first-compile-bootstrap))                                                             | Depends on team preference                                                                                                                                                                                                                  |
| `.claude/CLAUDE.md`       | Trigger rule for Claude Code                                                                                                                                                                                         | Depends on team preference                                                                                                                                                                                                                  |

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
- `aic_status` returns `projectEnabled: false` in the JSON payload; the formatted status table does not include a Project row — infer disabled state from compilation behavior and the early-return message from `aic_compile`

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

- **Cursor:** After a package upgrade, the next bootstrap (workspace roots or first `aic_compile`) re-runs the Cursor installer — in-project `integrations/cursor/install.cjs` when present, otherwise the bundled copy — so `.cursor/hooks/` tracks the installed `@jatbas/aic` version. You can also run `node` on an installer path manually with cwd at the project.
- **Claude Code (plugin):** With auto-update enabled (see [Plugin (Recommended)](#plugin-recommended)), the plugin updates automatically at startup. Otherwise, update via `/plugin` in the Installed tab.
- **Claude Code (direct installer):** Re-run `node integrations/claude/install.cjs` (from the AIC repo or a directory that contains the script). The installer updates scripts in `~/.claude/hooks/` and re-merges hook entries in `~/.claude/settings.json`.

### Known Gap: Cursor Hooks Fire When Disabled

> Setting `"enabled": false` in `aic.config.json` makes the MCP server return early, but **Cursor hooks** still fire because Cursor invokes them independently of the MCP server. The practical impact is minimal — hooks run but `aic_compile` returns immediately — though each invocation still pays a small process-spawn cost. A future improvement could have hook scripts check `aic.config.json` directly and exit early.
>
> Claude Code is different: hooks are global, but they still call MCP tools such as `aic_compile` the same way — when disabled, those calls return immediately with the same early-return message.

---

## AIC Development Environment

The dev server is pre-configured in `.cursor/mcp.json` (checked into the repo as `"aic-dev"`). It runs from TypeScript source and uses hand-maintained hooks that include dev-only extras not present in the published package. Cloning the repo is the main prerequisite; if the checked-in `cwd` path does not match your machine, edit `.cursor/mcp.json` so `cwd` points at your checkout root. In Cursor, programmatic MCP calls from agents may use the runtime server identifier `project-0-AIC-aic-dev` for this workspace (the JSON key stays `aic-dev`); see [CONTRIBUTING.md — Local MCP testing](../CONTRIBUTING.md#local-mcp-testing).

> **The production server must be disabled while developing AIC.** If both run simultaneously, the production server overwrites dev hooks with published versions, the AI sees duplicate `aic_compile` tools, and both write to the same database. Disable the production server in whatever IDE you are using before opening the AIC project. In Cursor, remove only the production `aic` MCP entry from `~/.cursor/mcp.json` (leave other MCP servers intact). When you need AIC as an end user elsewhere, add that entry back. In Claude Code, disable the AIC plugin (via `/plugin` → disable or uninstall) or remove the AIC MCP and hook entries from `~/.claude/settings.json` if you use the direct installer. Re-enable or re-run the installer when you want to use AIC as an end user again.
>
> No `aic.config.json` changes are needed. The `"enabled"` flag would disable both servers since they read the same config file.

### Bootstrap integration override (remote / CI / nonstandard layouts)

When automatic editor detection fails (for example, remote extensions, minimal CI images, or layouts without `.cursor` / `.claude`), administrators can force which integration installers run when the MCP server starts.

**Precedence:** the process argument `--aic-bootstrap-integration=<value>` wins over the environment variable `AIC_BOOTSTRAP_INTEGRATION`; both win over implicit detection.

**Allowed values:** `auto` (default), `none`, `cursor`, `claude-code`, `cursor-claude-code`. Invalid values cause a one-line message on stderr and exit code `1` before the server connects.

The repository dev MCP entry uses `sh -c`; append the flag to the inner command or set `env.AIC_BOOTSTRAP_INTEGRATION`, for example:

```json
"args": [
  "-c",
  "cd /path/to/AIC && pnpm --filter @jatbas/aic-core build >&2 && npx tsx mcp/src/server.ts --aic-bootstrap-integration=cursor"
]
```

---

## Uninstall

Disable or remove the editor integration first where that applies (turn off the AIC MCP entry in Cursor, uninstall the Claude Code plugin, or otherwise stop hooks from running). Then run the matching uninstall script: `integrations/cursor/uninstall.cjs` or `integrations/claude/uninstall.cjs` from a repository clone, or the copies under [Bundled uninstall paths](#bundled-uninstall-paths) inside `node_modules/@jatbas/aic`.

**`<project>`** is the resolved project directory for that uninstall run (how it is chosen is under **Project directory** below).

**Default (no flags):** no **global** cleanup — `~/.claude/`, `~/.aic/`, and user-level **`~/.cursor/mcp.json`** are not touched **when those paths differ from `<project>`**. Project-local steps still run under **`<project>/.cursor/`** and **`<project>/.aic/`** (the project tree). If the resolved **`<project>`** is your home directory (or any root where `<project>/.cursor/mcp.json` is the same file as the global MCP config), default mode can still edit that `.cursor/` tree; pass **`--project-root`** to your checkout when you need a clear separation. **Global cleanup** (explicit user-level Cursor MCP, global Claude wiring, and `~/.aic/` maintenance) runs only with **`--global`**.

The Cursor uninstall script can clear **global Claude Code AIC state** when you use **`--global`**, because first-compile bootstrap can install Claude hooks when the Claude Code extension is present under Cursor. Claude-only users can run the Claude uninstall script instead; both entrypoints accept the same flags and project-root resolution.

If **`aic.config.json`** under the same **`<project>`** as this run contains **`"devMode": true`**, uninstall prints a message and exits successfully **without changing any files**, unless you pass **`--force`** (which prints a notice on stdout and proceeds). Missing or invalid config is treated as not dev mode.

### Cursor

One run of `integrations/cursor/uninstall.cjs` (or the [bundled copy](#bundled-uninstall-paths)) always targets **`<project>`** when present:

- From `<project>/.cursor/mcp.json` (workspace MCP — the project tree’s Cursor MCP file, not `~/.cursor/mcp.json`): removes the AIC MCP entry.
- In `<project>/.cursor/`: removes AIC hook entries in `hooks.json`, deployed `AIC-*.cjs` scripts under `hooks/`, and the trigger rule `rules/AIC.mdc`.
- **Project files** (unless **`--keep-project-artifacts`**): `aic.config.json`, the `.aic/` directory (never the global `~/.aic/` tree), lines in `.gitignore` / `.prettierignore` / `.eslintignore` that match the AIC ignore manifest, and the AIC managed block in `.claude/CLAUDE.md` (or the whole file when it matches the canonical inner body). With **`--keep-project-artifacts`**, those project files are preserved, but **project** Cursor MCP and project hooks/trigger above are still removed.

**With `--global` only**, the script also removes when present:

- The AIC entry from **`~/.cursor/mcp.json`** (global MCP).
- **Global Claude Code:** AIC hook commands in `~/.claude/settings.json` (commands matching `aic-*.cjs`), the `aic` key in `mcpServers` (case-insensitive), and AIC scripts under `~/.claude/hooks/` listed in the Claude hook manifest.
- Under **`~/.aic/`:** non-database files are removed; **`aic.sqlite`** (and SQLite WAL/SHM sidecar files) are **kept by default**. For full removal including the database, use **`--global --remove-database`**. The environment variable **`AIC_UNINSTALL_KEEP_AIC_DATABASE`** still overrides when global cleanup runs (`false` / `0` forces deletion; `true` / `1` forces preservation). **`--remove-database` without `--global`** has no effect on the filesystem; the script prints a warning to stderr.

Legacy **`--keep-aic-database`** argv forms (including **`=0`**, **`=1`**, **`=true`**, **`=false`**, or the bare flag) are still honored during **`--global`** cleanup for compatibility; new automation should prefer **`--remove-database`** for opting out of database preservation.

**Project directory** (`<project>`) resolution order: each script applies `--project-root` / `--project-root=<path>` and `AIC_UNINSTALL_PROJECT_ROOT` first, then calls the shared `resolveProjectRoot` helper with **`useAicProjectRoot: true`** for **`CURSOR_PROJECT_DIR`** (non-empty), **`AIC_PROJECT_ROOT`** (non-empty), and **`process.cwd()`** fallback. **`CLAUDE_PROJECT_DIR` is not used** on this path.

**Flags:**

- **`--global`** — also clean user-level Cursor MCP, global Claude Code wiring, and `~/.aic/` as described above.
- **`--remove-database`** — only with **`--global`**: allow removing `aic.sqlite` (subject to **`AIC_UNINSTALL_KEEP_AIC_DATABASE`**).
- **`--keep-project-artifacts`** — skip project file removals (`aic.config.json`, `.aic/`, ignore lines, managed `.claude/CLAUDE.md`); project Cursor MCP and hooks are still cleaned.
- **`--force`** — bypass the dev-project guard when **`devMode`** is true.

From a checkout (if you only have the published package, use [Bundled uninstall paths](#bundled-uninstall-paths) instead):

```bash
cd /path/to/agent-input-compiler
node integrations/cursor/uninstall.cjs
```

Full removal including global editor config and `~/.aic/` (typical “reset everything”):

```bash
node integrations/cursor/uninstall.cjs --global
```

Different project:

```bash
node integrations/cursor/uninstall.cjs --project-root /path/to/your-project
```

```bash
AIC_UNINSTALL_PROJECT_ROOT=/path/to/your-project node /path/to/agent-input-compiler/integrations/cursor/uninstall.cjs
```

Restart Cursor (or **MCP: Reload Configurations**) after a successful uninstall.

### Bundled uninstall paths

Published package `@jatbas/aic` ships an `integrations/` directory at the **package root** (see `mcp/package.json` `files`). After `pnpm --filter @jatbas/aic build`, the same tree exists under **`mcp/integrations/`** in this repository before publish.

- `integrations/cursor/uninstall.cjs`
- `integrations/claude/uninstall.cjs`
- `integrations/clean-global-aic-dir.cjs` (loaded by both uninstall scripts)
- `integrations/aic-uninstall-standalone.cjs` (single-file bundle; also under `mcp/integrations/` after build)

Shared helpers and data (`integrations/shared/*.cjs`, `aic-ignore-entries.json`, `claude-md-canonical-body.json`) are copied beside them when the bundle is built.

**No repository clone:** from any directory, run `npm install @jatbas/aic` (or `pnpm add @jatbas/aic`), then invoke the script under `node_modules/@jatbas/aic/integrations/…` with `--project-root` or `AIC_UNINSTALL_PROJECT_ROOT` when the target project is not the current working directory, for example:

```bash
node /path/to/node_modules/@jatbas/aic/integrations/cursor/uninstall.cjs --project-root /path/to/your-project
```

### Standalone single file

The repository commits `integrations/aic-uninstall-standalone.cjs`, a single CommonJS bundle produced by the build (`node mcp/scripts/bundle-standalone-uninstall.cjs`). After `pnpm --filter @jatbas/aic build`, a copy also lands at `mcp/integrations/aic-uninstall-standalone.cjs` for the published package tree.

1. Use Node.js 20 or newer.
2. Download the file:

   ```bash
   curl -fsSL -o aic-uninstall-standalone.cjs https://raw.githubusercontent.com/Jatbas/agent-input-compiler/main/integrations/aic-uninstall-standalone.cjs
   ```

3. Run it with `node`. Default behavior matches the Cursor uninstall script (`integrations/cursor/uninstall.cjs`). Pass **`--claude`** before other flags to run the Claude uninstall script instead (`integrations/claude/uninstall.cjs`).
4. Use the same flags as the modular scripts: `--project-root`, `AIC_UNINSTALL_PROJECT_ROOT`, `--global`, `--remove-database`, `--keep-project-artifacts`, `--force`, and the legacy database argv forms described under **### Cursor** above.

You do not need `npm install` or the rest of the `integrations/` tree; the bundle inlines shared helpers and JSON data.

### Claude Code (plugin)

1. In Claude Code, run `/plugin` and uninstall the AIC plugin.
2. If global hooks or project files were installed earlier (e.g. direct installer or Cursor bootstrap), run `integrations/claude/uninstall.cjs` from a clone or `node_modules/@jatbas/aic/integrations/claude/uninstall.cjs` from the published package, with the same flags as **### Cursor** in this section (`--global`, `--remove-database`, `--keep-project-artifacts`, `--force`, `--project-root`; see **Flags** there). Clearing **`~/.claude/`** and **`~/.aic/`** requires **`--global`**; without it, only project-level artifacts under **`<project>`** are removed (see [Uninstall](#uninstall)).
3. Restart or reload Claude Code if needed.

### Claude Code (direct installer)

The direct-installer uninstall uses the same defaults as the Cursor script: **without `--global`**, it only removes project-level artifacts (and does not touch `~/.claude/` or `~/.aic/`). **With `--global`**, it removes global Claude AIC entries (settings hooks, `mcpServers.aic`, hook scripts under `~/.claude/hooks/`) and applies the same **`~/.aic/`** rules as the Cursor script. Unless **`--keep-project-artifacts`** is set, it removes the same project-level artifacts as the Cursor script (`aic.config.json`, `.aic/`, ignore lines, managed `.claude/CLAUDE.md`). It does **not** modify **`<project>/.cursor/`**; use the Cursor uninstall script when Cursor workspace MCP or hooks must be removed.

```bash
cd /path/to/agent-input-compiler
node integrations/claude/uninstall.cjs
```

```bash
node /path/to/node_modules/@jatbas/aic/integrations/claude/uninstall.cjs --project-root /path/to/your-project
```

Use the bundled path when you do not have the repository checkout. Restart Claude Code (or reload) after a successful uninstall.

### Other editors

Remove the `aic` entry from your editor’s global MCP config (path and shape depend on the editor). Optionally delete the project’s `.aic/` directory for local metadata; compilation history for all projects remains in `~/.aic/aic.sqlite` until you remove `~/.aic` (see [Optional — remove all data](#optional--remove-all-data)).

### Optional — remove all data

If you already ran an uninstall with **`--global --remove-database`** (or **`--global`** with `AIC_UNINSTALL_KEEP_AIC_DATABASE=false`), the global database is gone. Otherwise, to delete compilation history and cache (global DB and per-project rows), remove the data directory:

> **Warning:** `~/.aic` holds AIC’s global SQLite database and related files for **all** projects on this machine. Removing it is irreversible.

```bash
rm -rf ~/.aic
```
