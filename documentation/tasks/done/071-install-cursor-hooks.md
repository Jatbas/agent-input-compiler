# Task 071: Install Cursor hooks (Zero-Install Gaps)

> **Status:** Done
> **Phase:** 0.5 — Quality Release (Zero-Install Gaps)
> **Layer:** mcp
> **Depends on:** Auto-install trigger rule (Done), Startup self-check (Done)

## Goal

On MCP server startup, install `.cursor/hooks.json` and the five AIC hook scripts into the project so that any project using `npx @aic/mcp` gets sessionStart compilation, preToolUse gating, and beforeSubmitPrompt without manual setup.

## Architecture Notes

- Same pattern as `installTriggerRule`: plain idempotent function in `mcp/src/`, no core interface. Uses `node:fs` and `node:path` (allowed in MCP layer). Called from `createMcpServer` immediately after `installTriggerRule`, before `runStartupSelfCheck`.
- Hook script content is shipped in `mcp/hooks/` (packaged copy of repo `.cursor/hooks/AIC-*.cjs`); installer resolves path via `import.meta.url` and writes to `projectRoot/.cursor/hooks/`. Overwrite scripts on every call so package updates propagate.
- hooks.json: if missing, write full default AIC shape; if exists, merge (ensure each AIC command present, append if missing, never remove user entries). Cursor only; Claude Code and `npx @aic/mcp init` are out of scope.

## Files

| Action | Path                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| Create | `mcp/hooks/AIC-session-init.cjs`                                                      |
| Create | `mcp/hooks/AIC-compile-context.cjs`                                                   |
| Create | `mcp/hooks/AIC-require-aic-compile.cjs`                                               |
| Create | `mcp/hooks/AIC-inject-conversation-id.cjs`                                            |
| Create | `mcp/hooks/AIC-before-submit-prewarm.cjs`                                             |
| Create | `mcp/src/install-cursor-hooks.ts`                                                     |
| Create | `mcp/src/__tests__/install-cursor-hooks.test.ts`                                      |
| Modify | `mcp/src/server.ts` (import and call `installCursorHooks` after `installTriggerRule`) |

## Interface / Signature

No core interface. Exported function and default hooks.json shape:

```typescript
// mcp/src/install-cursor-hooks.ts
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { AbsolutePath } from "@aic/shared/core/types/paths.js";

export function installCursorHooks(projectRoot: AbsolutePath): void;
```

Default `.cursor/hooks.json` when file is missing:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      { "command": "node .cursor/hooks/AIC-session-init.cjs" },
      { "command": "node .cursor/hooks/AIC-compile-context.cjs", "timeout": 20 }
    ],
    "beforeSubmitPrompt": [
      { "command": "node .cursor/hooks/AIC-before-submit-prewarm.cjs" }
    ],
    "preToolUse": [
      { "command": "node .cursor/hooks/AIC-require-aic-compile.cjs" },
      { "command": "node .cursor/hooks/AIC-inject-conversation-id.cjs", "matcher": "MCP" }
    ],
    "afterFileEdit": []
  }
}
```

## Dependent Types

### Tier 2 — path-only

| Type           | Path                             | Factory               |
| -------------- | -------------------------------- | --------------------- |
| `AbsolutePath` | `shared/src/core/types/paths.js` | `toAbsolutePath(raw)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change. MCP layer already allows `node:fs` and `node:path`.

## Steps

### Step 1: Create mcp/hooks/ and copy AIC-session-init.cjs

Create directory `mcp/hooks/`. Copy `.cursor/hooks/AIC-session-init.cjs` to `mcp/hooks/AIC-session-init.cjs`.

**Verify:** `mcp/hooks/AIC-session-init.cjs` exists and content matches source. `pnpm typecheck` passes.

### Step 2: Copy AIC-compile-context.cjs to mcp/hooks/

Copy `.cursor/hooks/AIC-compile-context.cjs` to `mcp/hooks/AIC-compile-context.cjs`.

**Verify:** File exists and content matches source.

### Step 3: Copy AIC-require-aic-compile.cjs to mcp/hooks/

