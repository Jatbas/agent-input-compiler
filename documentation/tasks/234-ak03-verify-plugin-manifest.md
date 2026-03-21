# Task 234: AK03 Verify plugin manifest and require paths

> **Status:** Pending
> **Phase:** 1.5 — Phase AK (Claude hooks/plugin deduplication)
> **Layer:** integrations
> **Depends on:** AK02 (Done)

## Goal

Extend the existing Claude plugin integration test so CI fails when `plugin/hooks/hooks.json` references a missing script or when `.claude-plugin` JSON manifests lose required fields.

## Architecture Notes

- Phase AK: re-exports under `integrations/claude/plugin/scripts/` must stay aligned with `plugin/hooks/hooks.json` commands using `${CLAUDE_PLUGIN_ROOT}/scripts/…`.
- `PLUGIN_SCRIPT_NAMES` has 10 entries; `hooks.json` registers 9 commands. `aic-compile-helper.cjs` is only pulled in by hook scripts under `integrations/claude/hooks/` and is intentionally absent from `hooks.json`.
- `pnpm test` already runs `integrations/claude/__tests__/install-verify.test.cjs`, which exercises `install.cjs` in an isolated temp `HOME`. This task does not duplicate that harness.

## Behavior Change

**Before:** `plugin-scripts-reexport.test.cjs` asserts one-line `../../hooks/` re-exports and a successful `require()` for every file in `PLUGIN_SCRIPT_NAMES`. A stale `hooks.json` path or a broken manifest does not fail this test.

**After:** The same file additionally parses `plugin/hooks/hooks.json`, extracts every referenced `aic-*.cjs` basename under `${CLAUDE_PLUGIN_ROOT}/scripts/`, compares the sorted unique list to the expected 9-entry array in Step 1, asserts each file exists under `plugin/scripts/`, and validates `plugin/.claude-plugin/plugin.json` plus `marketplace.json` required keys.

## Files

| Action | Path                                                                 |
| ------ | -------------------------------------------------------------------- |
| Modify | `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` (add hooks + manifest assertions; keep existing loops and final stdout line) |

## Config Changes

- **shared/package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Extend `plugin-scripts-reexport.test.cjs`

Implement test cases `hooks_json_scripts_resolve`, `plugin_manifest_shape`, and `marketplace_manifest_shape` in this step.

After `const scriptsDir = path.join(claudeRoot, "plugin", "scripts");` add:

- `const hooksJsonPath = path.join(claudeRoot, "plugin", "hooks", "hooks.json");`
- `const pluginManifestPath = path.join(claudeRoot, "plugin", ".claude-plugin", "plugin.json");`
- `const marketplaceManifestPath = path.join(claudeRoot, "plugin", ".claude-plugin", "marketplace.json");`

Insert the following block **after** the two existing `for` loops and **before** `console.log("ok: plugin_scripts_reexport");`:

1. Read `hooksJsonPath` with `fs.readFileSync(..., "utf8")`. Use `const hookPathRe = /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/(aic-[a-z0-9-]+\.cjs)/g;` and a `while` loop with `hookPathRe.exec` to collect capture group 1 into an array. Build `const hookScriptNames = [...new Set(collected)].sort((a, b) => a.localeCompare(b));`. `assert.deepStrictEqual(hookScriptNames, [`aic-after-file-edit-tracker.cjs`, `aic-block-no-verify.cjs`, `aic-inject-conversation-id.cjs`, `aic-pre-compact.cjs`, `aic-prompt-compile.cjs`, `aic-session-end.cjs`, `aic-session-start.cjs`, `aic-stop-quality-check.cjs`, `aic-subagent-inject.cjs`]);` — same order as sorted lexicographically. For each string `n` in `hookScriptNames`, `assert.ok(fs.existsSync(path.join(scriptsDir, n)), \`missing plugin script for hooks.json: ${n}\`);`

2. `const pluginManifest = JSON.parse(fs.readFileSync(pluginManifestPath, "utf8"));`. Assert each is true: `typeof pluginManifest.name === "string" && pluginManifest.name.length > 0`, `typeof pluginManifest.version === "string" && pluginManifest.version.length > 0`, `typeof pluginManifest.description === "string" && pluginManifest.description.length > 0`, `typeof pluginManifest.homepage === "string" && pluginManifest.homepage.length > 0`, `typeof pluginManifest.repository === "string" && pluginManifest.repository.length > 0`, `typeof pluginManifest.license === "string" && pluginManifest.license.length > 0`, `pluginManifest.author != null && typeof pluginManifest.author === "object"`, `typeof pluginManifest.author.name === "string" && pluginManifest.author.name.length > 0`, `Array.isArray(pluginManifest.keywords) && pluginManifest.keywords.length >= 1`.

3. `const marketplaceManifest = JSON.parse(fs.readFileSync(marketplaceManifestPath, "utf8"));`. Assert each is true: `typeof marketplaceManifest.name === "string" && marketplaceManifest.name.length > 0`, `typeof marketplaceManifest.description === "string" && marketplaceManifest.description.length > 0`, `marketplaceManifest.owner != null && typeof marketplaceManifest.owner === "object"`, `typeof marketplaceManifest.owner.name === "string" && marketplaceManifest.owner.name.length > 0`, `Array.isArray(marketplaceManifest.plugins) && marketplaceManifest.plugins.length >= 1`. `const firstPlugin = marketplaceManifest.plugins[0];` then `firstPlugin != null && typeof firstPlugin === "object"`, `typeof firstPlugin.name === "string" && firstPlugin.name.length > 0`, `typeof firstPlugin.source === "string" && firstPlugin.source.length > 0`, `typeof firstPlugin.description === "string" && firstPlugin.description.length > 0`.

**Verify:** From repository root run `node integrations/claude/__tests__/plugin-scripts-reexport.test.cjs`. Expect exit code 0 and a line `ok: plugin_scripts_reexport`.

### Step 2: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all complete successfully with zero errors and zero warnings; knip reports no new unused files, exports, or dependencies.

## Tests

| Test case | Description |
| --------- | ----------- |
| hooks_json_scripts_resolve | Sorted unique basenames from `hooks.json` match the 9 expected entries; each path exists under `plugin/scripts/` |
| plugin_manifest_shape | `plugin.json` parses; required top-level strings, `author.name`, and non-empty `keywords` |
| marketplace_manifest_shape | `marketplace.json` parses; `owner.name`, non-empty `plugins`, first entry has `name`, `source`, `description` |

## Acceptance Criteria

- [ ] `integrations/claude/__tests__/plugin-scripts-reexport.test.cjs` updated per Files table
- [ ] `hooks_json_scripts_resolve`, `plugin_manifest_shape`, and `marketplace_manifest_shape` assertions are present in Step 1 code
- [ ] Fix-verification: the `deepStrictEqual` expected array for hook script basenames is the regression lock — a future edit to `hooks.json` that adds or removes a registered `aic-*.cjs` without updating that array fails `node integrations/claude/__tests__/plugin-scripts-reexport.test.cjs`
- [ ] `pnpm test` passes (includes `install-verify.test.cjs` and this file)
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating TypeScript layer boundaries in files touched by this task
- [ ] No `new Date()`, `Date.now()`, `Math.random()` added outside allowed files
- [ ] No `let` added in production code (`const` only; test file may follow existing style)
- [ ] Single-line comments only where comments are added; explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
