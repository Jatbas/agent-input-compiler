# Task 232: AK01 — Unify 9 matching plugin scripts as re-exports

> **Status:** Pending
> **Phase:** AK — Claude Hooks/Plugin Deduplication
> **Layer:** cli
> **Depends on:** Phases AF through AJ (complete)

## Goal

Remove duplicated implementations under `integrations/claude/plugin/scripts/` by replacing each of nine files with a one-line CommonJS re-export of the matching `integrations/claude/hooks/` module, so the plugin and global hooks share one source of truth and `aic-prompt-compile` gains hooks-side `modelArg` handling.

## Architecture Notes

- Phase AK target state: plugin scripts stay at fixed paths for `hooks.json`; hooks files remain canonical; `require()` resolves relative to the file that contains the call, so `../../shared/` inside `hooks/*.cjs` stays correct when loaded via re-export from `plugin/scripts/`.
- Root cause: nine whole-file copies under `plugin/scripts/` mirror `hooks/` with only `../../../shared/` vs `../../shared/` depth differences; `aic-prompt-compile` plugin copy was behind hooks on model extraction.
- Blast radius: nine plugin script files, one new test, one line added to root `package.json` `test` script.
- `aic-inject-conversation-id.cjs` is out of scope (AK02).

## Files

| Action | Path                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| Modify | `integrations/claude/plugin/scripts/aic-compile-helper.cjs` (replace entire file)          |
| Modify | `integrations/claude/plugin/scripts/aic-after-file-edit-tracker.cjs` (replace entire file) |
| Modify | `integrations/claude/plugin/scripts/aic-block-no-verify.cjs` (replace entire file)       |
| Modify | `integrations/claude/plugin/scripts/aic-pre-compact.cjs` (replace entire file)             |
| Modify | `integrations/claude/plugin/scripts/aic-subagent-inject.cjs` (replace entire file)         |
| Modify | `integrations/claude/plugin/scripts/aic-stop-quality-check.cjs` (replace entire file)      |
| Modify | `integrations/claude/plugin/scripts/aic-session-end.cjs` (replace entire file)             |
| Modify | `integrations/claude/plugin/scripts/aic-session-start.cjs` (replace entire file)           |
| Modify | `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` (replace entire file)          |
| Create | `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs`                         |
| Modify | `package.json` (append one `node` invocation to `scripts.test` — see Config Changes)       |

## Before / After Behavior

**Before:** Each target file under `integrations/claude/plugin/scripts/` contains a full copy of the corresponding `integrations/claude/hooks/*.cjs` logic with `require("../../../shared/...")` paths. The `aic-prompt-compile.cjs` plugin copy does not extract `rawModel` / `modelArg` the way the hooks file does.

**After:** Each target plugin file contains exactly one statement plus a trailing newline: `module.exports = require("../../hooks/<same-basename>.cjs");` where `<same-basename>` matches the plugin filename. Requiring the plugin file returns the same exports object as requiring the hooks file. `aic-prompt-compile` loaded through the plugin re-export executes hooks code, including model argument handling.

## Config Changes

- **shared/package.json:** no change
- **eslint.config.mjs:** no change
- **package.json (repository root):** In `scripts.test`, after the segment `node integrations/claude/__tests__/install-verify.test.cjs`, insert the substring ` && node integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` so the new test runs in the same chain as the other Claude integration tests.

## Steps

### Step 1: Replace `aic-compile-helper.cjs` in plugin scripts

Overwrite `integrations/claude/plugin/scripts/aic-compile-helper.cjs` so its entire content is:

```
module.exports = require("../../hooks/aic-compile-helper.cjs");

```

**Verify:** From repository root, run `node -e "require('./integrations/claude/plugin/scripts/aic-compile-helper.cjs')"` — exits with code 0.

### Step 2: Replace `aic-after-file-edit-tracker.cjs` in plugin scripts

Overwrite `integrations/claude/plugin/scripts/aic-after-file-edit-tracker.cjs` with:

```
module.exports = require("../../hooks/aic-after-file-edit-tracker.cjs");

```

**Verify:** `node -e "require('./integrations/claude/plugin/scripts/aic-after-file-edit-tracker.cjs')"` from repository root exits 0.

### Step 3: Replace `aic-block-no-verify.cjs` in plugin scripts

Overwrite `integrations/claude/plugin/scripts/aic-block-no-verify.cjs` with:

```
module.exports = require("../../hooks/aic-block-no-verify.cjs");

```

**Verify:** `node -e "require('./integrations/claude/plugin/scripts/aic-block-no-verify.cjs')"` from repository root exits 0.

### Step 4: Replace `aic-pre-compact.cjs` in plugin scripts

Overwrite `integrations/claude/plugin/scripts/aic-pre-compact.cjs` with:

