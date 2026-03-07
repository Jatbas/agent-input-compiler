# Task 112: sessionStart env improvements (AIC_PROJECT_ROOT, AIC_CONVERSATION_ID)

> **Status:** Done
> **Phase:** 1.0 — OSS Release (Cursor integration)
> **Layer:** integration (`.cursor/hooks/` CJS + `mcp/hooks/` + `mcp/src/install-cursor-hooks.ts`)
> **Depends on:** None (can be done after or with Task 109)

## Goal

Use Cursor's sessionStart output `env: { key: value }` to pass `AIC_PROJECT_ROOT` and `AIC_CONVERSATION_ID` to all subsequent hooks in the session. Update session-init and/or compile-context to return these in `env`; update downstream hooks (inject-conversation-id, require-aic-compile, etc.) to read from `process.env.AIC_PROJECT_ROOT` and `process.env.AIC_CONVERSATION_ID` instead of re-computing, and simplify logic where possible.

## Architecture Notes

- Cursor passes sessionStart output `env` to all later hook runs in the same session. So one hook that runs early (sessionInit or compile-context) can set `env: { AIC_PROJECT_ROOT: projectRoot, AIC_CONVERSATION_ID: conversationId }` and every later hook sees them.
- session-init currently only injects critical reminders as `additional_context`; it does not call aic_compile. compile-context runs aic_compile and has access to session_id from hook input. So the hook that has session_id and project root should output both `additional_context` (if any) and `env: { AIC_PROJECT_ROOT, AIC_CONVERSATION_ID }`. If sessionInit runs first and has no session_id in its input, only compile-context may have it; then compile-context is the right place to set env. Alternatively sessionStart input might provide session_id to the first hook — verify Cursor docs for sessionStart input shape. If both hooks receive session_id, session-init can set env so it's available for compile-context too.
- Downstream: AIC-inject-conversation-id.cjs currently reads `input.conversation_id` and injects into tool input. If env has AIC_CONVERSATION_ID, it can use `process.env.AIC_CONVERSATION_ID` as fallback. AIC-require-aic-compile.cjs uses generation_id and temp files; it may need project root for nothing today, but AIC_PROJECT_ROOT can be used if we ever need project-relative paths there.
- install-cursor-hooks.ts: no structural change to DEFAULT_HOOKS except if we add new scripts; this task only changes script content and possibly order (no new files in Files table for installer beyond what already exists).

## Files

| Action | Path                                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `.cursor/hooks/AIC-session-init.cjs` (output env when session_id available from input) OR `.cursor/hooks/AIC-compile-context.cjs` (output env in addition to additional_context) |
| Modify | `.cursor/hooks/AIC-inject-conversation-id.cjs` (use process.env.AIC_CONVERSATION_ID as fallback; simplify if possible)                                                           |
| Modify | `mcp/hooks/AIC-session-init.cjs` and/or `mcp/hooks/AIC-compile-context.cjs` to match                                                                                             |
| Modify | `mcp/hooks/AIC-inject-conversation-id.cjs` to match                                                                                                                              |

## Cursor sessionStart output (reference)

- `additional_context`: string (optional)
- `env`: object of string key-value pairs (optional); passed to all subsequent hooks in the session

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Determine which hook sets env

Read Cursor docs or existing hook input: does sessionStart pass session_id to the first hook (session-init) or only to compile-context? If session_id is in sessionStart input for both, session-init can output `env: { AIC_PROJECT_ROOT: process.env.CURSOR_PROJECT_DIR || process.cwd(), AIC_CONVERSATION_ID: session_id }` so it's available for compile-context and all later hooks. If only compile-context gets session_id, have compile-context output `env` in addition to `additional_context` when it writes its JSON.

**Verify:** One hook outputs both `additional_context` (if applicable) and `env` with AIC_PROJECT_ROOT and AIC_CONVERSATION_ID.

### Step 2: Update session-init or compile-context to output env

In the chosen script (.cursor/hooks):

- When building the output object, add `env: { AIC_PROJECT_ROOT: "<value>", AIC_CONVERSATION_ID: "<value>" }`. Use project root from `process.env.CURSOR_PROJECT_DIR || process.cwd()` and conversation/session id from hook input (e.g. session_id).
- If the hook currently exits without writing JSON (e.g. session-init when section not found), either write `{ env: { ... } }` so env is still set, or ensure the other hook (compile-context) always sets env.

**Verify:** Running the hook with mock input that includes session_id produces stdout with "env" and both keys.

### Step 3: Mirror to mcp/hooks/

Copy updated `.cursor/hooks/AIC-session-init.cjs` and/or `AIC-compile-context.cjs` to `mcp/hooks/` so packaged copies match.

**Verify:** mcp/hooks/ scripts match.

### Step 4: Simplify AIC-inject-conversation-id.cjs to use env

In `.cursor/hooks/AIC-inject-conversation-id.cjs`: use `process.env.AIC_CONVERSATION_ID` as fallback when `input.conversation_id` is missing. If both are available, prefer input (Cursor may pass latest). Simplify any logic that re-derives conversation id.

**Verify:** Script still injects conversationId into aic_compile tool input; when env is set it uses it as fallback.

### Step 5: Mirror inject-conversation-id to mcp/hooks/

Copy updated `.cursor/hooks/AIC-inject-conversation-id.cjs` to `mcp/hooks/AIC-inject-conversation-id.cjs`.

**Verify:** mcp/hooks version matches.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck`
Expected: all pass.

## Tests

| Test case | Description                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Manual    | Start session; in a later preToolUse hook, process.env.AIC_CONVERSATION_ID and AIC_PROJECT_ROOT are set |
| Manual    | inject-conversation-id with no conversation_id in input but env set; still injects from env             |

## Acceptance Criteria

- [ ] At least one sessionStart hook outputs `env: { AIC_PROJECT_ROOT, AIC_CONVERSATION_ID }`
- [ ] Downstream hooks can read these from process.env
- [ ] AIC-inject-conversation-id uses env as fallback
- [ ] All changes mirrored in mcp/hooks/
- [ ] `pnpm lint` and `pnpm typecheck` pass

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance
