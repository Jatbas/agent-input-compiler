# Task 151: Create integrations/cursor/install.cjs

> **Status:** Pending
> **Phase:** CL — Cursor Clean-Layer Separation
> **Layer:** integrations/cursor
> **Depends on:** CL01 (Move hook sources to integrations/cursor/hooks/)

## Goal

Create a standalone CommonJS installer script that deploys Cursor hooks and the trigger rule from `integrations/cursor/` to a project's `.cursor/` directory, with no dependency on `mcp/src/`, so that CL03 can remove `install-cursor-hooks.ts` and wire bootstrap to this script.

## Architecture Notes

- Clean-layer principle: All Cursor-specific code lives in `integrations/cursor/`; the installer must not import from `mcp/src/` or any TypeScript module. Node.js built-ins only (`fs`, `path`).
- Port logic from `mcp/src/install-cursor-hooks.ts` (script copy, hooks.json merge, stale cleanup) and from `mcp/src/install-trigger-rule.ts` (AIC.mdc template with version and projectRoot).
- Script is invokable as `node integrations/cursor/install.cjs` with process cwd set to the project root.
- Idempotent: write hooks and hooks.json only when content differs; write AIC.mdc when missing or version differs (same as install-trigger-rule).

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/cursor/hooks.json.template` |
| Create | `integrations/cursor/install.cjs` |
| Create | `integrations/cursor/__tests__/install.test.js` |

## Interface / Signature

This task does not implement a core interface. The deliverable is a standalone script and a JSON template.

**Script entry:** The file `integrations/cursor/install.cjs` is executed directly. It uses no exported function; all logic runs at top level or in local helper functions.

**Resolution rules:**
- Project root: `process.cwd()`.
- Source hooks directory: `path.join(__dirname, 'hooks')`.
- Template path: `path.join(__dirname, 'hooks.json.template')`.
- Root package.json (for version): `path.join(__dirname, '../../package.json')`.

**Trigger rule template (embedded in install.cjs):** Same content as `mcp/src/install-trigger-rule.ts` `TRIGGER_RULE_TEMPLATE`, with placeholders `{{PROJECT_ROOT}}` and `{{VERSION}}`. Version is read from root `package.json` at the path above; project root is `process.cwd()`.

## Dependent Types

Not applicable — CommonJS script with no TypeScript types. Paths and JSON are plain strings and objects.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create hooks.json.template

Create `integrations/cursor/hooks.json.template` containing the exact JSON from `documentation/cursor-integration-layer.md` §10 (lines 580–611). The file must be valid JSON and use the same structure as the DEFAULT_HOOKS object in `mcp/src/install-cursor-hooks.ts`: `version: 1` and `hooks` with keys `sessionStart`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`, `beforeShellExecution`, `afterFileEdit`, `sessionEnd`, `stop`, each with an array of entries with `command` and optional `timeout`, `matcher`, `failClosed`, `loop_limit`.

**Verify:** Run `node -e "JSON.parse(require('fs').readFileSync('integrations/cursor/hooks.json.template','utf8'))"` from repo root; no throw.

### Step 2: Create install.cjs — manifest and directory setup

In `integrations/cursor/install.cjs`, add the SPDX license and copyright header. Define `AIC_SCRIPT_NAMES` as an array of the 10 hook filenames in this order: `AIC-session-init.cjs`, `AIC-compile-context.cjs`, `AIC-require-aic-compile.cjs`, `AIC-inject-conversation-id.cjs`, `AIC-post-compile-context.cjs`, `AIC-before-submit-prewarm.cjs`, `AIC-block-no-verify.cjs`, `AIC-after-file-edit-tracker.cjs`, `AIC-session-end.cjs`, `AIC-stop-quality-check.cjs`. Resolve `projectRoot = process.cwd()`, `sourceHooksDir = path.join(__dirname, 'hooks')`, `templatePath = path.join(__dirname, 'hooks.json.template')`. Create `.cursor` and `.cursor/hooks` in project root using `fs.mkdirSync(..., { recursive: true })`.

**Verify:** No syntax error; `node -c integrations/cursor/install.cjs` passes.

### Step 3: Copy hook scripts (write only if content differs)

For each name in `AIC_SCRIPT_NAMES`, read the source file from `sourceHooksDir` and the destination file in `path.join(projectRoot, '.cursor', 'hooks', name)`. If the destination exists and its content (utf8) equals the source content, skip the write. Otherwise write the source content to the destination. Use `fs.readFileSync(..., 'utf8')` and `fs.writeFileSync(..., 'utf8')`.

**Verify:** After a first run in a temp dir, all 10 files exist in `.cursor/hooks/`; after a second run with no source change, file contents unchanged (idempotent).

### Step 4: Stale AIC script cleanup

List files in `path.join(projectRoot, '.cursor', 'hooks')` with `fs.readdirSync`. For each file name matching `/^AIC-[a-z0-9-]+\.cjs$/`, if the name is not in `AIC_SCRIPT_NAMES`, delete it with `fs.unlinkSync(path.join(hooksDir, name))`.

