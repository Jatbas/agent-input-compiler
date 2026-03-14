# Task 157: Install Trigger Rule Editor-Aware

> **Status:** Pending
> **Phase:** 1.0 (OSS Release)
> **Layer:** mcp
> **Depends on:** detectEditorId, getEditorId in server, EDITOR_ID in core types

## Goal

Make `installTriggerRule` editor-aware so it only installs the Cursor trigger rule when the detected editor is CURSOR, installs `.claude/CLAUDE.md` for CLAUDE_CODE, and skips trigger installation for GENERIC (no `.cursor/` or trigger file for non-Cursor editors).

## Architecture Notes

- Approach B: `ensureProjectInit` stops calling `installTriggerRule`; only callers with `editorId` (compile-handler, server listRoots) call `installTriggerRule(projectRoot, editorId)`.
- Dispatch: single function with three branches (CURSOR / CLAUDE_CODE / GENERIC); use explicit branches or `Record<EditorId, () => void>` — no new modules.
- runInit / `aic init` unchanged — no trigger install from CLI.
- ADR-010: use `EditorId` from `shared/src/core/types/enums.js`, not raw string.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/install-trigger-rule.ts` (add editorId param, dispatch, CLAUDE_MD_TEMPLATE) |
| Modify | `mcp/src/init-project.ts` (remove installTriggerRule call) |
| Modify | `mcp/src/handlers/compile-handler.ts` (resolvedEditorId before init block; installTriggerRule(projectRoot, resolvedEditorId)) |
| Modify | `mcp/src/server.ts` (installTriggerRule(absRoot, getEditorId()) in listRoots callback) |
| Modify | `mcp/src/__tests__/install-trigger-rule.test.ts` (pass EDITOR_ID.CURSOR; add CLAUDE_CODE and GENERIC tests) |
| Modify | `mcp/src/__tests__/init-project.test.ts` (remove .cursor/rules/AIC.mdc assertion) |

## Interface / Signature

No new interface. Function signature change:

```typescript
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { EditorId } from "@jatbas/aic-core/core/types/enums.js";

export function installTriggerRule(projectRoot: AbsolutePath, editorId: EditorId): void;
```

- **CURSOR:** write `.cursor/rules/AIC.mdc` (existing template with `{{PROJECT_ROOT}}`, `{{VERSION}}`).
- **CLAUDE_CODE:** write `.claude/CLAUDE.md` from `CLAUDE_MD_TEMPLATE` (no placeholders).
- **GENERIC:** return without writing any file.

## Dependent Types

### Tier 0 — verbatim

`AbsolutePath` and `EditorId` are from `shared/src/core/types/paths.js` and `shared/src/core/types/enums.js`. No inline definition needed — task uses existing branded types.

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.js` | `toAbsolutePath(raw)` |
| `EditorId` | `shared/src/core/types/enums.js` | `EDITOR_ID.CURSOR`, `EDITOR_ID.CLAUDE_CODE`, `EDITOR_ID.GENERIC` |

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: installTriggerRule editor dispatch and CLAUDE template

In `mcp/src/install-trigger-rule.ts`: add `EditorId` import from `@jatbas/aic-core/core/types/enums.js`. Add a string constant `CLAUDE_MD_TEMPLATE` with the content of the project's `.claude/CLAUDE.md` (same structure — AIC rules for Claude Code; no `{{PROJECT_ROOT}}`). Change `installTriggerRule(projectRoot: AbsolutePath)` to `installTriggerRule(projectRoot: AbsolutePath, editorId: EditorId): void`. At the start of the function: if `editorId === EDITOR_ID.GENERIC`, return. If `editorId === EDITOR_ID.CLAUDE_CODE`: set `claudeDir = path.join(projectRoot, ".claude")`, `claudeMdPath = path.join(claudeDir, "CLAUDE.md")`; `fs.mkdirSync(claudeDir, { recursive: true })`; `fs.writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE, "utf8")`; return. Otherwise (`editorId === EDITOR_ID.CURSOR`): keep the existing logic (rulesDir, triggerPath, version check, mkdirSync, writeFileSync with TRIGGER_RULE_TEMPLATE).

**Verify:** `pnpm typecheck` passes; no other file imports `installTriggerRule` with one argument yet (call sites updated in later steps).

