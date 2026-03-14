# Task 155: Wire npx @aic/mcp init to Cursor installer

> **Status:** Pending
> **Phase:** CL — Cursor Clean-Layer Separation
> **Layer:** mcp
> **Depends on:** CL03 (Remove mcp/src/install-cursor-hooks.ts)

## Goal

In the `listRoots` bootstrap path in `mcp/src/server.ts`, run the Cursor installer only when Cursor is detected for that project root (`.cursor` directory or `CURSOR_PROJECT_DIR` env set). If not Cursor, skip installation silently. This is the interim editor-aware dispatch before U02 adds full editor detection.

## Architecture Notes

- Composition root modification only; no new interfaces or classes (AIC-architect: DIP, composition root is the single place that wires and calls install script).
- Cursor detection: presence of `.cursor` in project root or truthy `process.env.CURSOR_PROJECT_DIR`. Do not run `integrations/cursor/install.cjs` when the project is not a Cursor project.
- Install script path remains `path.join(absRoot, "integrations", "cursor", "install.cjs")`; run only when both cursorDetected and script exists.
- MCP server must not crash on installer failure — existing try/catch around the root loop body is sufficient.

## Files

| Action | Path                                      |
| ------ | ----------------------------------------- |
| Modify | `mcp/src/server.ts` (add Cursor detection guard before running install.cjs) |

## Wiring change (listRoots callback)

Inside the `for (const root of result.roots)` loop, after `installTriggerRule(absRoot)` and before building `installScript`, add a Cursor check. Run the installer only when (1) Cursor is detected for this root and (2) the install script path exists.

**Cursor detection (one expression):**

- `fs.existsSync(path.join(absRoot, ".cursor"))` is true, OR
- `process.env.CURSOR_PROJECT_DIR !== undefined && process.env.CURSOR_PROJECT_DIR !== ""`

**Code shape after change:**

```typescript
const absRoot = toAbsolutePath(rootPath);
installTriggerRule(absRoot);
const cursorDetected =
  fs.existsSync(path.join(absRoot, ".cursor")) ||
  (process.env.CURSOR_PROJECT_DIR !== undefined &&
    process.env.CURSOR_PROJECT_DIR !== "");
if (!cursorDetected) {
  continue;
}
const installScript = path.join(
  absRoot,
  "integrations",
  "cursor",
  "install.cjs",
);
if (fs.existsSync(installScript)) {
  execFileSync("node", [installScript], { cwd: absRoot });
}
```

## Dependent Types

Not applicable — no new types. Uses existing `AbsolutePath` (from `toAbsolutePath`), Node `fs`, `path`, `execFileSync` as already used in this file.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add Cursor detection and guard in listRoots callback

In `mcp/src/server.ts`, locate the `oninitialized` callback and the `for (const root of result.roots)` loop. After `installTriggerRule(absRoot);`, add the Cursor detection and guard:

1. Define `cursorDetected` as: `fs.existsSync(path.join(absRoot, ".cursor")) || (process.env.CURSOR_PROJECT_DIR !== undefined && process.env.CURSOR_PROJECT_DIR !== "")`.
2. If `!cursorDetected`, `continue` to the next root (skip Cursor installer for this root).
3. Keep the existing `installScript` construction and `if (fs.existsSync(installScript)) { execFileSync(...) }` block unchanged.

Preserve the existing `try { ... } catch { ... }` around the loop body so that any thrown error from the loop body still skips only that root.

**Verify:** `pnpm typecheck` passes. Grep for `cursorDetected` in `mcp/src/server.ts` shows exactly one definition and one use (`if (!cursorDetected) continue;`).

### Step 2: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description        |
| --------- | ------------------ |
| Existing server and init tests | No new test file. Rely on existing `mcp/src/__tests__/server.test.ts` and init-project tests; final verification step runs full test suite. |

## Acceptance Criteria

- [ ] `mcp/src/server.ts` updated: Cursor detection and guard added before running the Cursor installer in the listRoots callback
- [ ] Installer runs only when (1) `path.join(absRoot, ".cursor")` exists or `CURSOR_PROJECT_DIR` is set, and (2) `integrations/cursor/install.cjs` exists under that root
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No new `let` in production code; single-line comments only

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. List the adaptations, report to the user, and re-evaluate before continuing.