**Verify:** If a stale `AIC-old-removed.cjs` is present before run, it is removed after run.

### Step 5: Merge hooks.json

Read the default payload from `templatePath` (JSON.parse of file content). Read `path.join(projectRoot, '.cursor', 'hooks.json')`. If the file does not exist, ensure `.cursor` exists with `fs.mkdirSync(path.join(projectRoot, '.cursor'), { recursive: true })`, then write the template JSON (stringified with 2-space indent and trailing newline) to `hooks.json` and skip the merge step. If the file exists, parse it. For each hook key in the template (`sessionStart`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`, `beforeShellExecution`, `afterFileEdit`, `sessionEnd`, `stop`): filter existing entries to remove any whose `command` contains an AIC script name that is not in `AIC_SCRIPT_NAMES` (stale); then merge: if the existing array does not already include an entry for each template entry (match by script name in command), append the missing template entries. Build a merged object with `version` from existing or 1, and `hooks` with the merged arrays. Serialize with `JSON.stringify(obj, null, 2) + '\n'`. If the result is not equal to the current file content, write the result to `hooks.json`.

**Verify:** Existing `.cursor/hooks.json` with non-AIC entries keeps those entries; AIC entries match template; no duplicate AIC entries.

### Step 6: Install .cursor/rules/AIC.mdc

Embed the trigger rule template string (same text as in `mcp/src/install-trigger-rule.ts` TRIGGER_RULE_TEMPLATE) with placeholders `{{PROJECT_ROOT}}` and `{{VERSION}}`. Read version from `path.join(__dirname, '../../package.json')` (parse JSON, use `version` field or `'0.0.0'` on error). Replace `{{PROJECT_ROOT}}` with `projectRoot` and `{{VERSION}}` with that version. Let `rulesDir = path.join(projectRoot, '.cursor', 'rules')` and `triggerPath = path.join(rulesDir, 'AIC.mdc')`. If `triggerPath` exists, read its content and check for a line matching `AIC rule version:\s*(\S+)`; if the captured version equals the current version, skip the write. Create `rulesDir` with `fs.mkdirSync(rulesDir, { recursive: true })` and write the resolved content to `triggerPath` with `fs.writeFileSync(triggerPath, content, 'utf8')`.

**Verify:** After run, `.cursor/rules/AIC.mdc` exists; content contains `projectRoot` value and version from root package.json; second run with same version does not overwrite.

### Step 7: Tests

Create `integrations/cursor/__tests__/install.test.js` (CommonJS). Use a temporary directory: `fs.mkdtempSync(path.join(require('os').tmpdir(), 'aic-install-'))`. Resolve repo root as `path.resolve(__dirname, '../../..')` (from `integrations/cursor/__tests__/`). Run the installer via `require('child_process').execFileSync('node', [path.join(repoRoot, 'integrations/cursor/install.cjs')], { cwd: tmpDir, encoding: 'utf8' })`. Test cases: (1) first run creates `.cursor/hooks/` with all 10 scripts, `.cursor/hooks.json`, and `.cursor/rules/AIC.mdc`; (2) second run is idempotent (same file contents); (3) merge preserves non-AIC entries in hooks.json when the file exists before run; (4) a file in `.cursor/hooks/` matching `AIC-*.cjs` but not in AIC_SCRIPT_NAMES is removed after run. Use `fs.readFileSync` and `fs.existsSync` with assertions. Do not change process.cwd(); use execFileSync with `cwd: tmpDir` so the script sees tmpDir as project root.

**Verify:** Run `node integrations/cursor/__tests__/install.test.js` from repo root; all assertions pass.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings. Manually run `node integrations/cursor/install.cjs` from a project root and confirm `.cursor/hooks/`, `.cursor/hooks.json`, and `.cursor/rules/AIC.mdc` are correct.

## Tests

| Test case | Description |
| --------- | ----------- |
| install_creates_all_artifacts | First run in temp dir creates .cursor/hooks/ with 10 scripts, .cursor/hooks.json from template, .cursor/rules/AIC.mdc with projectRoot and version |
| install_idempotent | Second run without source change does not modify file contents |
| install_merges_hooks_json | Pre-existing .cursor/hooks.json with non-AIC entries retains them; AIC entries merged from template |
| install_removes_stale_scripts | AIC-*.cjs in .cursor/hooks/ not in AIC_SCRIPT_NAMES is deleted |

## Acceptance Criteria

- [ ] integrations/cursor/hooks.json.template exists and is valid JSON matching cursor-integration-layer.md §10
- [ ] integrations/cursor/install.cjs runs without error when invoked with cwd set to a project root; creates .cursor/hooks/, copies 10 scripts (write only if content differs), merges hooks.json, installs AIC.mdc
- [ ] No imports from mcp/src/ or any TypeScript module; Node built-ins only
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] CLI-invokable: `node integrations/cursor/install.cjs` (with cwd = project root)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
