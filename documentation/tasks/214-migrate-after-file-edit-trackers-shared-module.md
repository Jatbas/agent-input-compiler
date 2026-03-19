# Task 214: Migrate all afterFileEdit trackers to shared module

> **Status:** Pending
> **Phase:** AI (Edited-Files Temp Cache Simplification)
> **Layer:** integrations
> **Depends on:** AI02 (readStdinSync), AI03 (edited-files-cache)

## Goal

Replace local temp path/read/write logic in all three afterFileEdit tracker scripts (Cursor, Claude hooks, Claude plugin) with shared module calls; path extraction and key derivation remain editor-specific; require readStdinSync and writeEditedFiles from integrations/shared.

## Architecture Notes

- ADR/hexagonal: integrations layer only; no core/pipeline changes. All I/O via existing shared CommonJS modules.
- Reuse: read-stdin-sync.cjs (readStdinSync), edited-files-cache.cjs (writeEditedFiles; test uses getTempPath, cleanupEditedFiles). Editor IDs: "cursor" for Cursor, "claude_code" for Claude Code.
- Require paths: cursor/hooks and claude/hooks use ../../shared/; claude/plugin/scripts use ../../../shared/; test (integrations/claude/__tests__/) uses ../../shared/.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs` (require shared modules; remove inline readStdinSync and temp logic; use writeEditedFiles("cursor", key, newPaths)) |
| Modify | `integrations/claude/hooks/aic-after-file-edit-tracker.cjs` (require shared modules; remove inline readStdinSync and temp logic; use writeEditedFiles("claude_code", sessionId, [resolved])) |
| Modify | `integrations/claude/plugin/scripts/aic-after-file-edit-tracker.cjs` (same as Claude hooks; require from ../../../shared/) |
| Modify | `integrations/claude/__tests__/aic-after-file-edit-tracker.test.cjs` (require getTempPath, cleanupEditedFiles from ../../shared/edited-files-cache.cjs; replace local tempPath/cleanupTemp with shared API) |

## Interface / Signature

Shared API consumed (no new interface; existing modules):

```javascript
// read-stdin-sync.cjs
const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
// readStdinSync() → string

// edited-files-cache.cjs
const { writeEditedFiles } = require("../../shared/edited-files-cache.cjs");
// writeEditedFiles(editorId, key, paths) → void
```

Tracker behavior (script entry points):

- **Cursor** (`AIC-after-file-edit-tracker.cjs`): Parse stdin JSON; key = input.conversation_id ?? input.conversationId ?? input.session_id ?? input.sessionId ?? process.env.AIC_CONVERSATION_ID ?? "default"; newPaths = extractPaths(input); writeEditedFiles("cursor", key, newPaths); process.stdout.write("{}"); process.exit(0).
- **Claude** (`aic-after-file-edit-tracker.cjs` hooks + plugin): run(stdinStr) parses input; sessionId = input.session_id ?? input.input?.session_id ?? "default"; pathValue = input.tool_input?.path ?? input.input?.tool_input?.path ?? ""; if no path return "{}"; else writeEditedFiles("claude_code", sessionId, [path.resolve(pathValue)]); return "{}". When run as main: readStdinSync(), process.stdout.write(run(raw)), process.exit(0).

## Dependent Types

None — CommonJS scripts; no TypeScript types. Editor IDs and keys are plain strings.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Migrate Cursor AIC-after-file-edit-tracker.cjs

In `integrations/cursor/hooks/AIC-after-file-edit-tracker.cjs`: Add at top (after the existing const fs/path/os block) require for readStdinSync from `../../shared/read-stdin-sync.cjs` and writeEditedFiles from `../../shared/edited-files-cache.cjs`. Remove the inline readStdinSync function (lines 11–20). Keep extractPaths and the key derivation (input.conversation_id ?? … ?? "default"). Replace the block that builds tmpPath, reads existing, merges, and writes (lines 55–70) with a single call: writeEditedFiles("cursor", key, newPaths). Keep the try/catch that writes "{}" to stdout and process.exit(0). Remove any now-unused requires (fs, os) if they are only used for the temp file; keep path for extractPaths (path.resolve). Ensure newPaths are still produced by extractPaths (which returns path.resolve'd strings).

**Verify:** File has no inline readStdinSync; no inline temp path or fs.readFileSync/fs.writeFileSync for the edited-files cache; writeEditedFiles("cursor", key, newPaths) is called.

### Step 2: Migrate Claude hooks aic-after-file-edit-tracker.cjs

In `integrations/claude/hooks/aic-after-file-edit-tracker.cjs`: Add require for readStdinSync from `../../shared/read-stdin-sync.cjs` and writeEditedFiles from `../../shared/edited-files-cache.cjs`. Remove the inline readStdinSync function. In run(stdinStr), keep sessionId and pathValue extraction. Remove the local sanitized/tmpPath and the block that reads existing, merges, and writes. When pathValue is valid, call writeEditedFiles("claude_code", sessionId, [path.resolve(pathValue)]). Remove unused requires (fs, os) if only used for temp; keep path for path.resolve.

**Verify:** No inline readStdinSync; no inline temp path or fs read/write for cache; writeEditedFiles("claude_code", sessionId, [resolved]) is called.

### Step 3: Migrate Claude plugin aic-after-file-edit-tracker.cjs

Apply the same logic as Step 2 to `integrations/claude/plugin/scripts/aic-after-file-edit-tracker.cjs`, but use require path `../../../shared/read-stdin-sync.cjs` and `../../../shared/edited-files-cache.cjs` (three levels up from plugin/scripts to integrations, then shared).

**Verify:** Same as Step 2; require paths use ../../../shared/.

### Step 4: Update Claude test to use shared edited-files-cache

In `integrations/claude/__tests__/aic-after-file-edit-tracker.test.cjs`: Add require for getTempPath and cleanupEditedFiles from `../../shared/edited-files-cache.cjs`. Replace the local tempPath(sessionId) implementation with: return getTempPath("claude_code", sessionId). Replace cleanupTemp(sessionId) with: cleanupEditedFiles("claude_code", sessionId). Remove the local sanitize logic and any fs.unlinkSync for the temp file; the shared cleanupEditedFiles handles it. Update the session_id_sanitized assertion message that references "aic-cc-edited-s4_with_slash.json" to reference the shared path format (aic-edited-claude_code-<sanitized_key>.json). Keep all five test cases (temp_file_created_on_first_invocation, temp_file_appended_avoid_duplicate, output_empty_json, missing_path_no_op, session_id_sanitized) and their assertions on content array and output.

**Verify:** Test file requires ../../shared/edited-files-cache.cjs; tempPath and cleanupTemp use getTempPath("claude_code", sessionId) and cleanupEditedFiles("claude_code", sessionId); all five tests still run and pass.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| temp_file_created_on_first_invocation | First run creates temp file with single path; content is JSON array with path.resolve'd path |
| temp_file_appended_avoid_duplicate | Two runs with same path yield one entry; third run with different path yields two entries |
| output_empty_json | run() returns "{}" when path is provided |
| missing_path_no_op | run() returns "{}" and does not create temp file when path is missing |
| session_id_sanitized | Session ID with slash is sanitized in temp path; file is created and contains resolved path |

## Acceptance Criteria

- [ ] All four files modified per Files table
- [ ] Cursor tracker uses readStdinSync and writeEditedFiles from shared; no inline temp logic
- [ ] Both Claude trackers use readStdinSync and writeEditedFiles from shared; plugin uses ../../../shared/
- [ ] Claude test uses getTempPath and cleanupEditedFiles from shared with editorId "claude_code"
- [ ] All five test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