### Step 2: ensureProjectInit stop calling installTriggerRule

In `mcp/src/init-project.ts`: remove the `import { installTriggerRule } from "./install-trigger-rule.js"` line. Remove the line `installTriggerRule(projectRoot);` from the body of `ensureProjectInit`.

**Verify:** `pnpm typecheck` passes; Grep for `installTriggerRule` in init-project.ts returns 0 matches.

### Step 3: compile-handler pass editorId and call installTriggerRule

In `mcp/src/handlers/compile-handler.ts`: before the block `if (!initDoneForProject.has(key))`, compute `resolvedEditorId`: `const resolvedEditorId: EditorId = args.editorId !== undefined ? (args.editorId as EditorId) : getEditorId();`. Inside the init block, replace `installTriggerRule(projectRoot);` with `installTriggerRule(projectRoot, resolvedEditorId);`. Remove the duplicate `installTriggerRule(projectRoot);` that appears after `reconcileProjectId(...)`. Use the same `resolvedEditorId` when building `request` (the existing `resolvedEditorId` is currently computed later; move its computation to before the init block and reuse it in both the init block and the request).

**Verify:** `pnpm typecheck` passes; exactly one call to `installTriggerRule` in the handler, with two arguments.

### Step 4: server listRoots pass getEditorId to installTriggerRule

In `mcp/src/server.ts`: in the `listRoots().then((result) => { ... })` callback, change `installTriggerRule(absRoot);` to `installTriggerRule(absRoot, getEditorId());`.

**Verify:** `pnpm typecheck` passes; Grep for `installTriggerRule(absRoot` shows one line with `getEditorId()` as second argument.

### Step 5a: Tests — install-trigger-rule.test.ts

In `mcp/src/__tests__/install-trigger-rule.test.ts`: add `import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";`. For every existing test that calls `installTriggerRule(projectRoot)`, change to `installTriggerRule(projectRoot, EDITOR_ID.CURSOR)`. Add test `claude_code_creates_claude_md`: create temp dir, call `installTriggerRule(projectRoot, EDITOR_ID.CLAUDE_CODE)`, assert `path.join(tmpDir, ".claude", "CLAUDE.md")` exists and file content includes the string "AIC — Claude Code Rules". Add test `generic_creates_no_trigger_file`: create temp dir, call `installTriggerRule(projectRoot, EDITOR_ID.GENERIC)`, assert `path.join(tmpDir, ".cursor", "rules", "AIC.mdc")` does not exist and `path.join(tmpDir, ".claude", "CLAUDE.md")` does not exist.

**Verify:** `pnpm test` for `mcp/src/__tests__/install-trigger-rule.test.ts` passes.

### Step 5b: Tests — init-project.test.ts

In `mcp/src/__tests__/init-project.test.ts`: in the test `creates_config_and_artifacts_when_config_missing`, remove the assertion `expect(fs.existsSync(path.join(tmpDir, ".cursor", "rules", "AIC.mdc"))).toBe(true);`.

**Verify:** `pnpm test` for `mcp/src/__tests__/init-project.test.ts` passes.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| trigger_missing_creates_file | EDITOR_ID.CURSOR: .cursor/rules/AIC.mdc created with aic_compile and projectRoot in content |
| trigger_exists_does_not_overwrite | EDITOR_ID.CURSOR: existing AIC.mdc at same version not overwritten |
| trigger_rule_updated_when_version_changes | EDITOR_ID.CURSOR: old version file overwritten with current package version |
| trigger_missing_creates_rules_dir | EDITOR_ID.CURSOR: .cursor/rules directory created when missing |
| claude_code_creates_claude_md | EDITOR_ID.CLAUDE_CODE: .claude/CLAUDE.md created with template content |
| generic_creates_no_trigger_file | EDITOR_ID.GENERIC: no .cursor/rules/AIC.mdc and no .claude/CLAUDE.md created |
| creates_config_and_artifacts_when_config_missing | ensureProjectInit creates .aic and aic.config.json; no assertion on .cursor (removed) |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] installTriggerRule(projectRoot, editorId) implemented with CURSOR / CLAUDE_CODE / GENERIC dispatch
- [ ] ensureProjectInit no longer calls installTriggerRule
- [ ] compile-handler and server listRoots pass editorId to installTriggerRule
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
