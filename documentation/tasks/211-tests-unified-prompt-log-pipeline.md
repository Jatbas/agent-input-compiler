# Task 211: Tests for Unified Prompt-Log Pipeline

> **Status:** Pending
> **Phase:** AG (Prompt Log Pipeline Simplification)
> **Layer:** integrations (test)
> **Depends on:** AG04 (Migrate all write sites to shared module)

## Goal

Wire the existing prompt-log unit tests into the root test script and add a pruning regression test that uses the unified JSONL schema so the unified prompt-log pipeline is fully covered by CI.

## Architecture Notes

- Test infrastructure only: no new production code. Existing `integrations/shared/__tests__/prompt-log.test.cjs` already covers both type values, field validation rejection, mkdir 0o700, and backward compat with old-shape entries; it is not invoked by `pnpm test`.
- Wire that script into root `package.json` "test" (same pattern as other integration tests). Add one `it()` in `shared/src/maintenance/__tests__/prune-prompt-log.test.ts` so pruning is explicitly tested with unified-schema lines (type, editorId, conversationId, timestamp).
- Pruning only uses `timestamp` per line; unified envelope is backward compatible. The new test ensures prunePromptLog still behaves correctly when the log file contains the new schema.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `package.json` (add `node integrations/shared/__tests__/prompt-log.test.cjs` to scripts.test) |
| Modify | `shared/src/maintenance/__tests__/prune-prompt-log.test.ts` (add one it() for unified-schema pruning) |

## Interface / Signature

SUT (module under test) — no new interface; reference for verification:

```javascript
// integrations/shared/prompt-log.cjs
function appendPromptLog(projectRoot, entry) {
  // Validates entry.type, entry.editorId, entry.conversationId, entry.timestamp;
  // for type "prompt": generationId, title, model; for type "session_end": reason.
  // mkdirSync(.aic, { recursive: true, mode: 0o700 }); appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
  // Returns void; silently returns on validation failure or fs error.
}
module.exports = { appendPromptLog };
```

Pruning (existing) — add test that calls it with unified-schema log content:

```typescript
// shared/src/maintenance/prune-prompt-log.ts
export function prunePromptLog(projectRoot: AbsolutePath, clock: Clock): void;
```

## Dependent Types

None — task only modifies test script and adds one vitest `it()`; SUT is CommonJS with plain parameters.

## Config Changes

- **package.json:** In scripts.test, append ` && node integrations/shared/__tests__/prompt-log.test.cjs` after the last existing `node integrations/...` invocation.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Wire prompt-log unit tests into test script

In `package.json`, locate the `"test"` script. Append ` && node integrations/shared/__tests__/prompt-log.test.cjs` to the script value so it runs after the last existing integration test invocation (after `AIC-subagent-model-id.test.cjs`).

**Verify:** Run `pnpm test` from repo root; output includes the prompt-log test run (six "OK" lines for valid_prompt_type, valid_session_end_type, invalid_envelope_rejected, invalid_type_rejected, mkdir_mode_0700, backward_compat_legacy_shape) and the command exits 0.

### Step 2: Add pruning test for unified-schema lines

In `shared/src/maintenance/__tests__/prune-prompt-log.test.ts`, inside the existing `describe("prunePromptLog", ...)`, add one new test:

- `it("prunes correctly when log has unified-schema lines", ...)`
- Create a temp dir and `.aic/prompt-log.jsonl` with three JSONL lines in the unified schema: common envelope `type`, `editorId`, `conversationId`, `timestamp` plus type-specific fields. Use two lines with timestamp `2026-03-08T12:00:00.000Z` (older than CUTOFF) and one with timestamp `2026-03-09T12:00:00.000Z` (at CUTOFF). Use the same `stubClock()` and CUTOFF as existing tests. Call `prunePromptLog(projectRoot, stubClock())`. Read the file and assert exactly 2 lines remain; assert each remaining line parses as JSON and has `timestamp` >= CUTOFF. Use `afterEach` cleanup (tmpDir) like the other tests.

**Verify:** Run `pnpm test` and confirm the new test appears in vitest output and passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| prompt_log_unit_tests | prompt-log.test.cjs runs via pnpm test; all six cases pass |
| pruning_with_unified_schema | New it() in prune-prompt-log.test.ts: unified-schema log lines are pruned by timestamp correctly |

## Acceptance Criteria

- [ ] package.json test script includes `node integrations/shared/__tests__/prompt-log.test.cjs`
- [ ] prune-prompt-log.test.ts has one new it("prunes correctly when log has unified-schema lines") that writes unified-format lines and asserts prunePromptLog keeps only lines with timestamp >= CUTOFF
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all tests pass including prompt-log and new pruning test
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
