# Task 209: Investigate hooks/plugin lock cleanup divergence

> **Status:** Pending
> **Phase:** AH — Session Lifecycle Markers Simplification
> **Layer:** integrations (Claude)
> **Depends on:** AH01 (Document session lifecycle flow per editor)

## Goal

Determine whether the plugin SessionEnd script deleting `.current-conversation-id` instead of `.session-start-lock` is intentional or a bug; document the decision; fix the plugin to match the hooks and update documentation so both deployments are consistent.

## Architecture Notes

- Integrations layer: CommonJS scripts in `integrations/claude/` use Node.js fs, path, os only.
- Decision (from exploration): Bug. `.current-conversation-id` was removed from the design in Task 187 (conversationId now from transcript_path); the plugin session-end was not updated. Both session-start scripts (hooks and plugin) create and release `.session-start-lock` in their own `finally`; SessionEnd cleanup of the lock is defensive (handles crashed SessionStart). Plugin must delete `.session-start-lock` like the hooks.
- Scope: Recommended — fix plugin script, update session-lifecycle-flow.md and edited-files-flow.md so no doc remains stale.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/plugin/scripts/aic-session-end.cjs` (third try block: unlink `.session-start-lock` instead of `.current-conversation-id`) |
| Modify | `documentation/session-lifecycle-flow.md` (SessionEnd bullet and "under investigation" → resolved decision) |
| Modify | `documentation/edited-files-flow.md` (line 36: both deployments delete `.session-start-lock`) |
| Modify | `integrations/claude/__tests__/aic-session-end.test.cjs` (add regression test for plugin session-end removing `.session-start-lock`) |

## Interface / Signature

N/A — script exports `run(stdinStr)`. No TypeScript interface. The only code change is one line: replace the path in the third `fs.unlinkSync` call in the plugin script.

## Dependent Types

None — CommonJS script, no branded types.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Verify evidence

Confirm in the codebase: (1) No file writes `.current-conversation-id` (grep for write/create of that path). (2) Both `integrations/claude/hooks/aic-session-start.cjs` and `integrations/claude/plugin/scripts/aic-session-start.cjs` use `lockPath = path.join(aicDir, ".session-start-lock")`, create it with `fs.openSync(lockPath, "wx")`, and in a `finally` block call `fs.unlinkSync(lockPath)`.

**Verify:** Grep and Read confirm no write site for `.current-conversation-id` and both session-start scripts release `.session-start-lock` in finally.

### Step 2: Update session-lifecycle-flow.md

In `documentation/session-lifecycle-flow.md`, in the Claude Code § SessionEnd bullet list: replace the line that says the plugin deletes `.current-conversation-id` instead of `.session-start-lock` with a single line stating that both deployments delete `.aic/.session-start-lock`. Remove the sentence "For integration maintainers: this divergence is unresolved; the intended behavior is under investigation." Replace it with one sentence: the divergence was a bug (plugin was not updated when `.current-conversation-id` was removed); both deployments now delete `.session-start-lock`. Update the Mermaid note if it still says "unlink .session-start-lock (hooks) or .current-conversation-id (plugin)" to "unlink .session-start-lock".

**Verify:** SessionEnd section describes a single behavior for both deployments and states the bug is resolved.

### Step 3: Fix plugin session-end

In `integrations/claude/plugin/scripts/aic-session-end.cjs`, in the third try block (after unlink of markerPath), change:

```javascript
fs.unlinkSync(path.join(projectRoot, ".aic", ".current-conversation-id"));
```

to:

```javascript
fs.unlinkSync(path.join(projectRoot, ".aic", ".session-start-lock"));
```

**Verify:** The plugin script matches the hooks script for the third unlink (same path string).

### Step 4: Update edited-files-flow.md

In `documentation/edited-files-flow.md`, at the line that says "Hooks version also deletes `.aic/.session-start-lock`; plugin version deletes `.aic/.current-conversation-id`", replace with: "Both hooks and plugin delete `.aic/.session-start-lock`."

**Verify:** Edited-files-flow.md no longer mentions plugin deleting `.current-conversation-id`.

### Step 5: Add regression test

In `integrations/claude/__tests__/aic-session-end.test.cjs`, add a test that runs the **plugin** session-end script (require from `../plugin/scripts/aic-session-end.cjs`) with a temp directory containing `.aic/.session-start-lock`. Call `run(JSON.stringify({ session_id: "s1", reason: "test", cwd: tmpDir }))`. After `run()`, assert the lock file no longer exists. Clean up the temp dir. Add a call to this test in the script’s top-level execution list so it runs with the existing tests. Name the test function `plugin_session_end_removes_session_start_lock`.

**Verify:** `node integrations/claude/__tests__/aic-session-end.test.cjs` passes and the new test name appears in the output.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| plugin_session_end_removes_session_start_lock | Plugin session-end `run()` with `.aic/.session-start-lock` present removes the file after run |
| marker_and_temp_deleted_after_run | (existing) Marker and temp edited-files path deleted after run |
| prompt_log_jsonl_appended | (existing) One JSONL line appended to prompt-log.jsonl |
| exit_0_always | (existing) run() does not throw on empty or invalid JSON |

## Acceptance Criteria

- [ ] Plugin script third unlink targets `.session-start-lock` (same as hooks)
- [ ] session-lifecycle-flow.md states both deployments delete `.session-start-lock` and divergence resolved
- [ ] edited-files-flow.md states both delete `.session-start-lock`
- [ ] Regression test `plugin_session_end_removes_session_start_lock` added and run with existing tests
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
