# Task 111: Cursor stop hook (quality check) + afterFileEdit tracker

> **Status:** Done
> **Phase:** 1.0 — OSS Release (Cursor integration)
> **Layer:** integration (`.cursor/hooks/` CJS + `mcp/hooks/` + `mcp/src/install-cursor-hooks.ts`)
> **Depends on:** None

## Goal

Implement the stop quality-check hook and the afterFileEdit tracker that mvp-progress.md marks as "Done" but for which no script files exist. The afterFileEdit tracker records edited file paths to a temp file keyed by conversation/session so the stop hook can run ESLint and TypeScript type-check on those files; if errors are found, the stop hook returns `followup_message` to auto-submit a message asking the agent to fix them (Cursor stop hook supports `followup_message` and `loop_limit`).

## Architecture Notes

- Cursor `afterFileEdit`: input includes file path(s) or edit metadata; output is optional. Use it only to record paths. Write to a temp file per conversation (e.g. `os.tmpdir()/aic-edited-files-<conversation_id>.json` or fallback to a session-scoped name if conversation_id not available). Append or replace list of edited paths; keep format simple (one path per line or JSON array).
- Cursor `stop`: input includes `status` (completed | aborted | error), `loop_count`. Output: `followup_message` (optional) — if present, Cursor auto-submits that as the next user message. Use `loop_limit` in hooks.json (e.g. 5 or null for unlimited) to allow iterative fix loops.
- Stop hook script: read the temp file of edited paths for this conversation (or from env AIC_CONVERSATION_ID / session_id). If no paths, return {} (no followup). If paths exist, run `npx eslint --max-warnings 0 <paths>` and `npx tsc --noEmit` (or only on files that are TypeScript/JS if scoping is needed). If either command fails (non-zero exit), return `{ followup_message: "..." }` with a short instruction to fix lint/type errors on the edited files. Use `execSync`; capture stderr; include a one-line summary in followup_message. If both pass, return {}.
- Hook scripts must not crash: wrap all logic in try/catch; on error return {} or allow; exit 0.
- All scripts CJS; mirror in `mcp/hooks/` and update `install-cursor-hooks.ts` (DEFAULT_HOOKS + AIC_SCRIPT_NAMES + merge for afterFileEdit and stop).

## Files

| Action | Path                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `.cursor/hooks/AIC-after-file-edit-tracker.cjs`                                                                                                                               |
| Create | `.cursor/hooks/AIC-stop-quality-check.cjs`                                                                                                                                    |
| Create | `mcp/hooks/AIC-after-file-edit-tracker.cjs`                                                                                                                                   |
| Create | `mcp/hooks/AIC-stop-quality-check.cjs`                                                                                                                                        |
| Modify | `.cursor/hooks.json` (add afterFileEdit entry for tracker; add stop entry with loop_limit)                                                                                    |
| Modify | `mcp/src/install-cursor-hooks.ts` (DEFAULT_HOOKS: afterFileEdit with tracker command, stop with quality-check command and loop_limit; AIC_SCRIPT_NAMES; merge logic for stop) |

## Cursor hook contracts (reference)

- **afterFileEdit:** Input: edit metadata (e.g. file paths). Output: optional; we use for side effect only (write temp file).
- **stop:** Input: `status`, `loop_count`. Output: `followup_message` (optional). Config: `loop_limit` (number or null).

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create AIC-after-file-edit-tracker.cjs

Create `.cursor/hooks/AIC-after-file-edit-tracker.cjs` that:

- Reads JSON from stdin. Extract conversation_id or session_id from input (Cursor may provide one of these); fallback to a fixed key if missing (e.g. "default"). Extract list of edited file paths from input (consult Cursor docs for exact field names — e.g. `files`, `paths`, or from a single edit event).
- Temp file path: `path.join(os.tmpdir(), "aic-edited-files-" + (conversationId || sessionId || "default") + ".json")`. Write a JSON array of absolute paths (deduplicated). Overwrite on each invocation so the file always reflects the latest cumulative list, or append and dedupe — decide one approach and document. Use try/catch; exit 0.
- No stdout required for afterFileEdit if Cursor does not use it; otherwise output `{}`.