Copy `.cursor/hooks/AIC-require-aic-compile.cjs` to `mcp/hooks/AIC-require-aic-compile.cjs`.

**Verify:** File exists and content matches source.

### Step 4: Copy AIC-inject-conversation-id.cjs to mcp/hooks/

Copy `.cursor/hooks/AIC-inject-conversation-id.cjs` to `mcp/hooks/AIC-inject-conversation-id.cjs`.

**Verify:** File exists and content matches source.

### Step 5: Copy AIC-before-submit-prewarm.cjs to mcp/hooks/

Copy `.cursor/hooks/AIC-before-submit-prewarm.cjs` to `mcp/hooks/AIC-before-submit-prewarm.cjs`.

**Verify:** All five files exist under `mcp/hooks/`. `pnpm typecheck` passes.

### Step 6: Implement installCursorHooks

Create `mcp/src/install-cursor-hooks.ts`.

Imports: `path` from `node:path`, `fs` from `node:fs`, `fileURLToPath` from `node:url`, type `AbsolutePath` from `@aic/shared/core/types/paths.js`.

Define the default hooks.json object (version 1, hooks.sessionStart with session-init and compile-context, hooks.beforeSubmitPrompt with prewarm, hooks.preToolUse with require and inject, hooks.afterFileEdit empty array) as a module-level constant matching the Interface section.

Resolve the bundled hooks directory: `const bundledHooksDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks")`. This yields `mcp/hooks/` when the module runs from `mcp/src/`.

Export function `installCursorHooks(projectRoot: AbsolutePath): void`. Implementation (synchronous):

1. `const hooksPath = path.join(projectRoot, ".cursor", "hooks.json")`. If `fs.existsSync(hooksPath)` is false: write default hooks.json with `fs.writeFileSync(hooksPath, JSON.stringify(defaultHooks, null, 2), "utf8")`. Else: read with `fs.readFileSync(hooksPath, "utf8")`, parse with `JSON.parse`, then for each of sessionStart, preToolUse, beforeSubmitPrompt ensure every AIC command (substring match: "AIC-session-init.cjs", "AIC-compile-context.cjs", "AIC-require-aic-compile.cjs", "AIC-inject-conversation-id.cjs", "AIC-before-submit-prewarm.cjs") is present in the corresponding array; append the default entry for that command when no existing entry's command includes that script name; preserve all existing entries and their order. Write merged result with `fs.writeFileSync(hooksPath, JSON.stringify(merged, null, 2), "utf8")`.

2. `const hooksDir = path.join(projectRoot, ".cursor", "hooks")`. `fs.mkdirSync(hooksDir, { recursive: true })`.

3. For each script name in the list `["AIC-session-init.cjs", "AIC-compile-context.cjs", "AIC-require-aic-compile.cjs", "AIC-inject-conversation-id.cjs", "AIC-before-submit-prewarm.cjs"]`: `const srcPath = path.join(bundledHooksDir, name)`, `const destPath = path.join(hooksDir, name)`. Read with `fs.readFileSync(srcPath, "utf8")`. Write with `fs.writeFileSync(destPath, content, "utf8")`. Overwrite every time (no skip-if-exists for scripts).

**Verify:** `pnpm typecheck` passes. `npx eslint mcp/src/install-cursor-hooks.ts` — zero errors.

### Step 7: Wire installCursorHooks in createMcpServer

In `mcp/src/server.ts`, add import: `import { installCursorHooks } from "./install-cursor-hooks.js";`

In `createMcpServer`, immediately after the line `installTriggerRule(projectRoot);`, insert: `installCursorHooks(projectRoot);`

**Verify:** `pnpm typecheck` passes. `pnpm vitest run mcp/src/__tests__/server.test.ts` — all tests pass.

### Step 8: Tests

Create `mcp/src/__tests__/install-cursor-hooks.test.ts`.

Import `describe`, `it`, `expect`, `afterEach` from `vitest`; `fs` from `node:fs`; `path` from `node:path`; `os` from `node:os`; `installCursorHooks` from `../install-cursor-hooks.js`; `toAbsolutePath` from `@aic/shared/core/types/paths.js`; `runStartupSelfCheck` from `../startup-self-check.js`; `installTriggerRule` from `../install-trigger-rule.js`.

