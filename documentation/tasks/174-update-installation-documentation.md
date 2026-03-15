# Task 174: Update Installation Documentation

> **Status:** Pending
> **Phase:** U — Claude Code Zero-Install
> **Layer:** documentation
> **Depends on:** U01 (integrations/claude/install.cjs), U05 (Claude Code Plugin Package)

## Goal

Update `documentation/installation.md` to document both Claude Code installation paths (plugin and direct installer), the MCP server prerequisite, and troubleshooting when hooks do not fire.

## Architecture Notes

- Documentation recipe: no code or test files; only `.md` changes.
- Scope: Claude Code section, Server Scope table row for Claude Code, Per-Project Artifacts table note, Version Updates bullet for Claude Code. Cursor section unchanged.
- Change Specification uses exact current text and target text so the executor applies edits without interpretation.
- Cross-references: `documentation/claude-code-integration-layer.md` remains the design reference.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `documentation/installation.md` (Claude Code paths, prerequisite, troubleshooting, Server Scope, Per-Project Artifacts, Version Updates) |

## Change Specification

### Change 1: Table of Contents — Claude Code subsection headings

**Current text:**
> - [Claude Code](#claude-code)
>   - [Global Installation (Zero-Intervention)](#global-installation-zero-intervention)
>   - [Trigger Rule](#trigger-rule-1)
>   - [Hooks](#hooks-1)
>   - [Hook Lifecycle](#hook-lifecycle-1)
>   - [How Hooks Are Delivered](#how-hooks-are-delivered-1)

**Required change:** Reflect the new Claude Code section structure (plugin, direct installer, prerequisite, troubleshooting).

**Target text:**
> - [Claude Code](#claude-code)
>   - [Plugin (Recommended)](#plugin-recommended)
>   - [Direct Installer (For Development)](#direct-installer-for-development)
>   - [Prerequisite](#prerequisite)
>   - [Trigger Rule](#trigger-rule-1)
>   - [Hooks](#hooks-1)
>   - [Hook Lifecycle](#hook-lifecycle-1)
>   - [How Hooks Are Delivered](#how-hooks-are-delivered-1)
>   - [Troubleshooting](#troubleshooting)

### Change 2: Server Scope table — Claude Code install method

**Current text:**
> | **Claude Code** | `~/.claude.json` (`mcpServers` field) | `npx @aic/mcp init` (Phase U)              |

**Required change:** State that Claude Code has two install methods; details are in the Claude Code section.

**Target text:**
> | **Claude Code** | Plugin or project config (see [Claude Code](#claude-code)) | Plugin (recommended) or direct installer (Phase U) |

### Change 3: Per-Project Artifacts table — add Claude Code settings.local.json and update note

**Current text:**
> | `.claude/CLAUDE.md`       | Trigger rule for Claude Code (Phase T)                       | Depends on team preference |
>
> Note: Claude Code's hook scripts are installed globally in `~/.claude/hooks/` (not per-project) and registered in `~/.claude/settings.json`. Only the trigger rule `.claude/CLAUDE.md` is a per-project artifact for Claude Code.

**Required change:** Add `.claude/settings.local.json` for the direct installer path and correct the note: plugin path does not use per-project hook files; direct installer writes settings.local.json with project-local hook paths.

**Target text:**
> | `.claude/CLAUDE.md`       | Trigger rule for Claude Code (Phase T)                       | Depends on team preference |
> | `.claude/settings.local.json` | Hook paths for Claude Code (direct installer only)        | No (gitignored)            |
>
> Note: With the **plugin** path, the plugin provides hooks and MCP registration globally — no per-project hook files. With the **direct installer** path, the installer writes `.claude/settings.local.json` in the project root with paths to `integrations/claude/hooks/` in this project. The trigger rule `.claude/CLAUDE.md` is written in both cases (during bootstrap for direct installer, or by the user for plugin users who disable hooks).

### Change 4: Version Updates — Claude Code bullet

**Current text:**
> - **Claude Code:** Scripts are re-copied into `~/.claude/hooks/` on the next `npx @aic/mcp init` or first-compile bootstrap. Global hook settings in `~/.claude/settings.json` are re-merged to add any new entries.

**Required change:** Describe updates for both paths: plugin users update the plugin; direct installer users re-run the installer or trigger bootstrap.

**Target text:**
> - **Claude Code (plugin):** Update the AIC plugin via Claude Code's plugin management so the new version's hooks and MCP server are used.
> - **Claude Code (direct installer):** Re-run `node integrations/claude/install.cjs` from the project root (or trigger first-compile bootstrap). The installer re-merges hook entries and updates script paths in `.claude/settings.local.json`.

### Change 5: Claude Code section — replace entire section with Plugin, Direct Installer, Prerequisite, Trigger Rule, Hooks, Hook Lifecycle, How Hooks Are Delivered, Troubleshooting

**Current text (section to replace):** From the line that starts with `## Claude Code` through the line that reads `See \`documentation/claude-code-integration-layer.md\` for the full design of the Claude Code implementation.` (inclusive). That is the entire Claude Code section including the subsections Global Installation (Zero-Intervention), Trigger Rule, Hooks, Hook Lifecycle, and How Hooks Are Delivered.

**Required change:** Replace that entire section with the new content that documents both the plugin path (recommended) and the direct installer path (for development), adds Prerequisite and Troubleshooting, and updates How Hooks Are Delivered for both paths.

**Target text (full Claude Code section):**
> ## Claude Code
>
> Phase T (Claude Code Hook-Based Delivery) and Phase U (Claude Code Zero-Install) deliver AIC for Claude Code via two installation paths.
>
> ### Plugin (Recommended)
>
> For most users, install AIC as a Claude Code Plugin. The plugin auto-starts the MCP server and registers all hooks; no manual config edits are required.
>
> 1. Add the AIC marketplace: `claude plugin marketplace add <github-owner>/aic` (replace `<github-owner>` with the GitHub org or user that publishes the AIC plugin).
> 2. Install the plugin: `claude plugin install aic@aic-tools`.
>
> Once installed, the plugin provides the AIC MCP server and the 8 lifecycle hooks. Every project you open in Claude Code gets compiled context automatically.
>
> ### Direct Installer (For Development)
>
> For development or when you have the AIC repo on disk, you can use the standalone installer instead of the plugin. This writes project-local hook paths and does not require the plugin marketplace.
>
> 1. From the **project root** (the repo that contains `integrations/claude/`), run: `node integrations/claude/install.cjs`
> 2. Or run `npx @aic/mcp init` — when you open this project in Claude Code, the MCP server auto-detects Claude Code (for example when `.claude/` exists or `CLAUDE_PROJECT_DIR` is set) and runs the same installer during bootstrap.
>
> The installer creates `.claude/` in the project root, writes `.claude/settings.local.json` with hook commands pointing at `integrations/claude/hooks/` in this project, and writes `.claude/CLAUDE.md` as the trigger rule. No scripts are copied to a global directory; everything stays project-local.
>
> ### Prerequisite
>
> The AIC MCP server must be runnable as `npx @jatbas/aic-mcp` (or `npx @jatbas/aic-mcp@latest`). Ensure the package is available before relying on hooks or the compile flow. The plugin path uses this under the hood; the direct installer path assumes you are in the AIC repo or have the server on your path.
>
> ### Trigger Rule
>
> Claude Code supports custom context files. AIC creates `.claude/CLAUDE.md` (or merges into it) during first-compile bootstrap (direct installer path) or you can add it manually. It instructs the model to call `aic_compile`. For plugin users who set `disableAllHooks: true`, `.claude/CLAUDE.md` in the project root is the fallback so the model still knows to invoke AIC.
>
> ### Hooks
>
> Claude Code provides a richer hook lifecycle than Cursor, including the critical `UserPromptSubmit` event.
>
> | Hook                              | Claude Code Event    | Purpose                                                        |
> | --------------------------------- | -------------------- | -------------------------------------------------------------- |
> | `aic-prompt-compile.cjs`          | `UserPromptSubmit`   | Pre-compiles context for every user message (PRIMARY delivery) |
> | `aic-session-start.cjs`           | `SessionStart`       | Injects architectural invariants (with dual-path fallback)     |
> | `aic-subagent-inject.cjs`         | `SubagentStart`      | Injects context into Bash, Explore, and Plan subagents         |
> | `aic-block-no-verify.cjs`         | `PreToolUse` (Bash)  | Blocks `--no-verify` flag in git commands                      |
> | `aic-after-file-edit-tracker.cjs` | `PostToolUse` (Edit) | Tracks edited files for quality checks                         |
> | `aic-stop-quality-check.cjs`      | `Stop`               | Runs lint/typecheck on edited files; blocks finish on failure  |
> | `aic-pre-compact.cjs`             | `PreCompact`         | Re-compiles context before window compaction                   |
> | `aic-session-end.cjs`             | `SessionEnd`         | Cleanup and session metrics                                    |
>
> ### Hook Lifecycle
>
> Hooks run as Claude Code spawns them — they are independent processes, not part of the MCP server. Claude Code reads the active settings (plugin-provided or `.claude/settings.local.json` / `~/.claude/settings.json`) and invokes the registered commands at the relevant lifecycle events.
>
> Key point: hooks and the MCP server are **separate execution paths**. The MCP server does not control when hooks run. Claude Code does.
>
> ### How Hooks Are Delivered
>
> - **Plugin path:** The plugin ships the 8 `aic-*.cjs` scripts in its `scripts/` directory and registers them in `hooks/hooks.json` using `${CLAUDE_PLUGIN_ROOT}/scripts/`. Claude Code loads the plugin and runs these hooks for every project. No per-project deployment step.
> - **Direct installer path:** Hook scripts live in `integrations/claude/hooks/`. The installer writes `.claude/settings.local.json` with command paths pointing at that directory in the project. Bootstrap (first `aic_compile` or `npx @aic/mcp init` with Claude Code context) runs the installer so the project gets the trigger rule and merged hook entries. Scripts are not copied; they run from the repo.
>
> ### Troubleshooting
>
> **Hooks not firing**
>
> - Check whether `disableAllHooks` is set in your Claude Code settings; if it is true, hooks are disabled. Use `.claude/CLAUDE.md` in the project root so the model still knows to call `aic_compile` on every message.
> - If using the plugin: verify the plugin is enabled (for example via the `/plugin` command in Claude Code).
> - If using the direct installer: confirm `.claude/settings.local.json` exists and contains `aic-` hook entries, and that `.claude/CLAUDE.md` exists for the trigger fallback.
>
> See `documentation/claude-code-integration-layer.md` for the full design of the Claude Code implementation.

## Writing Standards

- **Tone:** Match existing document — formal, active voice, technical but accessible to developers.
- **Audience:** End users and developers installing AIC in Claude Code or Cursor.
- **Terminology:** Use "plugin path" and "direct installer path" consistently; "bootstrap" for first-compile setup; "trigger rule" for `.claude/CLAUDE.md`; "MCP server" for the process that exposes `aic_compile`.
- **Formatting:** Bullets and tables as in the rest of the document; code for commands in backticks; link to Claude Code section for details.
- **Cross-reference format:** Use `[Claude Code](#claude-code)`-style anchors; link to `documentation/claude-code-integration-layer.md` for design details.

## Config Changes

None.

## Steps

### Step 1: Apply changes to documentation/installation.md

Apply each change from the Change Specification in order. For each change: locate the **Current text** in `documentation/installation.md` and replace it exactly with the **Target text**. Preserve any surrounding content (headings, tables, paragraphs) that is not part of the current-text block.

- Change 1: Table of Contents — Claude Code subsection headings.
- Change 2: Server Scope table — Claude Code row.
- Change 3: Per-Project Artifacts table — add `.claude/settings.local.json` row and replace the Note.
- Change 4: Version Updates — replace the single Claude Code bullet with the two bullets (plugin and direct installer).
- Change 5: Replace the entire Claude Code section from the heading `## Claude Code` through the end of the section (including "See documentation/claude-code-integration-layer.md") with the full **Target text** for Change 5 from the Change Specification.

**Verify:** The file has no leftover "Global Installation (Zero-Intervention)" or "~/.claude/hooks/" or "~/.claude/settings.json" in the Claude Code section. Grep for `installCursorHooks` — if present in Cursor section, leave it (out of scope). Grep for `settings.local.json` — at least one occurrence in the Claude Code or Per-Project Artifacts section.

### Step 2: Factual verification

Grep the codebase for each technical claim in the edited sections and confirm they match:

- `integrations/claude/install.cjs` exists and writes `settings.local.json` (path/behavior).
- `integrations/claude/plugin/.mcp.json` contains `npx` and `@jatbas/aic-mcp`.
- `integrations/claude/plugin/.claude-plugin/marketplace.json` contains `aic-tools` and plugin `name` `aic`.
- `mcp/src/editor-integration-dispatch.ts` uses `REL_CC_INSTALL_SCRIPT` and runs `node` on it when `claudeCodeDetected`.

**Verify:** All four checks return matching lines. No claim in the new text contradicts the code.

### Step 3: Consistency verification

Grep `documentation/` for key terms used in the new text: "plugin path", "direct installer", "settings.local.json", "aic-tools", "CLAUDE_PLUGIN_ROOT". Ensure usage is consistent with the updated installation.md and with `documentation/claude-code-integration-layer.md` where it appears.

**Verify:** No conflicting definitions or outdated references in sibling docs that would confuse a reader.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck`
Expected: all pass. Open `documentation/installation.md` and confirm: Table of Contents links match section IDs; the Claude Code section contains Plugin, Direct Installer, Prerequisite, and Troubleshooting; no duplicate or orphan headings.

**Verify:** Lint and typecheck pass; document structure is consistent.

## Tests

| Test case | Description |
| --------- | ----------- |
| Factual verification | Step 2 grep checks confirm technical claims match codebase |
| Consistency verification | Step 3 confirms terminology aligned across docs |
| Link and structure check | Step 4 confirms ToC and section IDs and no stray content |

## Acceptance Criteria

- [ ] All changes in the Change Specification applied to `documentation/installation.md`
- [ ] No "Global Installation (Zero-Intervention)" or outdated ~/.claude/hooks/ or ~/.claude/settings.json description in Claude Code section
- [ ] Plugin path and direct installer path both documented with exact commands
- [ ] Prerequisite (npx @jatbas/aic-mcp) and Troubleshooting (disableAllHooks, /plugin, CLAUDE.md) present
- [ ] Server Scope and Per-Project Artifacts and Version Updates updated as specified
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] Writing Standards (tone, terminology, formatting) followed

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