**Verify:** Script runs without throwing; temp file created/updated with path list when given valid input.

### Step 2: Create AIC-stop-quality-check.cjs

Create `.cursor/hooks/AIC-stop-quality-check.cjs` that:

- Reads JSON from stdin (`status`, `loop_count`, and any conversation/session id Cursor provides).
- Resolve edited-files temp file path using same convention as tracker (conversation_id or session_id from input or env AIC_CONVERSATION_ID).
- If temp file missing or empty array, write `{}` to stdout and exit 0.
- Read list of paths from temp file. Filter to existing files (fs.existsSync). If no paths left, write `{}` and exit 0.
- Run `npx eslint --max-warnings 0 -- <paths>` with paths as args. Capture exit code and stderr. Then run `npx tsc --noEmit` (project-level typecheck; if project has no tsconfig, skip tsc or run with --skipLibCheck). Capture exit code and stderr.
- If eslint or tsc failed: build a short followup_message string (e.g. "Fix lint and type errors on the files you edited. Run pnpm lint and pnpm typecheck.") and write `JSON.stringify({ followup_message: "..." })` to stdout. Else write `{}`.
- All in try/catch; on any throw write `{}` and exit 0.

**Verify:** With temp file containing one path that has a lint error, script returns JSON with followup_message. With clean files, returns {}.

### Step 3: Copy both scripts to mcp/hooks/

Copy `.cursor/hooks/AIC-after-file-edit-tracker.cjs` and `.cursor/hooks/AIC-stop-quality-check.cjs` to `mcp/hooks/`.

**Verify:** Both files exist in mcp/hooks/ and match source.

### Step 4: Register afterFileEdit and stop in .cursor/hooks.json

In `.cursor/hooks.json`:

- Set `afterFileEdit` to `[{ "command": "node .cursor/hooks/AIC-after-file-edit-tracker.cjs" }]` (replace empty array).
- Add `"stop": [{ "command": "node .cursor/hooks/AIC-stop-quality-check.cjs", "loop_limit": 5 }]` (or loop_limit per project preference; use 5 for iterative fix rounds).

**Verify:** hooks.json has afterFileEdit with one entry and stop with one entry including loop_limit.

### Step 5: Update install-cursor-hooks.ts

- Add both script names to `AIC_SCRIPT_NAMES`.
- In `DEFAULT_HOOKS.hooks`: set `afterFileEdit` to the tracker command; add `stop` with quality-check command and `loop_limit: 5` (or null if unlimited).
- In merge logic: merge `afterFileEdit` with mergeHookArray so AIC tracker is appended if missing; add `stop` merge and include `stop` in merged write. Extend parsed type to include `stop?: readonly (HookEntry & { loop_limit?: number | null })[]`.

**Verify:** `pnpm typecheck` passes. New installs get afterFileEdit and stop; existing installs get them merged.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck`
Expected: all pass.

## Tests

| Test case | Description                                                                   |
| --------- | ----------------------------------------------------------------------------- |
| Manual    | afterFileEdit: send input with one file path; temp file contains that path    |
| Manual    | stop: temp file with paths that have lint errors; stdout has followup_message |
| Manual    | stop: temp file with clean paths; stdout is {}                                |

## Acceptance Criteria

- [ ] AIC-after-file-edit-tracker.cjs and AIC-stop-quality-check.cjs exist in `.cursor/hooks/` and `mcp/hooks/`
- [ ] afterFileEdit records edited paths to temp file keyed by conversation/session
- [ ] stop runs eslint and tsc on those paths; returns followup_message when errors found
- [ ] hooks.json and DEFAULT_HOOKS include afterFileEdit and stop; installer merges both
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] Scripts never throw; exit 0 always

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance
