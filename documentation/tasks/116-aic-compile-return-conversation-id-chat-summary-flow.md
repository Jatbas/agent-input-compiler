# Task 116: Return conversationId in aic_compile response and fix "show aic chat summary" flow

> **Status:** Pending
> **Phase:** Ad-hoc (MCP + rules)
> **Layer:** mcp
> **Depends on:** None

## Goal

Add `conversationId` to the aic_compile tool response so the agent learns its conversation ID on every compilation, and update the AIC-architect rule so "show aic chat summary" uses that value instead of relying on system-prompt or file fallback.

## Architecture Notes

- MCP handler remains a thin facade; response shape is handler-local (no shared type change).
- Echo `request.conversationId ?? null` in the JSON response — each chat gets its own ID from the request, no shared file, no race.
- .aic/conversation-id fallback in aic_chat_summary and session init unchanged (out of scope).

## Files

| Action | Path                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| Modify | `mcp/src/handlers/compile-handler.ts` (add conversationId to response JSON)                                       |
| Modify | `.cursor/rules/AIC-architect.mdc` (update aic_compile and "show aic chat summary" bullets)                        |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (add test for conversationId in response)                    |
| Modify | `mcp/src/__tests__/server.test.ts` (assert aic_compile response includes conversationId where response is parsed) |

## Interface / Signature

No new interface. The compile handler continues to return `CallToolResult` with content that is a JSON string. The JSON object must include:

- `compiledPrompt`: string (existing)
- `meta`: CompilationMeta (existing)
- `conversationId`: string | null (new) — the conversation ID from the request, or null when omitted

## Dependent Types

Not applicable — no new types. Response payload is an inline object in the handler.

## Config Changes

- **package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: Add conversationId to aic_compile response

In `mcp/src/handlers/compile-handler.ts`, in the success path where the handler returns the JSON payload, add `conversationId: request.conversationId ?? null` to the object passed to `JSON.stringify`. The object must have keys: `compiledPrompt`, `meta`, `conversationId`. Use the exact expression `request.conversationId ?? null` so that when the client omits conversationId the value is null.

**Verify:** Grep the file for `conversationId` and confirm it appears in the object given to `JSON.stringify`.

### Step 2: Update AIC-architect.mdc rules

In `.cursor/rules/AIC-architect.mdc`:

1. In the critical reminders section, find the bullet that describes **aic_compile**. Add a short note that the tool response now includes `conversationId` (string or null) so the agent can use it for aic_chat_summary.
2. In the Prompt Commands section, find the bullet for **"show aic chat summary"**. Change the instruction so that the agent uses the `conversationId` from its most recent aic_compile response when calling `aic_chat_summary`. When the agent has not yet called aic_compile in this conversation, it may call aic_chat_summary without conversationId and the server will use the .aic/conversation-id file fallback. Do not remove the fallback; it remains as a secondary path.

**Verify:** Read the two updated bullets and confirm they match the above.

### Step 3: Add compile-handler test for conversationId in response

In `mcp/src/handlers/__tests__/compile-handler.test.ts`, add two test cases:

1. **response_includes_conversation_id_when_provided:** Call the handler with `conversationId: "conv-echo-test"`. Parse the returned content (first text item) as JSON. Assert the parsed object has a key `conversationId` with value `"conv-echo-test"`.
2. **response_includes_conversation_id_null_when_omitted:** Call the handler without passing `conversationId`. Parse the returned content as JSON. Assert the parsed object has a key `conversationId` with value `null`.

Use the same handler setup pattern as existing tests (mockRunner, telemetryDeps, getSessionId, getEditorId, getModelId, modelIdOverride). Extract the response text from `result.content`, then `JSON.parse` and assert.

**Verify:** Run `pnpm test -- mcp/src/handlers/__tests__/compile-handler.test.ts` and confirm both new tests pass.

### Step 4: Assert aic_compile response shape in server.test.ts

In `mcp/src/__tests__/server.test.ts`, locate the test `valid_args_returns_compiled_prompt` (it calls aic_compile and checks the result). After parsing the tool response JSON, add an assertion that the parsed object has the key `conversationId`. When the test does not pass conversationId in the arguments, assert that `parsed.conversationId === null`.

**Verify:** Run `pnpm test -- mcp/src/__tests__/server.test.ts` and confirm the test still passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                           | Description                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| response_includes_conversation_id_when_provided     | Handler returns JSON with conversationId equal to request value when passed    |
| response_includes_conversation_id_null_when_omitted | Handler returns JSON with conversationId null when not passed                  |
| valid_args_returns_compiled_prompt (updated)        | Server aic_compile response includes conversationId key (null when not passed) |

## Acceptance Criteria

- [ ] conversationId added to aic_compile JSON response in compile-handler.ts
- [ ] AIC-architect.mdc aic_compile bullet notes response includes conversationId
- [ ] AIC-architect.mdc "show aic chat summary" instructs use of conversationId from latest aic_compile response
- [ ] Two new compile-handler tests pass; server.test aic_compile assertion added
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No change to .aic/conversation-id fallback or session init hook

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
