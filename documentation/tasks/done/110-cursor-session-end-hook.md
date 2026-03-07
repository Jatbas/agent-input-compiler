# Task 110: Add Cursor sessionEnd hook

> **Status:** Done
> **Phase:** 1.0 — OSS Release (Cursor integration)
> **Layer:** integration (`.cursor/hooks/` CJS + `mcp/hooks/` + `mcp/src/install-cursor-hooks.ts`)
> **Depends on:** None

## Goal

Add a sessionEnd hook that runs when the Cursor session ends (completed, aborted, error, window_close, user_close). The hook cleans up AIC temp files (`aic-gate-*`, `aic-prompt-*` in `os.tmpdir()`) and optionally appends a session metrics line to `.aic/session-log.jsonl`. Primary source: cursor.com/docs/agent/hooks — sessionEnd is fire-and-forget, input includes `session_id`, `reason`, `duration_ms`, etc.; no output fields.

## Architecture Notes

- Cursor exposes `sessionEnd`; AIC docs previously showed "—" for Cursor session end. This task implements the hook.
- sessionEnd is fire-and-forget: the script can write logs or cleanup; Cursor does not use stdout. Hook must not throw — exit 0 always.
- Temp file pattern: same prefix as in `AIC-require-aic-compile.cjs` and `AIC-before-submit-prewarm.cjs` (`aic-gate-*`, `aic-prompt-*`). Use `fs.readdirSync(os.tmpdir())` and unlink matching files; catch errors and continue.
- Optional session log: if `.aic` exists and is writable, append one JSON line to `.aic/session-log.jsonl` with `session_id`, `reason`, `duration_ms`, `timestamp` (ISO). Use `Date.now()` for timestamp in this integration script (allowed per user constraint).
- All hook scripts are CJS; use `require("fs")`, `require("path")`, `require("os")`.

## Files

| Action | Path                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `.cursor/hooks/AIC-session-end.cjs`                                                                                                    |
| Create | `mcp/hooks/AIC-session-end.cjs`                                                                                                        |
| Modify | `.cursor/hooks.json` (add `sessionEnd` array with one entry for this script)                                                           |
| Modify | `mcp/src/install-cursor-hooks.ts` (add sessionEnd to DEFAULT_HOOKS; add script to AIC_SCRIPT_NAMES; extend merge logic for sessionEnd) |

## Cursor sessionEnd input (reference)

- `session_id`, `reason` (completed | aborted | error | window_close | user_close), `duration_ms`, `is_background_agent`, `final_status`, `error_message`. No output fields.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create AIC-session-end.cjs in .cursor/hooks/

Create `.cursor/hooks/AIC-session-end.cjs` that:

- Reads stdin (JSON) for `session_id`, `reason`, `duration_ms` (and optionally `error_message`).
- Cleans up temp files: list files in `os.tmpdir()` matching `aic-gate-*` and `aic-prompt-*`, unlink each. Wrap in try/catch so one failure does not stop the rest; ignore errors.
- Optionally: resolve `projectRoot` (e.g. from `process.env.CURSOR_PROJECT_DIR` or `process.cwd()`), then `.aic/session-log.jsonl`. If `.aic` exists and is writable, append one JSON line: `{ "session_id", "reason", "duration_ms", "timestamp": "<ISO>" }\n`. Use `fs.appendFileSync`; catch and ignore errors.
- Exits 0 always; does not write to stdout (sessionEnd has no output).

**Verify:** Script exists; running it with valid JSON on stdin exits 0; temp files in os.tmpdir() matching the prefixes are removed when present.

### Step 2: Copy AIC-session-end.cjs to mcp/hooks/

Copy `.cursor/hooks/AIC-session-end.cjs` to `mcp/hooks/AIC-session-end.cjs`.

**Verify:** `mcp/hooks/AIC-session-end.cjs` exists and content matches.

### Step 3: Register sessionEnd in .cursor/hooks.json

In `.cursor/hooks.json`, add `"sessionEnd": [{ "command": "node .cursor/hooks/AIC-session-end.cjs" }]` under `hooks`. Preserve existing hook keys and order if desired.

**Verify:** `hooks.sessionEnd` is an array with one entry.

### Step 4: Update install-cursor-hooks.ts

In `mcp/src/install-cursor-hooks.ts`:

- Add `AIC-session-end.cjs` to `AIC_SCRIPT_NAMES`.
- Add `sessionEnd: [{ command: "node .cursor/hooks/AIC-session-end.cjs" }]` to `DEFAULT_HOOKS.hooks`.
- In the merge branch (when hooks.json exists), add handling for `sessionEnd`: merge with `mergeHookArray(parsed.hooks?.sessionEnd ?? [], DEFAULT_HOOKS.hooks.sessionEnd)` and include `sessionEnd` in the merged object written to disk.
- Extend the parsed type to include `sessionEnd?: readonly HookEntry[]`.

**Verify:** `pnpm typecheck` passes. New installs get sessionEnd in hooks.json; existing installs get sessionEnd merged in.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck`
Expected: all pass.

## Tests

| Test case | Description                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| Manual    | Run script with stdin `{"session_id":"x","reason":"completed","duration_ms":1000}`; exit 0; temp files cleaned if any exist |
| Manual    | With .aic present, run script; session-log.jsonl has one new line                                                           |

## Acceptance Criteria

- [ ] AIC-session-end.cjs exists in `.cursor/hooks/` and `mcp/hooks/`
- [ ] Temp files `aic-gate-*` and `aic-prompt-*` in os.tmpdir() are deleted by the script
- [ ] Optional session log append to `.aic/session-log.jsonl` when .aic exists and writable
- [ ] hooks.json and DEFAULT_HOOKS include sessionEnd; installer merges sessionEnd
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] Script never throws; always exits 0

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance
