# Task 183: Claude Code Global-Only Installation

> **Status:** Pending
> **Phase:** U (Claude Code integration)
> **Layer:** integrations + mcp + documentation
> **Depends on:** U01 (install.cjs exists), U04 (startup self-check), T10 (settings.json.template)
> **Research:** documentation/research/2026-03-16-claude-code-installation-local-vs-global.md

## Goal

Claude Code hooks and settings are installed only in the user’s home directory (`~/.claude/hooks/` and `~/.claude/settings.json`). The installer copies scripts globally and merges into global settings; the startup self-check reads global config. Documentation describes this as the single, authoritative installation model (no project-local hook path) in present-tense, doc-first voice.

## Architecture Notes

- ADR-005: Per-project isolation applies to data (project_id); editor hook registration is global for Claude Code so one install covers all projects.
- Clean layer: `integrations/claude/install.cjs` remains standalone (node:path, node:fs, node:os only); no mcp/src imports.
- Documentation: Authoritative voice only. The reader infers the document describes how the system works; no “we fixed” or “a fix was done.” No references to a project-local path for Claude Code hooks.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/install.cjs` (global install only: copy to ~/.claude/hooks/, merge ~/.claude/settings.json) |
| Modify | `mcp/src/startup-self-check.ts` (read Claude settings from ~/.claude/settings.json only) |
| Modify | `integrations/claude/__tests__/install.test.cjs` (assert global install with HOME=tmpDir) |
| Modify | `documentation/installation.md` (Claude Code section: global only; remove settings.local.json and project-local wording) |
| Modify | `documentation/claude-code-integration-layer.md` (§5, §10.2, §13: global only; remove local-settings option) |
| Modify | `documentation/mvp-progress.md` (U01 and any “settings.local.json” / project-local wording brought in line) |

## Behavior Specification (no new interfaces)

**install.cjs:** (1) Resolve global dir: `path.join(require('node:os').homedir(), '.claude')`. (2) Source scripts from `path.join(__dirname, 'hooks')`. (3) Create `~/.claude/hooks/` with `fs.mkdirSync(..., { recursive: true })`. (4) Copy each `AIC_SCRIPT_NAMES` file from source to `~/.claude/hooks/` using `fs.copyFileSync`. (5) Read `integrations/claude/settings.json.template`; do not rewrite paths (template already uses `$HOME/.claude/hooks/`). (6) Read `~/.claude/settings.json` if it exists; deep-merge AIC hook entries (same merge/cleanup logic as current code, applied to global file); write `~/.claude/settings.json`. (7) If `process.env.CLAUDE_PROJECT_DIR` or `process.cwd()` has a `.claude/` directory (or create it), write `CLAUDE.md` there with `CLAUDE_MD_TEMPLATE` for the trigger-rule fallback. Do not write `.claude/settings.local.json` or any project-local hook registration.

**startup-self-check.ts:** Add a function that reads `path.join(os.homedir(), '.claude', 'settings.json')` (use `import * as os from 'node:os'`). For Claude Code note: if that file exists and contains at least one hook command including `aic-`, set note to "Claude Code: OK"; if the file exists but has no such command, "Claude Code: settings missing AIC hooks"; otherwise no Claude note. Remove reading from project `.claude/settings.local.json` and `.claude/settings.json` for the purpose of hook detection. Derive the Claude note solely from global settings; do not read project `.claude/settings.local.json` or `.claude/settings.json` for hook detection.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Installer — global install only

In `integrations/claude/install.cjs`: Add `const os = require('node:os');`. Compute `globalClaudeDir = path.join(os.homedir(), '.claude')`, `globalHooksDir = path.join(globalClaudeDir, 'hooks')`, and `hooksSourceDir = path.join(__dirname, 'hooks')`. Create `globalHooksDir` with `fs.mkdirSync(globalHooksDir, { recursive: true })`. For each name in `AIC_SCRIPT_NAMES`, copy from `path.join(hooksSourceDir, name)` to `path.join(globalHooksDir, name)` (use `fs.copyFileSync`). Read the template from `path.join(__dirname, 'settings.json.template')`; do not call `rewriteHooksPayload` (template paths are already `$HOME/.claude/hooks/`). Read `path.join(globalClaudeDir, 'settings.json')` if it exists; merge template hooks into existing using the same merge/cleanup logic (mergeHookArrays, filterStaleAic) so non-AIC entries are preserved; write `path.join(globalClaudeDir, 'settings.json')` with the merged payload. Optionally: set `projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd()`, `projectClaudeDir = path.join(projectRoot, '.claude')`; if `projectClaudeDir` exists or you create it, write `path.join(projectClaudeDir, 'CLAUDE.md')` with `CLAUDE_MD_TEMPLATE`. Remove all logic that writes `settings.local.json` or rewrites paths to project `integrations/claude/hooks/`.

**Verify:** Run `node integrations/claude/install.cjs` with `HOME` set to a temp dir; that dir contains `.claude/hooks/` with the 8 hook scripts and `.claude/settings.json` with hook commands pointing at `$HOME/.claude/hooks/`.

### Step 2: Startup self-check — read global Claude settings

In `mcp/src/startup-self-check.ts`: Add `import * as os from 'node:os';`. Add a function `readGlobalClaudeSettings(): ClaudeSettingsParsed | null` that reads `path.join(os.homedir(), '.claude', 'settings.json')` (existsSync, then readFileSync, JSON.parse; on parse error return null). In the Claude Code branch of `runStartupSelfCheck`: set `parsed = readGlobalClaudeSettings()` instead of `readClaudeSettings(projectRoot)`. Set `hasAicHook = parsed !== null && settingsHaveAicHook(parsed)`. For `getClaudeNote`: if global settings have an AIC hook then "Claude Code: OK"; else if global settings file exists then "Claude Code: settings missing AIC hooks"; else null. Do not require project `.claude/` or `.claude/CLAUDE.md` for "OK". Remove dependency on project `.claude/settings.local.json` and `.claude/settings.json` for hook detection.

**Verify:** Unit tests in `mcp/src/__tests__/startup-self-check.test.ts` that assert Claude note from global path; add or adjust tests so that when a fake home has `.claude/settings.json` with an aic- command, the note is "Claude Code: OK".

### Step 3: Install tests — assert global install

In `integrations/claude/__tests__/install.test.cjs`: In `fresh_install_creates_settings`, set `HOME = tmpDir` (or equivalent) in the env passed to `execFileSync` so the installer writes to the temp dir. Assert `path.join(tmpDir, '.claude', 'hooks')` exists and contains the 8 script files from `AIC_SCRIPT_NAMES`. Assert `path.join(tmpDir, '.claude', 'settings.json')` exists, parses as JSON, has a `hooks` object, and at least one hook command contains `aic-` and `.claude/hooks/` (or `$HOME/.claude/hooks`). Rename the test to `fresh_install_creates_global_settings`. In `merge_preserves_non_aic_entries`, pre-create `path.join(tmpDir, '.claude', 'settings.json')` (not `settings.local.json`) with non-AIC hook entries; run the installer with `HOME=tmpDir`; assert the non-AIC entry is still present and AIC entries were added to `path.join(tmpDir, '.claude', 'settings.json')`.

**Verify:** Run `node integrations/claude/__tests__/install.test.cjs`; both tests pass.

### Step 4: documentation/installation.md — Claude Code global only

Apply the following changes. Use authoritative, present-tense voice. Do not mention a project-local path or “we fixed.”

- **Table row for .claude/settings.local.json:** Remove the row that lists `.claude/settings.local.json` as “Hook paths for Claude Code (direct installer only)”. Remove the “No (gitignored)” cell for that row. In the note below the table, replace the sentence that says the direct installer writes `.claude/settings.local.json` in the project root with: the direct installer copies hook scripts to `~/.claude/hooks/` and merges AIC hook entries into `~/.claude/settings.json`, so every project gets compiled context with one install. Keep the sentence that the plugin provides hooks globally.
- **Version Updates — Claude Code (direct installer):** Replace “Re-run `node integrations/claude/install.cjs` from the project root (or trigger first-compile bootstrap). The installer re-merges hook entries and updates script paths in `.claude/settings.local.json`.” with: “Re-run `node integrations/claude/install.cjs` (from the AIC repo or a directory that contains the script). The installer updates scripts in `~/.claude/hooks/` and re-merges hook entries in `~/.claude/settings.json`.”
- **Claude Code section — Direct Installer:** Replace the subsection “Direct Installer (For Development)” and its two numbered steps and the paragraph that says the installer creates `.claude/` in the project root and writes `settings.local.json` with: “**Direct installer** — Run `node integrations/claude/install.cjs` from the AIC repo (or from a path where the script and `integrations/claude/hooks/` are available). The installer copies the 8 hook scripts to `~/.claude/hooks/` and merges AIC hook entries into `~/.claude/settings.json`. Every project you open in Claude Code then gets compiled context. Optionally, the installer writes `.claude/CLAUDE.md` in the current working directory for the trigger-rule fallback.” Remove the phrase “for development” and “project-local hook paths” and “No scripts are copied to a global directory; everything stays project-local.”
- **Trigger Rule (Claude Code):** Update so it does not imply that the direct installer is the only one that writes `.claude/CLAUDE.md`; state that `.claude/CLAUDE.md` in the project root is the fallback when hooks are disabled, and that the installer may write it when run from a project directory.

**Verify:** Grep `documentation/installation.md` for `settings.local` and `project.local` and `project-local`; no matches. Read the Claude Code section; it describes only global installation.

### Step 5: documentation/claude-code-integration-layer.md — global only

- **§5 Target file layout:** Keep `~/.claude/hooks/` and `~/.claude/settings.json` as the deployment target. Remove or rewrite the line that lists `.claude/` as a “DEPLOYMENT TARGET (per-project)” for hook registration; keep only `.claude/` for “CLAUDE.md — Fallback trigger rule” in the project if present.
- **§10.2 Local settings:** Remove the subsection “10.2 Local settings (`.claude/settings.json`)” in full, or replace it with one sentence: “Hook registration lives only in `~/.claude/settings.json`; there is no project-local hook registration.”
- **§13 Direct installer path:** Replace the numbered list that describes rewriting to project paths and writing `settings.local.json` with: (1) Resolve `~/.claude` from the user’s home directory. (2) Copy hook scripts from `integrations/claude/hooks/` (relative to the script) to `~/.claude/hooks/`. (3) Read `settings.json.template` (paths are already `$HOME/.claude/hooks/`). (4) Read `~/.claude/settings.json` if present; deep-merge AIC hook entries, preserving non-AIC entries; write `~/.claude/settings.json`. (5) Optionally write `.claude/CLAUDE.md` in the current working directory for the trigger-rule fallback. Remove any sentence that says the installer writes `.claude/settings.local.json` or rewrites paths to the project tree. Remove the sentence about “The committed `.claude/settings.json` (with `$CLAUDE_PROJECT_DIR`-based paths)”.

**Verify:** Grep the file for `settings.local` and `project.local`; no matches.

### Step 6: documentation/mvp-progress.md — align U01 and related text

Find the row or description for U01 (integrations/claude/install.cjs) that mentions writing `.claude/settings.local.json` or “absolute path to `integrations/claude/hooks/` in the detected project root”. Replace with wording that the installer copies scripts to `~/.claude/hooks/` and merges into `~/.claude/settings.json`. In the “Two delivery paths” or similar summary for Claude Code, state that the direct installer installs globally (copy to `~/.claude/`, merge into `~/.claude/settings.json`); do not mention `settings.local.json` or project-local hook paths.

**Verify:** Grep `documentation/mvp-progress.md` for `settings.local` in the context of Claude Code; no matches (or only historical/task-done context if appropriate).

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| fresh_install_creates_global_settings | With HOME=tmpDir, installer creates tmpDir/.claude/hooks/ with 8 scripts and tmpDir/.claude/settings.json with AIC hook commands pointing at global path |
| merge_preserves_non_aic_entries | Pre-create tmpDir/.claude/settings.json with non-AIC hook; after install, non-AIC entry preserved and AIC entries present in same file |
| startup self-check Claude from global | When ~/.claude/settings.json (or test fake home) has aic- hook, installation note is "Claude Code: OK" |

## Acceptance Criteria

- [ ] install.cjs installs only to ~/.claude/hooks/ and ~/.claude/settings.json; does not write .claude/settings.local.json or project .claude/hooks/
- [ ] startup-self-check.ts derives Claude note from ~/.claude/settings.json only (no project settings for hooks)
- [ ] All install tests pass with global install assertions
- [ ] installation.md, claude-code-integration-layer.md, mvp-progress.md describe Claude Code installation as global only; no project-local hook path; authoritative voice
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