```
module.exports = require("../../hooks/aic-pre-compact.cjs");

```

**Verify:** `node -e "require('./integrations/claude/plugin/scripts/aic-pre-compact.cjs')"` from repository root exits 0.

### Step 5: Replace `aic-subagent-inject.cjs` in plugin scripts

Overwrite `integrations/claude/plugin/scripts/aic-subagent-inject.cjs` with:

```
module.exports = require("../../hooks/aic-subagent-inject.cjs");

```

**Verify:** `node -e "require('./integrations/claude/plugin/scripts/aic-subagent-inject.cjs')"` from repository root exits 0.

### Step 6: Replace `aic-stop-quality-check.cjs` in plugin scripts

Overwrite `integrations/claude/plugin/scripts/aic-stop-quality-check.cjs` with:

```
module.exports = require("../../hooks/aic-stop-quality-check.cjs");

```

**Verify:** `node -e "require('./integrations/claude/plugin/scripts/aic-stop-quality-check.cjs')"` from repository root exits 0.

### Step 7: Replace `aic-session-end.cjs` in plugin scripts

Overwrite `integrations/claude/plugin/scripts/aic-session-end.cjs` with:

```
module.exports = require("../../hooks/aic-session-end.cjs");

```

**Verify:** `node -e "require('./integrations/claude/plugin/scripts/aic-session-end.cjs')"` from repository root exits 0.

### Step 8: Replace `aic-session-start.cjs` in plugin scripts

Overwrite `integrations/claude/plugin/scripts/aic-session-start.cjs` with:

```
module.exports = require("../../hooks/aic-session-start.cjs");

```

**Verify:** `node -e "require('./integrations/claude/plugin/scripts/aic-session-start.cjs')"` from repository root exits 0.

### Step 9: Replace `aic-prompt-compile.cjs` in plugin scripts

Overwrite `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` with:

```
module.exports = require("../../hooks/aic-prompt-compile.cjs");

```

**Verify:** `node -e "require('./integrations/claude/plugin/scripts/aic-prompt-compile.cjs')"` from repository root exits 0.

### Step 10: Add fix-verification test

Create `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` as a Node script that:

1. Defines a constant array `PLUGIN_SCRIPT_NAMES` with these nine strings in order: `aic-compile-helper.cjs`, `aic-after-file-edit-tracker.cjs`, `aic-block-no-verify.cjs`, `aic-pre-compact.cjs`, `aic-subagent-inject.cjs`, `aic-stop-quality-check.cjs`, `aic-session-end.cjs`, `aic-session-start.cjs`, `aic-prompt-compile.cjs`.
2. Sets `claudeRoot` to `path.join(__dirname, "..")` and `scriptsDir` to `path.join(claudeRoot, "plugin", "scripts")`.
3. For each name in `PLUGIN_SCRIPT_NAMES`, reads the file at `path.join(scriptsDir, name)` as UTF-8, asserts the string `../../../shared` does not appear in the content, asserts `content.trim()` equals ``module.exports = require("../../hooks/${name}");`` using `assert.strictEqual`.
4. For each name in `PLUGIN_SCRIPT_NAMES`, calls `require(path.join(scriptsDir, name))` and asserts the result is a non-null object.
5. On success, writes a single line to stdout: `ok: plugin_scripts_reexport`.

Use `"use strict"`, `require("node:fs")`, `require("node:path")`, `require("node:assert")`.

This step implements test cases `plugin_reexport_body`, `plugin_reexport_require`, and `plugin_reexport_cli`.

**Verify:** `node integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` prints `ok: plugin_scripts_reexport` and exits 0.

### Step 11: Wire test into root `package.json`

Apply the **package.json (repository root)** change from Config Changes exactly.

**Verify:** `node -p "require('./package.json').scripts.test.includes('plugin-scripts-reexport.test.cjs')"` prints `true`.

### Step 12: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

**Expected:** All complete with zero errors, zero warnings, no new knip findings.

## Tests

| Test case                         | Description                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `plugin_reexport_body`            | Each plugin script is exactly the one-line re-export and contains no `../../../shared` substring     |
| `plugin_reexport_require`       | `require()` of each plugin script path returns a non-null object                                     |
| `plugin_reexport_cli`             | Standalone run prints `ok: plugin_scripts_reexport`                                                  |

## Acceptance Criteria

- [ ] All files created or modified per Files table
- [ ] Before/After Behavior matches observed runtime: re-exports load hooks modules
- [ ] Fix-verification test `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` passes standalone and would fail if any plugin file still contained `../../../shared` or duplicate body
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — clean, including new test in chain
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No edits to `integrations/claude/hooks/*.cjs` or `integrations/claude/plugin/hooks/hooks.json` in this task

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
