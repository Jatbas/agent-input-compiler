# Task 172: Claude Code Plugin Package

> **Status:** Pending
> **Phase:** U (Claude Code Zero-Install)
> **Layer:** integrations
> **Depends on:** Phase T (all Claude Code hooks T01–T10)

## Goal

Package AIC as a native Claude Code Plugin in `integrations/claude/plugin/` with the standard plugin directory structure so users can install via `claude plugin install aic@aic-tools` after adding the marketplace.

## Architecture Notes

- No production TypeScript; plugin is static JSON manifests and copies of existing hook scripts. Follow [Claude Code Plugin docs](https://code.claude.com/docs/en/plugins) and [Plugins reference](https://code.claude.com/docs/en/plugins-reference).
- Version in `plugin.json` must stay in sync with root `package.json` at release time; document or script the sync.
- `.mcp.json` uses the published MCP npm package name; mvp-progress specifies `@jatbas/aic-mcp@latest`; when the published package name differs, use that in `args`.
- Do not use the reserved marketplace name `claude-plugins-official`; use `aic-tools`.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/claude/plugin/.claude-plugin/plugin.json` |
| Create | `integrations/claude/plugin/.claude-plugin/marketplace.json` |
| Create | `integrations/claude/plugin/hooks/hooks.json` |
| Create | `integrations/claude/plugin/.mcp.json` |
| Create | `integrations/claude/plugin/scripts/aic-after-file-edit-tracker.cjs` (copy from integrations/claude/hooks/) |
| Create | `integrations/claude/plugin/scripts/aic-block-no-verify.cjs` (copy) |
| Create | `integrations/claude/plugin/scripts/aic-compile-helper.cjs` (copy) |
| Create | `integrations/claude/plugin/scripts/aic-pre-compact.cjs` (copy) |
| Create | `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` (copy) |
| Create | `integrations/claude/plugin/scripts/aic-session-end.cjs` (copy) |
| Create | `integrations/claude/plugin/scripts/aic-session-start.cjs` (copy) |
| Create | `integrations/claude/plugin/scripts/aic-stop-quality-check.cjs` (copy) |
| Create | `integrations/claude/plugin/scripts/aic-subagent-inject.cjs` (copy) |

## Interface / Signature

Not applicable — no production code; plugin is directory structure and JSON manifests only.

## Dependent Types

Not applicable — no TypeScript types consumed.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create plugin manifest

Create `integrations/claude/plugin/.claude-plugin/plugin.json` with the plugin manifest. Required field: `name` (string, value `"aic"`). Include: `version` (set to the exact version string from root `package.json`; add a one-line README or comment in the plugin dir that version must be synced from root at release), `description` (brief explanation of AIC for context compilation), `author` (object with `name`; use root package.json author when present, otherwise `"AIC Contributors"`), `homepage`, `repository` (URLs; use the project repository URL), `license` (string `"Apache-2.0"`), `keywords` (array `["context", "compilation", "mcp"]`). All paths in the manifest schema are relative to plugin root and start with `./`. Do not put `commands`, `agents`, `skills`, `hooks`, or `mcpServers` as custom paths in plugin.json — use the default locations (hooks in `hooks/hooks.json`, MCP in `.mcp.json` at plugin root).

**Verify:** File exists and is valid JSON; `name` is `"aic"`; `license` is `"Apache-2.0"`.

### Step 2: Create hooks configuration

Create `integrations/claude/plugin/hooks/hooks.json`. Use the same structure as `integrations/claude/settings.json.template`: top-level object with a `hooks` key whose value is an object mapping hook event names to arrays of hook configs. For every `command` value in the template, replace the path: change `node \"$HOME/.claude/hooks/<script>.cjs\"` to `node \"${CLAUDE_PLUGIN_ROOT}/scripts/<script>.cjs\"`. The template has eight command entries (one per hook script): aic-session-start.cjs, aic-prompt-compile.cjs, aic-subagent-inject.cjs, aic-pre-compact.cjs, aic-after-file-edit-tracker.cjs, aic-stop-quality-check.cjs, aic-block-no-verify.cjs, aic-session-end.cjs. The ninth script (aic-compile-helper.cjs) is copied to scripts/ in a later step but has no hook entry in hooks.json (it is used by other scripts). Preserve `timeout` and `statusMessage` and `matcher` where present. Do not add or remove hook events.

**Verify:** File exists and is valid JSON; every `command` contains `${CLAUDE_PLUGIN_ROOT}/scripts/` and one of the eight hook script filenames listed above; structure matches settings.json.template.

### Step 3: Create scripts directory

Create directory `integrations/claude/plugin/scripts/`.

**Verify:** Directory exists.

### Step 4: Copy aic-after-file-edit-tracker.cjs

Copy `integrations/claude/hooks/aic-after-file-edit-tracker.cjs` to `integrations/claude/plugin/scripts/aic-after-file-edit-tracker.cjs` byte-for-byte.

**Verify:** File exists and content matches source.

### Step 5: Copy aic-block-no-verify.cjs

Copy `integrations/claude/hooks/aic-block-no-verify.cjs` to `integrations/claude/plugin/scripts/aic-block-no-verify.cjs` byte-for-byte.

**Verify:** File exists and content matches source.

### Step 6: Copy aic-compile-helper.cjs

Copy `integrations/claude/hooks/aic-compile-helper.cjs` to `integrations/claude/plugin/scripts/aic-compile-helper.cjs` byte-for-byte.

**Verify:** File exists and content matches source.

### Step 7: Copy aic-pre-compact.cjs

Copy `integrations/claude/hooks/aic-pre-compact.cjs` to `integrations/claude/plugin/scripts/aic-pre-compact.cjs` byte-for-byte.

**Verify:** File exists and content matches source.

### Step 8: Copy aic-prompt-compile.cjs

Copy `integrations/claude/hooks/aic-prompt-compile.cjs` to `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` byte-for-byte.

**Verify:** File exists and content matches source.

### Step 9: Copy aic-session-end.cjs

Copy `integrations/claude/hooks/aic-session-end.cjs` to `integrations/claude/plugin/scripts/aic-session-end.cjs` byte-for-byte.

**Verify:** File exists and content matches source.

### Step 10: Copy aic-session-start.cjs

Copy `integrations/claude/hooks/aic-session-start.cjs` to `integrations/claude/plugin/scripts/aic-session-start.cjs` byte-for-byte.

**Verify:** File exists and content matches source.

### Step 11: Copy aic-stop-quality-check.cjs

Copy `integrations/claude/hooks/aic-stop-quality-check.cjs` to `integrations/claude/plugin/scripts/aic-stop-quality-check.cjs` byte-for-byte.

**Verify:** File exists and content matches source.

### Step 12: Copy aic-subagent-inject.cjs

Copy `integrations/claude/hooks/aic-subagent-inject.cjs` to `integrations/claude/plugin/scripts/aic-subagent-inject.cjs` byte-for-byte.

**Verify:** File exists and content matches source.

### Step 13: Create MCP server registration

Create `integrations/claude/plugin/.mcp.json` at the plugin root with content: `{ "mcpServers": { "aic": { "command": "npx", "args": ["@jatbas/aic-mcp@latest"] } } }`. This registers the AIC MCP server so it auto-starts when the plugin is enabled. Use the published npm package name for the MCP server: mvp-progress specifies `@jatbas/aic-mcp@latest`; when the published package name differs, set `args` to that package name with `@latest` instead.

**Verify:** File exists and is valid JSON; `mcpServers.aic.command` is `"npx"` and `args` is an array with one element (the package name and tag).

### Step 14: Create marketplace catalog

Create `integrations/claude/plugin/.claude-plugin/marketplace.json`. Required fields: `name` (string `"aic-tools"` — do not use the reserved name `claude-plugins-official`), `owner` (object with required `name` string; set to project maintainer or team name), `plugins` (array of one entry: `{ "name": "aic", "source": "./" }`). The `source` value `"./"` means the plugin root is the directory containing this marketplace file (the plugin directory). Add a `description` (string) to the plugin entry with a brief catalog description.

**Verify:** File exists and is valid JSON; `name` is `"aic-tools"`; `owner.name` is set; `plugins` has exactly one entry with `name` `"aic"` and `source` `"./"`.

### Step 15: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

Run: `claude --plugin-dir ./integrations/claude/plugin/` and confirm the plugin loads. When the Claude Code CLI is not installed on the machine, document in the task completion that the user must run this command manually to verify the plugin.

## Tests

| Test case | Description |
| --------- | ------------ |
| plugin_manifest_valid | plugin.json exists, is valid JSON, has name "aic" and license "Apache-2.0" |
| hooks_json_structure | hooks/hooks.json exists, valid JSON, all commands use ${CLAUDE_PLUGIN_ROOT}/scripts/ |
| scripts_copied | All nine aic-*.cjs files present in plugin/scripts/ and match source |
| mcp_json_valid | .mcp.json exists, valid JSON, mcpServers.aic has command and args |
| marketplace_json_valid | .claude-plugin/marketplace.json exists, valid JSON, name "aic-tools", one plugin entry source "./" |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] plugin.json manifest has required fields and license Apache-2.0
- [ ] hooks.json uses ${CLAUDE_PLUGIN_ROOT}/scripts/ for every command
- [ ] Nine hook scripts copied to plugin/scripts/ unchanged
- [ ] .mcp.json and marketplace.json valid and complete
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] Local test with `claude --plugin-dir ./integrations/claude/plugin/` confirms plugin loads (or documented as manual step)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
