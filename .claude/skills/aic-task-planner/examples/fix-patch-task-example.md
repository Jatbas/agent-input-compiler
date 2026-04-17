# Task 999-ax98: Fix stale deployed Cursor hook

**Status:** approved
**Recipe:** fix-patch
**Owner:** executor

## Goal

`conversation-id-rotate.cjs` as deployed at `.cursor/hooks/` is out of sync with the source at `integrations/shared/`. Update the installer so every deployment overwrites stale copies, and add a fix-verification test that catches future drift.

## Architecture Notes

- Root cause: `integrations/cursor/install.cjs:142` only writes the hook file when it does not already exist (`if (!fs.existsSync(target)) { ... }`). Any change to `conversation-id-rotate.cjs` after first install is never propagated.
- Why overwrite rather than diff-and-skip: a diff-skip path adds complexity and hides upgrades; the hooks are fully owned by the installer and have no user edits.
- Blast radius: four hooks currently deployed under `.cursor/hooks/`. All four are installer-owned — no user customisation contract exists. A grep across the codebase (step 2 below) confirms no consumer assumes a specific deployed version.

## Behavior Change

**Before (broken):** `install.cjs` runs → hook file already exists at target → installer leaves the stale file untouched.
**After (fixed):** `install.cjs` runs → hook file is rewritten from the source unconditionally → deployed file matches source.

## Files

| Action | Path                                                          | Reason                                                               |
| ------ | ------------------------------------------------------------- | -------------------------------------------------------------------- |
| Modify | `integrations/cursor/install.cjs`                             | Remove the `if (!fs.existsSync(target))` guard around the hook copy. |
| Modify | `integrations/cursor/__tests__/install.test.cjs`              | Existing test asserts hook-not-overwritten; reverse the assertion.   |
| Create | `integrations/cursor/__tests__/install-hook-refresh.test.cjs` | Fix-verification test that fails on the broken version.              |

## Steps

1. Edit `integrations/cursor/install.cjs:142`. Remove the `if (!fs.existsSync(target))` guard so `fs.copyFileSync(source, target)` runs unconditionally.
2. Grep the codebase for any test or runtime code that encodes the "preserve existing hook" behaviour: `rg "existsSync" integrations/cursor/ integrations/shared/ .cursor/hooks/`. For each hit, classify as same-cause (update), different-issue (leave), already-correct (leave). Expected: one same-cause hit at `integrations/cursor/__tests__/install.test.cjs:88`.
3. Update `integrations/cursor/__tests__/install.test.cjs`: rename the test `"does not overwrite existing hook"` to `"overwrites stale hook with current source"`, and invert the assertion from `.toBe(originalContent)` to `.toBe(sourceContent)`.
4. Create `integrations/cursor/__tests__/install-hook-refresh.test.cjs` containing a fix-verification test: seed `.cursor/hooks/conversation-id-rotate.cjs` with the known-bad content `"STALE"`, run the installer, assert the target now contains the full source. This test MUST fail on the un-patched `install.cjs`.
5. Run `pnpm test integrations/cursor/__tests__/install.test.cjs integrations/cursor/__tests__/install-hook-refresh.test.cjs`. Both pass.
6. Idempotency check: run the installer twice on a clean target; confirm the second run is a no-op w.r.t. content (same hash).
7. Final verification: `pnpm lint && pnpm typecheck && pnpm test && node integrations/__tests__/pack-install-smoke.test.cjs`. All green.

## Tests

- Inverted assertion in the existing `install.test.cjs` still passes: installing over an existing file overwrites it with the current source.
- New fix-verification test in `install-hook-refresh.test.cjs`: seeded stale content is replaced on install; this test fails on the un-patched `install.cjs` and passes on the patched version.
- Pack-install smoke test `integrations/__tests__/pack-install-smoke.test.cjs` still passes end-to-end.

## Config Changes

- No new config keys. No environment variables. No schema migrations.

## Acceptance criteria

- [ ] `integrations/cursor/install.cjs` no longer contains `if (!fs.existsSync(target))` around the hook copy.
- [ ] `install-hook-refresh.test.cjs` passes on the patched code and fails when reverted (manually verified).
- [ ] Updated `install.test.cjs` passes with the new assertion.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass.
- [ ] `pack-install-smoke.test.cjs` still passes.

## Why this example

Shows:

- Recipe = `fix-patch` with a Behavior Change section replacing Interface / Signature.
- Root cause cited at `file:line`.
- Pattern-exhaustiveness scan (step 2) producing a classified list.
- Fix-verification test (step 4) that proves it catches the bug.
- Idempotency check for an installer fix (step 6).
- Acceptance criteria reference the NEW test explicitly — not a generic "tests pass".
