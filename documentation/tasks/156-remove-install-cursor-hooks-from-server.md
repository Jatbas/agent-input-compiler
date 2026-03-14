# Task 156: Remove installCursorHooks() from server.ts (CL05)

> **Status:** Pending
> **Phase:** Cursor Integration Layer (CL)
> **Layer:** mcp
> **Depends on:** CL04 (Wire npx @aic/mcp init to Cursor installer)

## Goal

Remove any remaining references to `installCursorHooks`, `install-cursor-hooks`, or `mcp/hooks/` from `mcp/src/server.ts` so that the only Cursor-related code path is the CL04 bootstrap dispatch (installTriggerRule plus standalone `integrations/cursor/install.cjs`). Verify typecheck and tests pass.

## Architecture Notes

- ADR-009: Validation at MCP boundary only; this task does not add validation.
- Composition root discipline: server.ts is the only file modified; no new wiring.
- Design decision: Removal scope is server.ts only. Allowed to remain: CL04 dispatch (installTriggerRule, cursorDetected, execFileSync of install.cjs), user-facing strings containing "Cursor", and editor/model identifiers (EDITOR_ID.CURSOR, cursorModel).

## Files

| Action | Path                                      |
| ------ | ----------------------------------------- |
| Modify | `mcp/src/server.ts` |

## Interface / Signature

Not applicable — no new interfaces or classes. This task only removes references from an existing file.

## Dependent Types

Not applicable — no types consumed or produced by this change.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Grep and remove forbidden references

In `mcp/src/server.ts`, search for the exact strings `installCursorHooks`, `install-cursor-hooks`, and `mcp/hooks`. Remove every matching line: any import statement that references these, and any function call or expression that references them. If grep finds no matches, skip edits and proceed to Step 2.

**Verify:** Running `grep -n "installCursorHooks\|install-cursor-hooks\|mcp/hooks" mcp/src/server.ts` returns exit code 1 (no matches).

### Step 2: Confirm only Cursor path is CL04 dispatch

Read the bootstrap block in `mcp/src/server.ts` (the `server.server.oninitialized` handler that calls `listRoots()`). Confirm the only Cursor-specific logic is: (1) `installTriggerRule(absRoot)`, (2) detection of Cursor via `fs.existsSync(path.join(absRoot, ".cursor"))` or `process.env["CURSOR_PROJECT_DIR"]`, (3) when Cursor is detected, `execFileSync("node", [installScript], { cwd: absRoot })` where `installScript` is `path.join(absRoot, "integrations", "cursor", "install.cjs")`. No other Cursor-related imports or function calls may remain.

**Verify:** No import from `install-cursor-hooks` or any path containing `mcp/hooks`; no call to `installCursorHooks`.

### Step 3: Final verification

Run: `pnpm typecheck && pnpm test`

Expected: both pass, zero errors.

## Tests

| Test case | Description        |
| --------- | ------------------ |
| typecheck_and_test | pnpm typecheck and pnpm test pass after edits; no new test file. |

## Acceptance Criteria

- [ ] All references to installCursorHooks, install-cursor-hooks, and mcp/hooks removed from mcp/src/server.ts (or none were present)
- [ ] Only Cursor-related code path in server.ts is the CL04 bootstrap (installTriggerRule + cursor detection + execFileSync install.cjs)
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] No new test file required; verification is grep + typecheck + test

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
