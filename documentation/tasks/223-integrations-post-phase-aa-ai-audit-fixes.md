# Task 223: Integrations post-Phase-AA–AI audit fixes

> **Status:** Pending
> **Phase:** Post-Phase-AA–AI
> **Layer:** integrations
> **Depends on:** None

## Goal

Fix three bugs from the post-Phase-AA–AI audit: (1) Claude session-end hooks delete the wrong temp file (aic-cc-edited-*) instead of the file written by the edited-files tracker (aic-edited-claude_code-*); (2) aic-session-end test asserts the wrong JSONL field (sessionId instead of conversationId); (3) three shared module test files are not wired into the pnpm test script.

## Architecture Notes

- Root cause Bug 1: Both session-end scripts build a path with prefix "aic-cc-edited-" and call fs.unlinkSync. The actual file is written by writeEditedFiles("claude_code", sessionId, ...) in edited-files-cache.cjs as aic-edited-claude_code-{key}.json. Fix: call cleanupEditedFiles("claude_code", sessionId) from integrations/shared/edited-files-cache.cjs in both hooks.
- Root cause Bug 2: appendPromptLog receives { conversationId: sessionId, ... }; the JSONL entry uses the key conversationId. The test incorrectly checks obj.sessionId.
- Blast radius: 4 files modified (2 hooks, 1 test, 1 package.json). No new files. No interface changes.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/hooks/aic-session-end.cjs` (use cleanupEditedFiles, remove path/os) |
| Modify | `integrations/claude/plugin/scripts/aic-session-end.cjs` (use cleanupEditedFiles, remove path/os) |
| Modify | `integrations/claude/__tests__/aic-session-end.test.cjs` (conversationId assertion, getTempPath for temp file) |
| Modify | `package.json` (append three node test commands to "test" script) |

## Before/After Behavior

**Bug 1 — Session-end temp file:**
- Before: Unlinks `path.join(os.tmpdir(), "aic-cc-edited-" + sanitized + ".json")`. That file is never written by the tracker; the real file is aic-edited-claude_code-{sessionId}.json.
- After: Calls `cleanupEditedFiles("claude_code", sessionId)`, which unlinks `getTempPath("claude_code", sessionId)` (aic-edited-claude_code-{sanitized_key}.json). Correct file is removed.

**Bug 2 — Test assertion:**
- Before: Test checks `obj.sessionId !== "s1"` and error message says "sessionId".
- After: Test checks `obj.conversationId !== "s1"` and error message says "conversationId" (matches JSONL written by appendPromptLog).

**Gap 3 — Test script:**
- Before: "test" script does not run session-markers, session-log, session-model-cache tests.
- After: "test" script ends with `&& node integrations/shared/__tests__/session-markers.test.cjs && node integrations/shared/__tests__/session-log.test.cjs && node integrations/shared/__tests__/session-model-cache.test.cjs`.

## Config Changes

- **package.json:** Append to the "test" script: `&& node integrations/shared/__tests__/session-markers.test.cjs && node integrations/shared/__tests__/session-log.test.cjs && node integrations/shared/__tests__/session-model-cache.test.cjs`. No other changes.

## Steps

### Step 1: Fix hooks aic-session-end.cjs

In `integrations/claude/hooks/aic-session-end.cjs`:
- Add: `const { cleanupEditedFiles } = require("../../shared/edited-files-cache.cjs");`
- Remove the `path` and `os` require lines (they become orphaned).
- Remove the two lines: `const sanitized = String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_");` and `const tempPath = path.join(os.tmpdir(), "aic-cc-edited-" + sanitized + ".json");`
- Replace the block `try { fs.unlinkSync(tempPath); } catch { // ignore }` with a single call: `cleanupEditedFiles("claude_code", sessionId);`

**Verify:** File contains no reference to "aic-cc-edited", path, or os; it does contain require of cleanupEditedFiles and the call cleanupEditedFiles("claude_code", sessionId).

### Step 2: Fix plugin aic-session-end.cjs

In `integrations/claude/plugin/scripts/aic-session-end.cjs`:
- Add: `const { cleanupEditedFiles } = require("../../../shared/edited-files-cache.cjs");`
- Remove the `path` and `os` require lines.
- Remove the two lines: `const sanitized = ...` and `const tempPath = ...`
- Replace the try/catch fs.unlinkSync block with `cleanupEditedFiles("claude_code", sessionId);`

**Verify:** Same as Step 1 for this file.

### Step 3: Fix aic-session-end.test.cjs

In `integrations/claude/__tests__/aic-session-end.test.cjs`:
- Add at top (with other requires): `const { getTempPath } = require("../../shared/edited-files-cache.cjs");`
- In `marker_and_temp_deleted_after_run`: Replace the local `tempPath("sid-del")` usage with `getTempPath("claude_code", "sid-del")`. Create the temp file at `getTempPath("claude_code", "sid-del")` and assert it does not exist after `run(...)`. Remove the local `function tempPath(sessionId) { ... }` helper entirely.
- In `prompt_log_jsonl_appended`: Change `obj.sessionId !== "s1"` to `obj.conversationId !== "s1"`. Change the error message from `Expected { sessionId: 's1', ...` to `Expected { conversationId: 's1', ...`.

**Verify:** Test file requires getTempPath from edited-files-cache; marker_and_temp uses getTempPath("claude_code", "sid-del"); prompt_log assertion uses conversationId.

### Step 4: Wire three shared tests into package.json test script

In root `package.json`, locate the "test" script. Append exactly:
` && node integrations/shared/__tests__/session-markers.test.cjs && node integrations/shared/__tests__/session-log.test.cjs && node integrations/shared/__tests__/session-model-cache.test.cjs`

**Verify:** Running `pnpm test` runs the three new commands and all pass.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero failures.

Run: `node integrations/claude/__tests__/aic-session-end.test.cjs`
Expected: "All tests passed."

## Tests

| Test case | Description |
| --------- | ----------- |
| marker_and_temp_deleted_after_run | Creates file at getTempPath("claude_code", "sid-del"), runs session-end, asserts file deleted — would fail before fix (wrong path), passes after. |
| prompt_log_jsonl_appended | Asserts last prompt-log line has conversationId, reason, timestamp — would fail before fix (sessionId), passes after. |
| Fix-verification | pnpm test and node aic-session-end.test.cjs both pass; after a real SessionEnd, aic-edited-claude_code-{sessionId}.json is deleted. |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] pnpm test passes with no failures
- [ ] Running `node integrations/claude/__tests__/aic-session-end.test.cjs` directly passes
- [ ] After a Claude SessionEnd, the file aic-edited-claude_code-{sessionId}.json in os.tmpdir() is deleted (not aic-cc-edited-{sessionId}.json)
- [ ] No new require imports except cleanupEditedFiles (and getTempPath in test)
- [ ] pnpm lint — zero errors, zero warnings
- [ ] Fix-verification test passes (marker_and_temp and prompt_log assertions would fail without the fix)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
