# Task 146: Bootstrap artifact lifecycle management

> **Status:** Pending
> **Phase:** Phase AB — File Discovery & Bootstrap Hardening
> **Layer:** mcp
> **Depends on:** —

## Goal

On bootstrap, remove stale AIC hook scripts and hook entries that are no longer in the current manifest, and overwrite the Cursor trigger rule when the AIC package version changes, so version updates via `npx @latest` propagate cleanly.

## Architecture Notes

- MCP bootstrap code in `mcp/src/` may use Node.js `fs` and `path`. No pipeline or core changes.
- Single source of truth: `AIC_SCRIPT_NAMES` and `DEFAULT_HOOKS` in install-cursor-hooks.ts; never delete non-AIC files or remove non-AIC hook entries.
- Trigger rule embeds a version comment; install-trigger-rule reads mcp/package.json (inline, same pattern as server.ts) and overwrites the rule file only when the embedded version differs or is missing.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/install-cursor-hooks.ts` (add stale script deletion and stale hook entry removal) |
| Modify | `mcp/src/install-trigger-rule.ts` (add version read, version comment in template, overwrite when version differs) |
| Modify | `mcp/src/__tests__/install-cursor-hooks.test.ts` (add stale_hook_script_deleted_on_bootstrap, stale_hook_entry_removed_from_hooks_json) |
| Modify | `mcp/src/__tests__/install-trigger-rule.test.ts` (add trigger_rule_updated_when_version_changes) |

## Interface / Signature

Target behavior of the two modified functions (no interface file; signatures unchanged):

```typescript
export function installCursorHooks(projectRoot: AbsolutePath): void;
export function installTriggerRule(projectRoot: AbsolutePath): void;
```

**installCursorHooks:** (1) Ensure `.cursor` and `.cursor/hooks` exist. (2) List `.cursor/hooks` with `fs.readdirSync`; for each entry that matches `AIC-*.cjs` and is not in `AIC_SCRIPT_NAMES`, call `fs.unlinkSync(path.join(hooksDir, name))`. (3) If `hooks.json` missing, create from `DEFAULT_HOOKS`. (4) If `hooks.json` exists, parse; for each hook array in `parsed.hooks`, filter out entries whose `command` contains an AIC script name (regex `AIC-[a-z0-9-]+\.cjs`) that is not in `AIC_SCRIPT_NAMES`; merge in default AIC hooks as today; write merged result. (5) Copy each file in `AIC_SCRIPT_NAMES` from `BUNDLED_HOOKS_DIR` to `.cursor/hooks` (overwrite).

**installTriggerRule:** (1) Read current package version from `mcp/package.json` (path from `path.dirname(fileURLToPath(import.meta.url))`, `..`, `package.json`; try/catch, return `pkg.version` or `"0.0.0"`). (2) Build content from `TRIGGER_RULE_TEMPLATE` with `{{PROJECT_ROOT}}` and `{{VERSION}}` replaced. (3) If `.cursor/rules/AIC.mdc` exists, read it and extract version with regex `/AIC rule version:\s*(\S+)/`. (4) If file missing or regex has no match or captured version !== current version, `fs.mkdirSync(rulesDir, { recursive: true })` and `fs.writeFileSync(triggerPath, content, "utf8")`. (5) If file exists and version matches, do nothing.

## Dependent Types

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts` | `toAbsolutePath(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Stale script deletion and stale hook entry removal in install-cursor-hooks.ts

In `installCursorHooks`, after the existing `fs.mkdirSync(hooksDir, { recursive: true })` (so that `hooksDir` exists) and before the `for (const name of AIC_SCRIPT_NAMES)` loop: call `fs.readdirSync(hooksDir)`; for each `name` in the result, if the name matches `/^AIC-[a-z0-9-]+\.cjs$/` and `AIC_SCRIPT_NAMES` does not include `name`, call `fs.unlinkSync(path.join(hooksDir, name))`.

When building the merged hooks object (the branch where `hooks.json` exists): before calling `mergeHookArray` for each hook key, filter each existing array to remove entries where `(entry.command ?? "").match(/AIC-[a-z0-9-]+\.cjs/)?.[0]` is a script name not in `AIC_SCRIPT_NAMES`. Use a helper that takes `(entry: HookEntry)` and returns true to keep the entry (keep if no AIC script in command, or script name is in `AIC_SCRIPT_NAMES`). Apply this filter to `parsed.hooks?.sessionStart`, `preToolUse`, `postToolUse`, `beforeSubmitPrompt`, `afterFileEdit`, `sessionEnd`, `stop` before passing to `mergeHookArray`.

**Verify:** `pnpm typecheck` passes. Manual read of install-cursor-hooks.ts shows the new readdirSync/unlinkSync block and the filter applied to hook arrays.

### Step 2: Version-aware trigger rule in install-trigger-rule.ts

Add a function `readPackageVersion(): string` that reads `path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json")`, parses JSON, returns `pkg.version` or `"0.0.0"` on error. Add `import { fileURLToPath } from "node:url"` if not present.

