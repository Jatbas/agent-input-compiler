# Task 154: Remove mcp/src/install-cursor-hooks.ts

> **Status:** Pending
> **Phase:** CL (Cursor clean-layer separation)
> **Layer:** mcp
> **Depends on:** CL02 (integrations/cursor/install.cjs)

## Goal

Delete `mcp/src/install-cursor-hooks.ts` and all references; wire the MCP server bootstrap (listRoots in oninitialized) to invoke `integrations/cursor/install.cjs` via `child_process.execFileSync` when the script exists, so Cursor hooks are installed from the standalone script instead of the removed TypeScript module.

## Architecture Notes

- ADR: Cursor integration lives in `integrations/cursor/`; MCP server must not depend on Cursor-specific TypeScript — only invoke the standalone installer when present.
- Design: Run install.cjs only when `path.join(projectRoot, "integrations/cursor/install.cjs")` exists so non-AIC projects do not throw.
- ensureProjectInit and the compile-handler init block no longer install hooks; hooks are installed only via the server’s oninitialized listRoots path until CL04.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/init-project.ts` (remove import and installCursorHooks call) |
| Modify | `mcp/src/handlers/compile-handler.ts` (remove import and installCursorHooks call) |
| Modify | `mcp/src/server.ts` (remove import and call; add execFileSync wiring for install.cjs) |
| Modify | `mcp/src/__tests__/init-project.test.ts` (remove .cursor/hooks.json assertion) |
| Delete | `mcp/src/install-cursor-hooks.ts` |
| Delete | `mcp/src/__tests__/install-cursor-hooks.test.ts` |

## Interface / Signature

N/A — removal task. No new interface. The replacement behavior in `server.ts` is:

- Add import: `import { execFileSync } from "node:child_process";`
- In the listRoots callback, replace `installCursorHooks(absRoot);` with:

```typescript
const installScript = path.join(absRoot, "integrations", "cursor", "install.cjs");
if (fs.existsSync(installScript)) {
  execFileSync("node", [installScript], { cwd: absRoot });
}
```

`path` and `fs` are already imported in `server.ts`. `absRoot` is the project root (AbsolutePath); use it as the `cwd` and as the base for the script path.

## Dependent Types

N/A — removal task; no new types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: init-project — remove hook install

In `mcp/src/init-project.ts`, remove the import of `installCursorHooks` from `./install-cursor-hooks.js` and remove the line `installCursorHooks(projectRoot);` from `ensureProjectInit`.

**Verify:** Grep for `install-cursor-hooks` or `installCursorHooks` in `mcp/src/init-project.ts` returns 0 matches.

### Step 2: compile-handler — remove hook install

In `mcp/src/handlers/compile-handler.ts`, remove the import of `installCursorHooks` from `../install-cursor-hooks.js` and remove the line `installCursorHooks(projectRoot);` from the init block (the block that calls ensureProjectInit, reconcileProjectId, installTriggerRule).

**Verify:** Grep for `install-cursor-hooks` or `installCursorHooks` in `mcp/src/handlers/compile-handler.ts` returns 0 matches.

### Step 3: server — wire install.cjs and remove TS module reference

In `mcp/src/server.ts`:
- Add `import { execFileSync } from "node:child_process";` with the other Node imports.
- Remove the import of `installCursorHooks` from `./install-cursor-hooks.js`.
- In the `listRoots().then(...)` callback, replace `installCursorHooks(absRoot);` with: compute `installScript = path.join(absRoot, "integrations", "cursor", "install.cjs")`; if `fs.existsSync(installScript)` then `execFileSync("node", [installScript], { cwd: absRoot });`.

**Verify:** Grep for `install-cursor-hooks` or `installCursorHooks` in `mcp/src/server.ts` returns 0 matches. Grep for `execFileSync` and `install.cjs` in `mcp/src/server.ts` returns at least one match each.

### Step 4: init-project test — drop hooks assertion

In `mcp/src/__tests__/init-project.test.ts`, in the test `creates_config_and_artifacts_when_config_missing`, remove the assertion that `.cursor/hooks.json` exists — delete the line `expect(fs.existsSync(path.join(tmpDir, ".cursor", "hooks.json"))).toBe(true);`. Keep the assertions for `.aic`, `aic.config.json`, and `.cursor/rules/AIC.mdc`.

**Verify:** The test file no longer asserts on `.cursor/hooks.json` or `.cursor/hooks/`.

### Step 5: Delete install-cursor-hooks and its test

Delete the files `mcp/src/install-cursor-hooks.ts` and `mcp/src/__tests__/install-cursor-hooks.test.ts`.

**Verify:** Both files no longer exist. `pnpm typecheck` passes (no dangling imports).

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| typecheck_clean | No dangling imports after removal; pnpm typecheck passes |
| init_project_test | init-project.test.ts passes with updated assertion (no .cursor/hooks.json) |
| full_suite | pnpm test passes (install-cursor-hooks.test.ts removed; integrations/cursor/__tests__/install.test.js covers install.cjs) |

## Acceptance Criteria

- [ ] All file changes per Files table (four modify, two delete)
- [ ] No remaining imports or calls to installCursorHooks or install-cursor-hooks in mcp/src
- [ ] server.ts runs install.cjs via execFileSync when the script path exists
- [ ] init-project.test.ts no longer asserts .cursor/hooks.json in ensureProjectInit test
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] `pnpm test` — all pass

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
