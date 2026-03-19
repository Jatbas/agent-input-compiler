# Task 217: Tests for session markers and session log

> **Status:** Pending
> **Phase:** AH (Session markers and session log)
> **Layer:** test (integrations)
> **Depends on:** AH05 (Migrate all marker and log sites to shared modules)

## Goal

Add the missing stale-lock-recovery test to the existing session-markers test file so that AH06’s unit-test scope is complete (lock acquire/release, concurrent lock blocks second caller, marker write/read/clear, `isSessionAlreadyInjected`, `appendSessionLog` valid JSONL, and stale lock recovery).

## Architecture Notes

- Test-only change: no production code or config changes; single Modify to `integrations/shared/__tests__/session-markers.test.cjs`.
- Session-log tests already cover `appendSessionLog` and valid JSONL; only session-markers.test.cjs is modified.
- Stale lock recovery: when lock file exists and marker has content, `acquireSessionLock` removes the lock and returns false; the next call returns true (session-markers.cjs lines 26–41).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/shared/__tests__/session-markers.test.cjs` (add `stale_lock_recovery` and register in `cases` array) |

## Interface / Signature

Modules under test (no new production code). Exports exercised by the new test:

- `acquireSessionLock(projectRoot)` → boolean
- `releaseSessionLock(projectRoot)` → void
- `writeSessionMarker(projectRoot, sessionId)` → void

New test function to add (same pattern as existing tests: temp dir, try/finally cleanup):

```javascript
function stale_lock_recovery() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-session-markers-"));
  try {
    const dir = path.join(projectRoot, ".aic");
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const lock = path.join(projectRoot, ".aic", ".session-start-lock");
    const fd = fs.openSync(lock, "w");
    fs.closeSync(fd);
    writeSessionMarker(projectRoot, "sid-stale");
    assert.strictEqual(acquireSessionLock(projectRoot), false);
    assert.strictEqual(acquireSessionLock(projectRoot), true);
    releaseSessionLock(projectRoot);
    assert.strictEqual(fs.existsSync(lock), false);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}
```

Register it in the `cases` array after `isSessionAlreadyInjected_false`.

## Dependent Types

None — CJS modules under test use plain strings and Node.js paths; no branded types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add stale_lock_recovery test to session-markers.test.cjs

In `integrations/shared/__tests__/session-markers.test.cjs`:

1. Add the `stale_lock_recovery` function (see Interface / Signature) after `isSessionAlreadyInjected_false` and before the `cases` array.
2. Append `stale_lock_recovery` to the `cases` array.

**Verify:** Run `node integrations/shared/__tests__/session-markers.test.cjs` from the project root. All six tests (including OK stale_lock_recovery) pass and exit code is 0.

### Step 2: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| stale_lock_recovery | With lock file and marker containing a session id, first acquireSessionLock returns false, second returns true after internal cleanup; releaseSessionLock removes the lock file. |

## Acceptance Criteria

- [ ] `integrations/shared/__tests__/session-markers.test.cjs` includes `stale_lock_recovery` and it is in the `cases` array
- [ ] All test cases pass (including stale_lock_recovery)
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No production code or config changed

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