Use a `tmpDir` variable and `afterEach` cleanup: if `tmpDir` is defined and `fs.existsSync(tmpDir)`, `fs.rmSync(tmpDir, { recursive: true, force: true })`.

**Test hooks_missing_creates_hooks_json_and_scripts:** Create temp dir with `fs.mkdtempSync(path.join(os.tmpdir(), "aic-hooks-"))`. Call `installCursorHooks(toAbsolutePath(tmpDir))`. Assert `fs.existsSync(path.join(tmpDir, ".cursor", "hooks.json"))` is true. Parse the file with `JSON.parse(fs.readFileSync(..., "utf8"))`. Assert parsed.hooks.sessionStart is an array and at least one entry has command including "AIC-compile-context.cjs". Assert parsed.hooks.preToolUse is an array and at least one entry has command including "AIC-require-aic-compile.cjs". Assert all five script files exist under `path.join(tmpDir, ".cursor", "hooks")`.

**Test hooks_json_exists_merges_without_removing_user_entries:** Create temp dir. Write `path.join(tmpDir, ".cursor", "hooks.json")` with content `JSON.stringify({ version: 1, hooks: { sessionStart: [{ command: "node user-script.cjs" }] } })`. Create `path.join(tmpDir, ".cursor", "hooks")` with `fs.mkdirSync(..., { recursive: true })`. Call `installCursorHooks(toAbsolutePath(tmpDir))`. Parse hooks.json. Assert sessionStart contains an entry with command including "user-script.cjs". Assert sessionStart contains an entry with command including "AIC-compile-context.cjs" (or "AIC-session-init.cjs"). So user entry preserved and AIC entries added.

**Test scripts_overwritten_when_content_differs:** Create temp dir. Create `.cursor/hooks/`. Write `path.join(tmpDir, ".cursor", "hooks", "AIC-compile-context.cjs")` with content `"custom"`. Call `installCursorHooks(toAbsolutePath(tmpDir))`. Read the file content. Assert content is not `"custom"` and (content includes "aic_compile" or content includes "execSync").

**Test idempotent_second_call_no_op:** Create temp dir. Call `installCursorHooks(toAbsolutePath(tmpDir))`. Read hooks.json and one script file content. Call `installCursorHooks(toAbsolutePath(tmpDir))` again. Read hooks.json and the same script again. Assert hooks.json parse result is structurally equivalent (same keys and array lengths). Assert script file content is unchanged.

**Test self_check_passes_after_install:** Create temp dir. Create `.cursor/rules/` and write `.cursor/rules/AIC.mdc` with any content (trigger rule file exists). Call `installTriggerRule(toAbsolutePath(tmpDir))`. Call `installCursorHooks(toAbsolutePath(tmpDir))`. Call `runStartupSelfCheck(toAbsolutePath(tmpDir))`. Assert result.installationOk is true and result.installationNotes is "".

**Verify:** `pnpm vitest run mcp/src/__tests__/install-cursor-hooks.test.ts` — all five tests pass.

### Step 9: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                              | Description                                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| hooks_missing_creates_hooks_json_and_scripts           | Empty project: installCursorHooks creates .cursor/hooks.json with AIC entries and all five .cjs files under .cursor/hooks/ |
| hooks_json_exists_merges_without_removing_user_entries | Existing hooks.json with user sessionStart entry: after install, user entry preserved and AIC entries added                |
| scripts_overwritten_when_content_differs               | .cursor/hooks/AIC-compile-context.cjs with custom content: after install, file content matches packaged script             |
| idempotent_second_call_no_op                           | Two consecutive installCursorHooks calls: hooks.json and script content unchanged after second call                        |
| self_check_passes_after_install                        | After installTriggerRule and installCursorHooks in temp dir, runStartupSelfCheck returns installationOk true               |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] installCursorHooks signature and behavior match specification
- [ ] All five test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in new code
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
