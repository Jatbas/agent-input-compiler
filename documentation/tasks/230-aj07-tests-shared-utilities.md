# Task 230: AJ07 — Tests for shared utilities

> **Status:** Pending
> **Phase:** AJ (Integration shared modules)
> **Layer:** integrations (test harness)
> **Depends on:** AJ06

## Goal

Wire the two existing shared-utility test files (`resolve-project-root.test.cjs` and `conversation-id.test.cjs`) into the root `package.json` "test" script so that `pnpm test` runs all three shared-utility tests (resolveProjectRoot, conversationIdFromTranscriptPath, appendJsonl/ensureAicDir). The test files already exist and pass when run manually; the fix is script wiring only.

## Architecture Notes

- Root cause: The "test" script in package.json invokes several `node integrations/shared/__tests__/*.test.cjs` files but omits resolve-project-root.test.cjs and conversation-id.test.cjs. Blast radius: one file (package.json).
- No new test cases: Existing tests already cover the behaviors listed in mvp-progress (resolveProjectRoot for Cursor env, Claude cwd, env fallback, toolInput override; conversationIdFromTranscriptPath; appendJsonl/ensureAicDir in aic-dir.test.cjs).
- Fix verification: After the edit, `pnpm test` must complete successfully and the two added invocations must run (they exit 0; failure would cause the script to fail).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `package.json` (add two node invocations to "test" script) |

## Before/After Behavior

**Before:** The "test" script runs `node integrations/shared/__tests__/session-markers.test.cjs && node integrations/shared/__tests__/aic-dir.test.cjs && ...`. The two test files resolve-project-root.test.cjs and conversation-id.test.cjs are never executed by `pnpm test`.

**After:** The "test" script runs, in order after session-markers.test.cjs: resolve-project-root.test.cjs, conversation-id.test.cjs, then aic-dir.test.cjs. All three shared-utility test files execute during `pnpm test`.

## Config Changes

- **package.json:** Add two commands to the "test" script. No other changes.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add missing test invocations to "test" script

In `package.json`, in the "test" script string, insert the two missing `node` invocations immediately after `session-markers.test.cjs &&` and before `aic-dir.test.cjs`.

Replace this fragment:

```
node integrations/shared/__tests__/session-markers.test.cjs && node integrations/shared/__tests__/aic-dir.test.cjs
```

with:

```
node integrations/shared/__tests__/session-markers.test.cjs && node integrations/shared/__tests__/resolve-project-root.test.cjs && node integrations/shared/__tests__/conversation-id.test.cjs && node integrations/shared/__tests__/aic-dir.test.cjs
```

**Verify:** Read the "test" script and confirm it contains the substrings `resolve-project-root.test.cjs` and `conversation-id.test.cjs`.

### Step 2: Fix verification

Run: `pnpm test`

Expected: All commands complete successfully (exit 0). The two new test files run and print "OK" for each case; any failure would cause the script to exit non-zero.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm knip`

Expected: All pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| test_script_includes_both_files | The "test" script in package.json contains the exact strings `resolve-project-root.test.cjs` and `conversation-id.test.cjs` |
| pnpm_test_passes | `pnpm test` completes with exit code 0, so the two new test invocations run and pass |

## Acceptance Criteria

- [ ] package.json "test" script includes `node integrations/shared/__tests__/resolve-project-root.test.cjs` and `node integrations/shared/__tests__/conversation-id.test.cjs` in the order specified
- [ ] `pnpm test` passes (fix-verification: the two tests execute and exit 0)
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
