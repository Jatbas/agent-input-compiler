# Task 233: AK02 — Add missing aic-inject-conversation-id to plugin

> **Status:** Pending
> **Phase:** AK — Claude Hooks/Plugin Deduplication
> **Layer:** cli
> **Depends on:** AK01 (unify 9 matching plugin scripts as re-exports)

## Goal

Ship the Claude Code plugin with `aic-inject-conversation-id` at the path declared in `plugin/hooks/hooks.json`, using a one-line re-export of the hooks implementation, and register a `PreToolUse` hook so `conversationId`, `editorId`, and `modelId` reach `aic_compile` the same way global hooks do.

## Architecture Notes

- Phase AK constraint: canonical logic stays in `integrations/claude/hooks/`; plugin scripts stay at fixed paths under `integrations/claude/plugin/scripts/` for the manifest.
- `require()` resolves from the file that contains the call — hooks modules keep `../../shared/` paths; the re-export needs no path edits.
- Global `settings.json.template` registers inject under PreToolUse with `matcher: "mcp__.*__aic_compile"`. Phase AK row for AK02 requires the plugin manifest entry **without** a `matcher` so the script runs on every PreToolUse; the hooks `run` function returns `allow` immediately when the invocation is not `aic_compile`.
- Blast radius: one new plugin script file, one `hooks.json` edit, one integration test array update.

## Files

| Action | Path                                                                                         |
| ------ | -------------------------------------------------------------------------------------------- |
| Create | `integrations/claude/plugin/scripts/aic-inject-conversation-id.cjs`                          |
| Modify | `integrations/claude/plugin/hooks/hooks.json` (append second `PreToolUse` wrapper — see Steps) |
| Modify | `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` (add basename to name list) |

## Before / After Behavior

**Before:** `integrations/claude/plugin/scripts/` has no `aic-inject-conversation-id.cjs`. `plugin/hooks/hooks.json` registers only `aic-block-no-verify.cjs` under `PreToolUse` (with `matcher: "Bash"`). Plugin sessions never run the inject hook, so `aic_compile` calls from the plugin omit injected `conversationId` / `editorId` / `modelId` enrichment.

**After:** `integrations/claude/plugin/scripts/aic-inject-conversation-id.cjs` exists and re-exports `integrations/claude/hooks/aic-inject-conversation-id.cjs`. `hooks.json` lists a second `PreToolUse` wrapper with no `matcher`, command `node "${CLAUDE_PLUGIN_ROOT}/scripts/aic-inject-conversation-id.cjs"`. Requiring the plugin path loads the same exports as requiring the hooks path.

## Config Changes

- **shared/package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Add plugin re-export script

Create `integrations/claude/plugin/scripts/aic-inject-conversation-id.cjs` whose entire content is a single line plus trailing newline:

```
module.exports = require("../../hooks/aic-inject-conversation-id.cjs");

```

**Verify:** From repository root, run `node -e "require('./integrations/claude/plugin/scripts/aic-inject-conversation-id.cjs')"` — process exits with code 0.

### Step 2: Register PreToolUse hook in plugin manifest

Edit `integrations/claude/plugin/hooks/hooks.json`. Locate the `"PreToolUse"` array (currently one object with `"matcher": "Bash"`). Append a second array element **after** that object. The new element must be a JSON object with **no** `matcher` key, with this shape:

```json
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/scripts/aic-inject-conversation-id.cjs\""
          }
        ]
      }
```

Preserve two-space indentation and trailing style consistent with the rest of the file. Valid JSON is required: no comments, no trailing commas.

**Verify:** Run `node -e "JSON.parse(require('fs').readFileSync('integrations/claude/plugin/hooks/hooks.json','utf8'))"` from repository root — exits 0.

### Step 3: Extend plugin re-export test list

Edit `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs`. Append the string `aic-inject-conversation-id.cjs` to the `PLUGIN_SCRIPT_NAMES` array as the **last** element (after `aic-prompt-compile.cjs`). Do not reorder existing entries.

**Verify:** Run `node integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` — stdout contains exactly `ok: plugin_scripts_reexport` and exit code is 0.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

**Expected:** All complete with zero errors, zero warnings, no new knip findings.

## Tests

| Test case              | Description                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `plugin_reexport_body` | New plugin script is exactly the one-line re-export and contains no `../../../shared` substring   |
| `plugin_reexport_require` | `require()` of the new plugin script path returns a non-null object                            |
| `plugin_reexport_cli`  | Standalone run prints `ok: plugin_scripts_reexport`                                               |

## Acceptance Criteria

- [ ] All files created or modified per Files table
- [ ] Before / After Behavior matches runtime: re-export loads hooks module
- [ ] `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` passes standalone
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No edits to `integrations/claude/hooks/aic-inject-conversation-id.cjs` in this task

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
