# Task 109: Align preToolUse hooks to Cursor official schema + failClosed

> **Status:** Done
> **Phase:** 1.0 — OSS Release (Cursor integration)
> **Layer:** integration (`.cursor/hooks/` CJS + `mcp/hooks/` + `mcp/src/install-cursor-hooks.ts`)
> **Depends on:** None

## Goal

Align AIC's preToolUse hook scripts to Cursor's official output schema (`permission`, `user_message`, `agent_message`, `updated_input`) and add `failClosed: true` to the require-aic-compile entry so tool use is blocked if the hook crashes. Primary source: cursor.com/docs/agent/hooks.

## Architecture Notes

- Cursor's preToolUse output schema uses `permission` (not `decision`), `user_message`, `agent_message`, `updated_input`. The word "decision" does not appear in official docs; AIC currently uses non-standard fields that may be accepted as an undocumented alias.
- `AIC-block-no-verify.cjs` already uses the correct schema; `AIC-require-aic-compile.cjs` and `AIC-inject-conversation-id.cjs` must be updated to match.
- Hook scripts must never crash the session; on parse errors they exit 0 and allow (fail-open) except where `failClosed: true` is set — then Cursor blocks the action on hook crash/timeout/invalid JSON.
- All changes to `.cursor/hooks/*.cjs` must be mirrored in `mcp/hooks/` and the default shape in `mcp/src/install-cursor-hooks.ts` must include any new hook entry options (e.g. `failClosed`).

## Files

| Action | Path                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `.cursor/hooks/AIC-require-aic-compile.cjs`                                                                                                                                   |
| Modify | `.cursor/hooks/AIC-inject-conversation-id.cjs`                                                                                                                                |
| Modify | `.cursor/hooks.json` (add `failClosed: true` to require-aic-compile preToolUse entry)                                                                                         |
| Modify | `mcp/hooks/AIC-require-aic-compile.cjs`                                                                                                                                       |
| Modify | `mcp/hooks/AIC-inject-conversation-id.cjs`                                                                                                                                    |
| Modify | `mcp/src/install-cursor-hooks.ts` (DEFAULT_HOOKS: add `failClosed: true` to require-aic-compile preToolUse entry; extend HookEntry type if needed for `failClosed?: boolean`) |

## Cursor preToolUse output schema (official)

- **Allow:** `{ permission: "allow" }` or `{ permission: "allow", updated_input: <object> }`
- **Deny:** `{ permission: "deny", user_message?: string, agent_message?: string }`
- No `decision` or `reason` — use `permission` and `agent_message` (and optional `user_message`).

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Update AIC-require-aic-compile.cjs output to official schema

In `.cursor/hooks/AIC-require-aic-compile.cjs`:

- Replace every `decision: "allow"` with `permission: "allow"`.
- Replace every `decision: "deny"` with `permission: "deny"`.
- Replace `reason: "..."` with `agent_message: "..."` and add `user_message` if the docs require a user-facing message (use the same or a shorter string for `user_message` so the user sees why the tool was blocked).
- Keep the deny message content identical; only the field names change.

**Verify:** Grep the file for `decision` and `reason` — zero matches.

### Step 2: Mirror require-aic-compile changes to mcp/hooks/

Copy the updated content of `.cursor/hooks/AIC-require-aic-compile.cjs` to `mcp/hooks/AIC-require-aic-compile.cjs` (or apply the same edits).

**Verify:** `mcp/hooks/AIC-require-aic-compile.cjs` uses only `permission`, `agent_message`, `user_message`.

### Step 3: Update AIC-inject-conversation-id.cjs output to official schema

In `.cursor/hooks/AIC-inject-conversation-id.cjs`:

- Replace `decision: "allow"` with `permission: "allow"`.
- Keep `updated_input: updated` (correct field name per Cursor docs).

**Verify:** Grep the file for `decision` — zero matches.

### Step 4: Mirror inject-conversation-id changes to mcp/hooks/

Copy the updated content of `.cursor/hooks/AIC-inject-conversation-id.cjs` to `mcp/hooks/AIC-inject-conversation-id.cjs`.

**Verify:** `mcp/hooks/AIC-inject-conversation-id.cjs` uses only `permission` and `updated_input`.

### Step 5: Add failClosed to require-aic-compile in hooks.json

In `.cursor/hooks.json`, in `hooks.preToolUse`, find the entry whose command includes `AIC-require-aic-compile.cjs` and add `"failClosed": true` to that entry.

**Verify:** The entry reads `"command": "node .cursor/hooks/AIC-require-aic-compile.cjs"` and has `"failClosed": true`.

### Step 6: Update install-cursor-hooks.ts default shape

In `mcp/src/install-cursor-hooks.ts`, in `DEFAULT_HOOKS.hooks.preToolUse`, add `failClosed: true` to the first entry (require-aic-compile). Ensure the type for hook entries allows `failClosed?: boolean` if needed (extend the type used for merge/write).

**Verify:** `DEFAULT_HOOKS.hooks.preToolUse[0]` includes `failClosed: true`. When hooks.json is created from scratch, the written file contains `failClosed` for the require-aic-compile entry.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck`
Expected: all pass.

## Tests

| Test case | Description                                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Manual    | Run require-aic-compile.cjs with stdin that denies; stdout must be JSON with `permission`, `agent_message` (no `decision`/`reason`) |
| Manual    | Run inject-conversation-id.cjs with valid aic_compile input; stdout must be JSON with `permission`, `updated_input` (no `decision`) |

## Acceptance Criteria

- [ ] All modified files updated per Files table
- [ ] preToolUse hooks use only `permission`, `user_message`, `agent_message`, `updated_input`
- [ ] `.cursor/hooks.json` and DEFAULT_HOOKS in install-cursor-hooks.ts set `failClosed: true` for require-aic-compile
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] No `decision` or `reason` in any preToolUse hook script

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance
