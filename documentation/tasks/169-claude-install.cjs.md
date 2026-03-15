# Task 169: integrations/claude/install.cjs

> **Status:** Pending
> **Phase:** U (Claude Code Zero-Install)
> **Layer:** integrations
> **Depends on:** Phase T (hooks and settings.json.template)

## Goal

Create a standalone CommonJS installer script that writes `.claude/settings.local.json` (with absolute paths to `integrations/claude/hooks/`) and `.claude/CLAUDE.md`, so Claude Code users can run `node integrations/claude/install.cjs` or use `npx @aic/mcp init` with zero dependency on `mcp/src/`.

## Architecture Notes

- Clean-layer principle (documentation/claude-code-integration-layer.md §2): all Claude Code-specific logic lives in `integrations/claude/`; no imports from `mcp/src/`.
- Follow the structural pattern of `integrations/cursor/install.cjs`: manifest, mkdir, path-rewrite from template, merge into existing or create, trigger rule write. Claude differs in paths (`.claude/`), file names (`settings.local.json`), and trigger content (plain markdown `CLAUDE.md`).
- Error handling: on any write/read failure, print warning to stderr and exit 0 so the caller (such as the bootstrap) never crashes.
- Single file plus test file; .gitignore addition for `.claude/settings.local.json`.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/claude/install.cjs` |
| Create | `integrations/claude/__tests__/install.test.cjs` |
| Modify | `.gitignore` (add `.claude/settings.local.json`) |

## Interface / Signature

Standalone script: no exports. When run as `node integrations/claude/install.cjs`, the script:

1. Resolves project root from `process.env.CLAUDE_PROJECT_DIR` or `process.cwd()`
2. Ensures `.claude/` exists via `fs.mkdirSync(..., { recursive: true })`
3. Reads `integrations/claude/settings.json.template`, rewrites every hook `command` so `$HOME/.claude/hooks/` is replaced by the absolute path to `path.join(projectRoot, "integrations", "claude", "hooks")`
4. Writes or deep-merges into `.claude/settings.local.json` (preserve non-AIC entries; remove AIC entries whose script is not in the manifest)
5. Writes `.claude/CLAUDE.md` with the same static content as `CLAUDE_MD_TEMPLATE` in `mcp/src/install-trigger-rule.ts` (lines 52–151), embedded in install.cjs so there is no import from `mcp/src/`

Constants and APIs used:

```javascript
const path = require("node:path");
const fs = require("node:fs");

const AIC_SCRIPT_NAMES = [
  "aic-session-start.cjs",
  "aic-prompt-compile.cjs",
  "aic-subagent-inject.cjs",
  "aic-pre-compact.cjs",
  "aic-after-file-edit-tracker.cjs",
  "aic-stop-quality-check.cjs",
  "aic-block-no-verify.cjs",
  "aic-session-end.cjs",
];

const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const hooksDirAbs = path.join(projectRoot, "integrations", "claude", "hooks");
const templatePath = path.join(__dirname, "settings.json.template");
const claudeDir = path.join(projectRoot, ".claude");
const settingsLocalPath = path.join(claudeDir, "settings.local.json");
const claudeMdPath = path.join(claudeDir, "CLAUDE.md");