In `TRIGGER_RULE_TEMPLATE`, insert immediately after the closing `---` of the frontmatter a new line: `<!-- AIC rule version: {{VERSION}} -->`.

In `installTriggerRule`: call `const currentVersion = readPackageVersion()`. Build `content` with `TRIGGER_RULE_TEMPLATE.replace("{{PROJECT_ROOT}}", projectRoot).replace("{{VERSION}}", currentVersion)`. If `fs.existsSync(triggerPath)` is true, read the file with `fs.readFileSync(triggerPath, "utf8")`, run `content.match(/AIC rule version:\s*(\S+)/)`; if the match is null or `match[1] !== currentVersion`, overwrite: ensure `rulesDir` exists, then `fs.writeFileSync(triggerPath, content, "utf8")`. If the file does not exist, create rules dir and write as today. If the file exists and `match[1] === currentVersion`, return without writing.

**Verify:** `pnpm typecheck` passes. Manual read of install-trigger-rule.ts shows version comment in template, readPackageVersion, and conditional overwrite logic.

### Step 3: Tests for installCursorHooks lifecycle

In `mcp/src/__tests__/install-cursor-hooks.test.ts` add two tests.

**stale_hook_script_deleted_on_bootstrap:** Create `tmpDir`, `.cursor`, `.cursor/hooks`. Write a file `.cursor/hooks/AIC-old-removed.cjs` with any content (this name is not in `AIC_SCRIPT_NAMES`). Call `installCursorHooks(toAbsolutePath(tmpDir))`. Assert `fs.existsSync(path.join(tmpDir, ".cursor", "hooks", "AIC-old-removed.cjs"))` is false. Assert every name in `AIC_SCRIPT_NAMES` has a file at `path.join(tmpDir, ".cursor", "hooks", name)` that exists.

**stale_hook_entry_removed_from_hooks_json:** Create `tmpDir`, `.cursor`, `hooks.json` with `version: 1` and `hooks.sessionStart` containing one entry `{ command: "node .cursor/hooks/AIC-removed-script.cjs" }` (script name not in `AIC_SCRIPT_NAMES`). Call `installCursorHooks(toAbsolutePath(tmpDir))`. Parse `hooks.json`; assert no entry in `parsed.hooks.sessionStart` has `command` including `AIC-removed-script.cjs`. Assert that `parsed.hooks.sessionStart` contains an entry whose `command` includes `AIC-compile-context.cjs`.

**Verify:** `pnpm test mcp/src/__tests__/install-cursor-hooks.test.ts` passes.

### Step 4: Test for installTriggerRule version update

In `mcp/src/__tests__/install-trigger-rule.test.ts` add test **trigger_rule_updated_when_version_changes:** Create `tmpDir`, `.cursor`, `.cursor/rules`, and `.cursor/rules/AIC.mdc` with content that either has no version comment or has `<!-- AIC rule version: 0.0.0 -->`. Call `installTriggerRule(toAbsolutePath(tmpDir))`. Read the file; assert it contains the string `aic_compile` and assert the content matches the regex `/AIC rule version:\s*(\S+)/` with a captured version that equals the current mcp package version (read from `mcp/package.json` in the test or assert the file was overwritten by checking for a version line that is not `0.0.0` if the test wrote `0.0.0`). Use the same pattern as production: read `path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json")` from the test file to get current version and assert the rule file contains that version in the version comment.

**Verify:** `pnpm test mcp/src/__tests__/install-trigger-rule.test.ts` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| stale_hook_script_deleted_on_bootstrap | Extra AIC-*.cjs file not in manifest is deleted by installCursorHooks; all AIC_SCRIPT_NAMES files remain |
| stale_hook_entry_removed_from_hooks_json | hooks.json entry referencing removed AIC script is removed; user and current AIC entries remain |
| trigger_rule_updated_when_version_changes | Existing AIC.mdc with old or missing version comment is overwritten with current package version in version comment |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] installCursorHooks deletes only AIC-*.cjs files not in AIC_SCRIPT_NAMES; removes only hook entries referencing those scripts
- [ ] installTriggerRule overwrites rule when version differs or is missing; does not overwrite when version matches
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
