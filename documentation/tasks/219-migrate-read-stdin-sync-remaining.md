# Task 219: Migrate readStdinSync in remaining files

> **Status:** Pending
> **Phase:** AI (Edited-Files Temp Cache Simplification)
> **Layer:** integrations
> **Depends on:** AI02 (Extract shared readStdinSync module)

## Goal

Replace the local `readStdinSync` implementation in `aic-block-no-verify.cjs` (hooks and plugin) with the shared module from `integrations/shared/read-stdin-sync.cjs`, completing the readStdinSync migration so all 8+ consumers use one implementation.

## Architecture Notes

- Phase AI: one shared `read-stdin-sync.cjs` used by all hook scripts; AI02 created it, AI04/AI05 migrated after-file-edit and stop-quality-check; this task migrates the remaining two files (block-no-verify hooks + plugin).
- Same require path pattern as siblings: hooks use `require("../../shared/read-stdin-sync.cjs")`, plugin scripts use `require("../../../shared/read-stdin-sync.cjs")`.
- No new files; no new interfaces. Refactor only — behavior unchanged.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/hooks/aic-block-no-verify.cjs` (require shared readStdinSync; remove local function and unused fs) |
| Modify | `integrations/claude/plugin/scripts/aic-block-no-verify.cjs` (require shared readStdinSync; remove local function and unused fs) |

## Interface / Signature

No new interface. Both files continue to export `{ run }` and call `readStdinSync()` with no arguments (returning a string). The shared module signature is:

```javascript
// integrations/shared/read-stdin-sync.cjs
function readStdinSync() {
  // 64KB buffer loop, fs.readSync(0, ...), Buffer.concat, .toString("utf8")
  return string;
}
module.exports = { readStdinSync };
```

**Hooks file** — add at top (after SPDX/copyright comment block), remove local function and `fs`:

```javascript
const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
```

Remove: `const fs = require("fs");` and the entire local `function readStdinSync() { ... }` (lines 11–21).

**Plugin file** — same edits with plugin-relative path:

```javascript
const { readStdinSync } = require("../../../shared/read-stdin-sync.cjs");
```

Remove: `const fs = require("fs");` and the entire local `function readStdinSync() { ... }` (lines 11–21).

## Dependent Types

None — CommonJS only; no TypeScript types in scope.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Migrate hooks aic-block-no-verify.cjs

In `integrations/claude/hooks/aic-block-no-verify.cjs`:

1. Remove the line `const fs = require("fs");`.
2. Add after the SPDX/copyright comment block (before `function stripQuoted`):  
   `const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");`
3. Delete the entire local `function readStdinSync() { ... }` (the 10-line function that uses `Buffer.alloc`, `fs.readSync(0, buf, ...)`, and `Buffer.concat`).

Leave `stripQuoted`, `run`, and the `if (require.main === module)` block unchanged.

**Verify:** File contains exactly one `readStdinSync` reference (the require and the call in the main block). No `fs` require. Grep for `readStdinSync` in this file returns 2 lines (require + call).

### Step 2: Migrate plugin aic-block-no-verify.cjs

In `integrations/claude/plugin/scripts/aic-block-no-verify.cjs`:

1. Remove the line `const fs = require("fs");`.
2. Add after the SPDX/copyright comment block (before `function stripQuoted`):  
   `const { readStdinSync } = require("../../../shared/read-stdin-sync.cjs");`
3. Delete the entire local `function readStdinSync() { ... }` (the same 10-line function).

Leave `stripQuoted`, `run`, and the `if (require.main === module)` block unchanged.

**Verify:** File contains exactly one `readStdinSync` reference (the require and the call in the main block). No `fs` require. Grep for `readStdinSync` in this file returns 2 lines (require + call).

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings. Run the block-no-verify tests with: `pnpm test integrations/claude/__tests__/aic-block-no-verify.test.cjs` and confirm all cases pass.

## Tests

| Test case | Description |
| --------- | ----------- |
| Existing aic-block-no-verify.test.cjs | All existing cases (deny_git_no_verify, deny_git_short_n, allow_git_without_flag, allow_non_git, allow_quoted_no_verify_in_message, allow_empty_or_malformed) pass without change — script still reads stdin via shared readStdinSync and produces same output. |

No new test file; regression covered by existing test.

## Acceptance Criteria

- [ ] Both files modified per Files table
- [ ] Hooks file requires readStdinSync from `../../shared/read-stdin-sync.cjs`; plugin file from `../../../shared/read-stdin-sync.cjs`
- [ ] Local readStdinSync and `fs` require removed from both files
- [ ] All existing aic-block-no-verify tests pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
