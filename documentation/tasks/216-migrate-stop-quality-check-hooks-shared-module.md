# Task 216: Migrate All Stop-Quality-Check Hooks to Shared Module

> **Status:** Pending
> **Phase:** AI (Edited-files cache migration)
> **Layer:** integrations
> **Depends on:** AI04 (Migrate all afterFileEdit trackers to shared module)

## Goal

Replace local temp-file read logic and inline readStdinSync/getTempPath in all stop-quality-check hooks with shared module calls so the stop hook reads the same edited-files cache the after-file-edit tracker writes. Output format remains editor-specific.

## Architecture Notes

- Refactoring only: no new interfaces or types. Modifies 3 hook files and 1 test file.
- Editor IDs must match AI04: "cursor" for Cursor, "claude_code" for Claude so stop hooks read the temp file written by the tracker.
- Shared modules (already exist): integrations/shared/read-stdin-sync.cjs (readStdinSync), integrations/shared/edited-files-cache.cjs (getTempPath, readEditedFiles, cleanupEditedFiles).
- Require paths: from integrations/cursor/hooks and integrations/claude/hooks use ../../shared/; from integrations/claude/plugin/scripts use ../../../shared/; from integrations/claude/__tests__ use ../../shared/.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/cursor/hooks/AIC-stop-quality-check.cjs` |
| Modify | `integrations/claude/hooks/aic-stop-quality-check.cjs` |
| Modify | `integrations/claude/plugin/scripts/aic-stop-quality-check.cjs` |
| Modify | `integrations/claude/__tests__/aic-stop-quality-check.test.cjs` |

## Required Shared API Usage

Each hook must require and use the following. No local readStdinSync or getTempPath; temp read is replaced by readEditedFiles(editorId, key).

**Cursor hook** — add at top (after existing requires):

```javascript
const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
const { readEditedFiles } = require("../../shared/edited-files-cache.cjs");
```

Replace the block that reads the temp file (tmpPath, fs.existsSync, fs.readFileSync, JSON.parse, paths assignment) with:

```javascript
const paths = readEditedFiles("cursor", key);
```

Keep key derivation, runEslint(paths), runTsc(), and output format (followup_message or {}).

**Claude hooks** — add at top:

```javascript
const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
const { readEditedFiles } = require("../../shared/edited-files-cache.cjs");
```

In run(), replace the temp-file read block with:

```javascript
const paths = readEditedFiles("claude_code", sessionId);
```

Keep sessionId, projectRoot, .ts/.js filter, runEslint(paths, projectRoot), runTsc(projectRoot), and output (decision/reason or "").

**Claude plugin** — same as Claude hooks but require path ../../../shared/.

**Claude test** — require and use shared cache for temp path and cleanup so the path matches the migrated hook:

```javascript
const { getTempPath, cleanupEditedFiles } = require("../../shared/edited-files-cache.cjs");
```

Replace every tempPath(sessionId) with getTempPath("claude_code", sessionId). Replace every cleanupTemp(sessionId) with cleanupEditedFiles("claude_code", sessionId). Remove the local tempPath and cleanupTemp function definitions.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Migrate Cursor stop hook

In integrations/cursor/hooks/AIC-stop-quality-check.cjs: Add require of readStdinSync from ../../shared/read-stdin-sync.cjs and readEditedFiles from ../../shared/edited-files-cache.cjs. Delete the local function readStdinSync (entire 10-line implementation). Delete the local function getTempPath (entire 5-line implementation). Replace the block that computes tmpPath, checks fs.existsSync(tmpPath), reads with fs.readFileSync(tmpPath), and assigns paths from parsed data with a single line: const paths = readEditedFiles("cursor", key). Keep the rest of the script unchanged: key derivation (conversation_id ?? conversationId ?? session_id ?? sessionId ?? AIC_CONVERSATION_ID ?? "default"), paths.filter for typeof p === "string" && fs.existsSync(p), runEslint(paths), runTsc(), and stdout write of JSON.stringify({ followup_message: msg }) or "{}".

**Verify:** File has no local readStdinSync or getTempPath; it requires both shared modules and calls readEditedFiles("cursor", key).

### Step 2: Migrate Claude hooks stop hook

In integrations/claude/hooks/aic-stop-quality-check.cjs: Add require of readStdinSync from ../../shared/read-stdin-sync.cjs and readEditedFiles from ../../shared/edited-files-cache.cjs. Delete the local readStdinSync and getTempPath functions. In the run(stdinStr) function, replace the block that sets tmpPath from getTempPath(sessionId), checks fs.existsSync(tmpPath), reads with fs.readFileSync(tmpPath), and assigns paths from parsed data with: const paths = readEditedFiles("claude_code", sessionId). Keep sessionId, projectRoot, the filter for .ts/.js and fs.existsSync(p), runEslint(paths, projectRoot), runTsc(projectRoot), and the return value (JSON.stringify({ decision: "block", reason }) or "").

**Verify:** File has no local readStdinSync or getTempPath; it requires both shared modules and uses readEditedFiles("claude_code", sessionId) inside run().

### Step 3: Migrate Claude plugin stop hook

In integrations/claude/plugin/scripts/aic-stop-quality-check.cjs: Apply the same changes as Step 2, but use require path ../../../shared/ for both read-stdin-sync.cjs and edited-files-cache.cjs (plugin/scripts is one level deeper than hooks).

**Verify:** File has no local readStdinSync or getTempPath; require paths use ../../../shared/; run() uses readEditedFiles("claude_code", sessionId).

### Step 4: Update Claude stop hook test to use shared cache

In integrations/claude/__tests__/aic-stop-quality-check.test.cjs: Add at top (with other requires) require of getTempPath and cleanupEditedFiles from ../../shared/edited-files-cache.cjs. Remove the local function tempPath(sessionId) and the local function cleanupTemp(sessionId). Every call site that used tempPath(sessionId) must now use getTempPath("claude_code", sessionId). Every call site that used cleanupTemp(sessionId) must now use cleanupEditedFiles("claude_code", sessionId). Use fs.writeFileSync(getTempPath("claude_code", sessionId), ...) where the test writes the temp file. The test file path from __tests__ to shared is ../../shared/.

**Verify:** Test file has no local tempPath or cleanupTemp; it uses getTempPath("claude_code", sessionId) and cleanupEditedFiles("claude_code", sessionId) from the shared module. All four test cases (temp_missing_exit_0, no_ts_js_files_exit_0, block_on_lint_failure, pass_when_clean) still run and pass.

### Step 5: Final verification

Run: pnpm lint && pnpm typecheck && pnpm test && pnpm knip
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| temp_missing_exit_0 | run() with no temp file returns "" |
| no_ts_js_files_exit_0 | run() with empty paths array returns "" |
| block_on_lint_failure | run() with lint-failing file returns { decision: "block", reason } |
| pass_when_clean | run() with clean file returns "" |

## Acceptance Criteria

- [ ] All four files modified per Files table
- [ ] Cursor hook uses readStdinSync and readEditedFiles from shared; no local readStdinSync or getTempPath
- [ ] Claude hooks and plugin use readStdinSync and readEditedFiles from shared; plugin uses ../../../shared/
- [ ] Claude test uses getTempPath and cleanupEditedFiles from shared with editorId "claude_code"
- [ ] All four Claude tests pass
- [ ] pnpm lint — zero errors, zero warnings
- [ ] pnpm typecheck — clean
- [ ] pnpm knip — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
