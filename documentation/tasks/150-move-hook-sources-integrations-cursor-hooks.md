# Task 150: Move hook sources to integrations/cursor/hooks/

> **Status:** Pending
> **Phase:** CL (Cursor Clean-Layer Separation)
> **Layer:** mcp + integrations
> **Depends on:** —

## Goal

Move all Cursor hook script sources from `mcp/hooks/` to `integrations/cursor/hooks/` and point the installer at the new path so bootstrap still deploys hooks correctly and Phase CL’s clean-layer layout is established.

## Architecture Notes

- documentation/cursor-integration-layer.md §2: Cursor-specific source lives in `integrations/cursor/`; `.cursor/` is deployment target only.
- Only the path constant in `mcp/src/install-cursor-hooks.ts` changes; no toolchain config updates in this task (CL07).
- Constant name remains `BUNDLED_HOOKS_DIR` (source uses this, not AIC_SCRIPT_DIR).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/install-cursor-hooks.ts` (update BUNDLED_HOOKS_DIR) |

Directory `integrations/cursor/hooks/` is created and the 10 hook files are moved there by the steps below; `mcp/hooks/` is removed after the move.

## Path change (install-cursor-hooks.ts)

Replace the existing `BUNDLED_HOOKS_DIR` definition:

```typescript
const BUNDLED_HOOKS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "hooks",
);
```

with:

```typescript
const BUNDLED_HOOKS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "integrations",
  "cursor",
  "hooks",
);
```

Imports (path, fs, fileURLToPath) are unchanged.

## Config Changes

- **package.json:** None.
- **eslint.config.mjs:** None.

## Steps

### Step 1: Create integrations/cursor/hooks/ directory

Create directory `integrations/cursor/hooks/` at the repository root. Use `fs.mkdirSync` with `{ recursive: true }` or the equivalent so parent directories are created.

**Verify:** `integrations/cursor/hooks/` exists and is a directory.

### Step 2: Move the 10 hook scripts into integrations/cursor/hooks/

Move each of the 10 files from `mcp/hooks/` to `integrations/cursor/hooks/` preserving content. Use a single filesystem move per file: `fs.renameSync(srcPath, destPath)`. If the move is cross-device and rename fails, read the file, write to the destination, then delete the source. The 10 filenames are: AIC-session-init.cjs, AIC-compile-context.cjs, AIC-before-submit-prewarm.cjs, AIC-require-aic-compile.cjs, AIC-inject-conversation-id.cjs, AIC-post-compile-context.cjs, AIC-block-no-verify.cjs, AIC-after-file-edit-tracker.cjs, AIC-stop-quality-check.cjs, AIC-session-end.cjs.

**Verify:** All 10 files exist under `integrations/cursor/hooks/` and `mcp/hooks/` still contains the same 10 files until Step 5.

### Step 3: Update BUNDLED_HOOKS_DIR in mcp/src/install-cursor-hooks.ts

Replace the `BUNDLED_HOOKS_DIR` constant with the definition given in the "Path change" section above: `path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "integrations", "cursor", "hooks")`.

**Verify:** No other references to `mcp/hooks` or the old path remain in that file; `pnpm typecheck` passes.

### Step 4: Run tests

Run `pnpm test`. The tests in `mcp/src/__tests__/install-cursor-hooks.test.ts` call `installCursorHooks(projectRoot)` and assert that the 10 scripts and hooks.json are written to the project’s `.cursor/hooks/`. They read from `BUNDLED_HOOKS_DIR`, so they must pass with the new path.

**Verify:** All tests pass, including install-cursor-hooks tests.

### Step 5: Remove mcp/hooks/ directory

Delete every file in `mcp/hooks/` (the 10 .cjs files), then remove the now-empty `mcp/hooks/` directory.

**Verify:** `mcp/hooks/` no longer exists; `integrations/cursor/hooks/` still contains all 10 scripts.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero errors, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| Existing install-cursor-hooks tests | After path update, installCursorHooks copies scripts from integrations/cursor/hooks/; hooks_missing_creates_hooks_json_and_scripts and related tests pass |

No new test file; regression covered by existing tests.

## Acceptance Criteria

- [ ] Directory `integrations/cursor/hooks/` exists and contains exactly the 10 hook scripts listed in Step 2
- [ ] `mcp/src/install-cursor-hooks.ts` uses the new `BUNDLED_HOOKS_DIR` and no reference to `mcp/hooks`
- [ ] `mcp/hooks/` has been removed
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