// fs.mkdirSync(claudeDir, { recursive: true });
// fs.readFileSync(templatePath, "utf8");
// JSON.parse(...); replace $HOME/.claude/hooks with hooksDirAbs in each command
// fs.readFileSync(settingsLocalPath, "utf8") or create fresh; merge; filter stale
// fs.writeFileSync(settingsLocalPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
// fs.writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE, "utf8");
```

## Dependent Types

None. The script uses only JSON (parsed settings), strings, and Node.js `fs`/`path` APIs.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Project root, .claude directory, and paths

In `integrations/claude/install.cjs`: require `node:path` and `node:fs`. Set `projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd()`. Set `claudeDir = path.join(projectRoot, ".claude")`, `hooksDirAbs = path.join(projectRoot, "integrations", "claude", "hooks")`, `templatePath = path.join(__dirname, "settings.json.template")`, `settingsLocalPath = path.join(claudeDir, "settings.local.json")`, `claudeMdPath = path.join(claudeDir, "CLAUDE.md")`. Call `fs.mkdirSync(claudeDir, { recursive: true })`. Wrap the entire script body (from mkdir through both writes) in a try block; in the catch block write the error message to `process.stderr` and call `process.exit(0)`.

**Verify:** Script runs without throwing when executed from repo root; `.claude/` exists after run.

### Step 2: Template read and path rewrite

Read `templatePath` with `fs.readFileSync(templatePath, "utf8")` and `JSON.parse` the result. Define `AIC_SCRIPT_NAMES` as the list of eight script basenames: aic-session-start.cjs, aic-prompt-compile.cjs, aic-subagent-inject.cjs, aic-pre-compact.cjs, aic-after-file-edit-tracker.cjs, aic-stop-quality-check.cjs, aic-block-no-verify.cjs, aic-session-end.cjs. Walk the parsed template's `hooks` object (keys: SessionStart, UserPromptSubmit, SubagentStart, PreCompact, PostToolUse, Stop, PreToolUse, SessionEnd). For each event key, iterate the array of wrapper objects; for each object that has a `hooks` array, iterate each hook entry and replace in `command` the substring `$HOME/.claude/hooks` with `hooksDirAbs` (absolute path). Use a helper that replaces all occurrences in the command string. Result is a rewritten payload object with the same structure as the template but with absolute paths in every `command`.

**Verify:** Rewritten payload has `command` values containing the project root path and `integrations/claude/hooks` and no `$HOME`.

### Step 3: Write or merge settings.local.json

If `fs.existsSync(settingsLocalPath)` is true, read with `fs.readFileSync(settingsLocalPath, "utf8")`, parse with `JSON.parse`, and deep-merge: for each key in the rewritten payload's `hooks`, take the existing array for that key (or `[]`), filter out any entry whose `command` matches an AIC script not in `AIC_SCRIPT_NAMES` (stale cleanup), then merge in the rewritten payload's entries for that key (ensure AIC entries from the rewritten payload are present; keep non-AIC entries from existing). If the file does not exist, use the rewritten payload as the merged result. Write with `fs.writeFileSync(settingsLocalPath, JSON.stringify(merged, null, 2) + "\n", "utf8")`. Use optional chaining when reading `existing.hooks?.[eventKey]` and default to `[]` when absent.

**Verify:** Running the script creates or updates `.claude/settings.local.json`; opening it shows valid JSON with `hooks` and absolute paths in commands.

### Step 4: Write CLAUDE.md

Embed in `integrations/claude/install.cjs` the full static content of `CLAUDE_MD_TEMPLATE` from `mcp/src/install-trigger-rule.ts` (lines 52–151) as a string constant. Do not import from `mcp/src/`. Write it to `claudeMdPath` with `fs.writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE, "utf8")`.

**Verify:** After running the script, `.claude/CLAUDE.md` exists and its content matches the template and contains at least "AIC — Claude Code Rules", "aic_compile", "SessionStart", "UserPromptSubmit".

### Step 5: .gitignore

Add a single line to `.gitignore`: `.claude/settings.local.json`. Place it next to the existing `.claude/` entries (after `.claude/hooks/aic-*.cjs` or with the other .claude lines).

**Verify:** `git status` does not show `.claude/settings.local.json` after running the installer from repo root.

### Step 6: Installer tests

Create `integrations/claude/__tests__/install.test.cjs`. Use Node.js `fs`, `path`, and a temporary directory created with `fs.mkdtempSync` or a dedicated fixture directory. Tests: (1) fresh_install_creates_settings: run install.cjs with a project root set to a temp dir that has no `.claude/`, then assert `.claude/settings.local.json` exists and parsed JSON has `hooks` with at least one event key and a `command` containing the path to `integrations/claude/hooks`. (2) merge_preserves_non_aic_entries: create `.claude/settings.local.json` with a non-AIC hook entry (a custom event or a different command), run install.cjs, assert the non-AIC entry is still present. Run tests with `node integrations/claude/__tests__/install.test.cjs` or via a test runner that supports .cjs.

**Verify:** Both tests pass when executed.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings. Manually run `node integrations/claude/install.cjs` from the repository root and confirm `.claude/settings.local.json` and `.claude/CLAUDE.md` are created or updated correctly.

## Tests

| Test case | Description |
| --------- | ----------- |
| fresh_install_creates_settings | No .claude/; run script; settings.local.json exists with hooks and absolute paths to integrations/claude/hooks |
| merge_preserves_non_aic_entries | Existing settings.local.json with non-AIC entry; run script; non-AIC entry preserved |

## Acceptance Criteria

- [ ] `integrations/claude/install.cjs` and `integrations/claude/__tests__/install.test.cjs` created; `.gitignore` updated
- [ ] Script uses only `node:path` and `node:fs`; zero imports from `mcp/src/`
- [ ] Project root from `CLAUDE_PROJECT_DIR` or `process.cwd()`; `.claude/` created; template path rewrite and merge logic match exploration report
- [ ] CLAUDE.md content matches `CLAUDE_MD_TEMPLATE` from `mcp/src/install-trigger-rule.ts` (embedded, not imported)
- [ ] On write/read failure, script writes to stderr and exits 0
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] `node integrations/claude/install.cjs` from repo root creates/updates `.claude/settings.local.json` and `.claude/CLAUDE.md`

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
