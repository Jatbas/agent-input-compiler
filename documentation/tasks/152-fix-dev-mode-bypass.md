# Task 152: CL06 — Fix dev-mode bypass

> **Status:** Pending
> **Phase:** CL — Cursor Clean-Layer Separation
> **Layer:** integrations/cursor
> **Depends on:** CL01

## Goal

Replace the path-based dev-mode bypass in the require-aic-compile hook with an explicit env var (`AIC_DEV_MODE=1`) so the AIC repo no longer depends on `mcp/` path structure after hooks moved to `integrations/cursor/hooks/`.

## Architecture Notes

- Clean-layer principle (cursor-integration-layer.md §2): Cursor integration must not rely on `mcp/` paths. Dev-mode bypass should be explicit (env var), not inferred from directory layout.
- Single file change in `integrations/cursor/hooks/AIC-require-aic-compile.cjs` plus documentation in CONTRIBUTING.md.
- No new interfaces or types; refactoring only.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/cursor/hooks/AIC-require-aic-compile.cjs` (replace path-based bypass with `process.env.AIC_DEV_MODE === '1'`) |
| Modify | `CONTRIBUTING.md` (document `AIC_DEV_MODE=1` under Local MCP testing) |

## Interface / Signature

No new interface. Before/after of the dev-mode bypass block:

**Before (remove):**

```javascript
// Skip enforcement inside the AIC source repo (development mode).
const projectRoot = path.resolve(__dirname, "..", "..");
if (fs.existsSync(path.join(projectRoot, "mcp", "hooks"))) {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}
```

**After (insert at same location):**

```javascript
// Skip enforcement when developing AIC (set AIC_DEV_MODE=1 in env or .env).
if (process.env.AIC_DEV_MODE === "1") {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}
```

The rest of the file is unchanged. `path` remains required for `getStateFile` and `getPromptFile` (they use `path.join(os.tmpdir(), ...)`).

## Dependent Types

None — script is CommonJS, no TypeScript types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Replace path-based bypass in require-aic-compile hook

In `integrations/cursor/hooks/AIC-require-aic-compile.cjs`:

1. Remove the three lines that set `projectRoot` and check `fs.existsSync(path.join(projectRoot, "mcp", "hooks"))` (the block from the comment `// Skip enforcement inside the AIC source repo` through the closing `}` and `exit(0)`).
2. Insert in their place the env-based bypass: if `process.env.AIC_DEV_MODE === "1"`, write `{ permission: "allow" }` to stdout and `process.exit(0)`.
3. Keep the comment updated to state that dev mode is controlled by `AIC_DEV_MODE=1` (set in env or .env).

Do not remove `const path = require("path")` or `const fs = require("fs")` — both are still used later in the file.

**Verify:** Grep the file for `mcp` and for `path.resolve(__dirname` — both must return 0 matches. Grep for `AIC_DEV_MODE` — must return 1 match.

### Step 2: Document AIC_DEV_MODE in CONTRIBUTING.md

In `CONTRIBUTING.md`, under the **Local MCP testing** section (after the step that says "Restart Cursor (or reload MCP)..."):

Add a new numbered step (or a short subsection) that states: when developing AIC in Cursor, the preToolUse hook blocks all tools until `aic_compile` has been called. To bypass this gate in the AIC repo only, set `AIC_DEV_MODE=1` in your shell when launching Cursor or in a `.env` file in the repo root. Then the hook allows tools without requiring a prior aic_compile call.

**Verify:** Grep CONTRIBUTING.md for `AIC_DEV_MODE` — must return at least 1 match.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero errors, zero warnings, no new knip findings.

Manual check (document for executor): In the AIC project, run Cursor with `AIC_DEV_MODE=1` set — run `AIC_DEV_MODE=1 cursor .` or add `AIC_DEV_MODE=1` to a `.env` file in the repo root. Send a message that does not call aic_compile first; the hook should allow. With `AIC_DEV_MODE` unset, the hook should deny until aic_compile is called.

## Tests

| Test case | Description |
| --------- | ----------- |
| regression | pnpm lint, pnpm typecheck, pnpm test, pnpm knip all pass |
| manual_dev_mode | With AIC_DEV_MODE=1, hook allows tools without prior aic_compile (manual) |

## Acceptance Criteria

- [ ] Dev-mode bypass uses `process.env.AIC_DEV_MODE === "1"` only; no `mcp` or `path.resolve(__dirname, ...)` for bypass.
- [ ] CONTRIBUTING.md documents `AIC_DEV_MODE=1` for local AIC development.
- [ ] `pnpm lint` — zero errors, zero warnings.
- [ ] `pnpm typecheck` — clean.
- [ ] `pnpm test` — all pass.
- [ ] `pnpm knip` — no new unused files, exports, or dependencies.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
