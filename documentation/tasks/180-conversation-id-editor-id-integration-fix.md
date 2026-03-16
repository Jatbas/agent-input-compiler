# Task 180: Conversation-scoped conversation_id and editorId in integrations

> **Status:** Pending
> **Phase:** Post-MVP (maintenance)
> **Layer:** integrations (Cursor + Claude Code)
> **Depends on:** None

## Goal

Fix compilation_log wrong attribution and editor_id: (1) use only conversation-scoped ids for conversationId (never session_id); (2) Cursor preToolUse injects editorId "cursor" for aic_compile so server records correct editor. Supports multi-chat and any editor; all changes in integration layer only.

## Architecture Notes

- conversation_id is per-chat ("show aic chat summary"); session_id can span multiple chats. Using session_id as conversationId wrongly attributes compilations across conversations.
- Cursor: conversationId from input.conversation_id ?? input.conversationId ?? process.env.AIC_CONVERSATION_ID only; inject editorId: "cursor" for aic_compile. Session-init and compile-context emit/set conversation id only when conversation-scoped id is available.
- Claude Code: callAicCompile receives conversationId (conversation-scoped only); callers pass conversation_id when present, never session_id as conversationId.
- No AIC core changes; MCP server already accepts optional conversationId and editorId.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/cursor/hooks/AIC-inject-conversation-id.cjs` (conversation-scoped conversationId only; add editorId for aic_compile) |
| Modify | `integrations/cursor/hooks/AIC-session-init.cjs` (AIC_CONVERSATION_ID only when conversation_id in hook input) |
| Modify | `integrations/cursor/hooks/AIC-compile-context.cjs` (do not set conversationId from sessionId; only when conversation-scoped id available) |
| Modify | `integrations/claude/hooks/aic-compile-helper.cjs` (conversationId param; pass in aic_compile args only when truthy) |
| Modify | `integrations/claude/plugin/scripts/aic-compile-helper.cjs` (same as above) |
| Modify | `integrations/claude/hooks/aic-prompt-compile.cjs` (pass conversation_id to callAicCompile when present, else null) |
| Modify | `integrations/claude/hooks/aic-subagent-inject.cjs` (pass conversation_id to callAicCompile when present, else null) |
| Modify | `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` (same as aic-prompt-compile) |
| Modify | `integrations/claude/plugin/scripts/aic-subagent-inject.cjs` (same as aic-subagent-inject) |

## Change Specification

### Cursor: AIC-inject-conversation-id.cjs

- Resolve conversationId from: `input.conversation_id ?? input.conversationId ?? process.env.AIC_CONVERSATION_ID`. Do not use input.session_id or input.sessionId.
- Normalize: trim string; if result is empty or not a string, treat as null and return `{ permission: "allow" }` without updated_input.
- When injecting for aic_compile (isAicCompile true) and idStr is non-null: set updated_input to `{ ...toolInput, conversationId: idStr, editorId: "cursor" }`.
- When injecting for aic_chat_summary: set updated_input to `{ ...toolInput, conversationId: idStr }` (no editorId).

### Cursor: AIC-session-init.cjs

- Read conversation_id from hookInput when present (use `hookInput.conversation_id`).
- Emit the line `AIC_CONVERSATION_ID=${id}` in additional_context only when the id is conversation-scoped. If the hook provides only session_id and no conversation_id, do not add the AIC_CONVERSATION_ID line (leave it out so no wrong attribution).

### Cursor: AIC-compile-context.cjs

- Do not set compileArgs.conversationId from sessionId. Set compileArgs.conversationId only when a conversation-scoped id is available in hook input (use hookInput.conversation_id when present). If only session_id is available, omit conversationId from compileArgs.
- Keep editorId: "cursor" and the rest of the script unchanged.

### Claude Code: aic-compile-helper.cjs (hooks + plugin)

- Rename the third parameter from sessionId to conversationId. Pass conversationId into the aic_compile arguments only when truthy: `...(conversationId ? { conversationId } : {})`.
- Callers must pass a conversation-scoped id (conversation_id from hook input) when available; pass null when only session_id is available so we do not attribute to the wrong conversation.

### Claude Code: callers (aic-prompt-compile, aic-subagent-inject, plugin mirrors)

- Resolve conversationId for callAicCompile from parsed input: use conversation_id when present (parsed.conversation_id ?? parsed.input?.conversation_id ?? null). Do not pass session_id as the conversationId argument.
- Call callAicCompile(intent, projectRoot, conversationId, timeoutMs) with that value.

## Config Changes

- **package.json:** No change
- **eslint.config.mjs:** No change

## Steps

### Step 1: Cursor AIC-inject-conversation-id.cjs

In the preToolUse handler, set conversationId from `input.conversation_id ?? input.conversationId ?? process.env.AIC_CONVERSATION_ID` only. Compute idStr by trimming and rejecting empty string. When idStr is null, write `{ permission: "allow" }` and return. When the tool is aic_compile and idStr is non-null, set updated to `{ ...toolInput, conversationId: idStr, editorId: "cursor" }`. When the tool is aic_chat_summary and idStr is non-null, set updated to `{ ...toolInput, conversationId: idStr }`. Write `{ permission: "allow", updated_input: updated }` when updated is set.

**Verify:** Grep for session_id and sessionId in the file; neither appears in the conversationId resolution. Grep for editorId; it is set to "cursor" only for aic_compile path.

### Step 2: Cursor AIC-session-init.cjs

Use conversation-scoped id for AIC_CONVERSATION_ID: set `const conversationId = hookInput.conversation_id || ""`. Emit the line `AIC_CONVERSATION_ID=${conversationId}` only when conversationId is non-empty. Do not use hookInput.session_id for this line.

**Verify:** Grep for session_id; it is not used to build the AIC_CONVERSATION_ID line. Grep for conversation_id; it is the source for that line when present.

### Step 3: Cursor AIC-compile-context.cjs

Set compileArgs.conversationId only when a conversation-scoped id is available. For example use `const conversationId = hookInput.conversation_id || null` and `if (conversationId && typeof conversationId === "string" && conversationId.trim().length > 0) { compileArgs.conversationId = conversationId.trim(); }`. Remove the block that sets conversationId from sessionId. Update the comment at the top to state that conversationId is set only when conversation-scoped id is present.

**Verify:** Grep for sessionId; it is not used to set compileArgs.conversationId. compileArgs.conversationId is set only from conversation_id or equivalent.

### Step 4: Claude Code aic-compile-helper.cjs (hooks)

Rename the third parameter from sessionId to conversationId. In the tools/call arguments, use `...(conversationId ? { conversationId } : {})`. Add a short comment that conversationId must be conversation-scoped (not session_id) for correct chat summary attribution.

**Verify:** Parameter name is conversationId; it is passed to aic_compile only when truthy.

### Step 5: Claude Code aic-compile-helper.cjs (plugin)

Apply the same changes as Step 4 to `integrations/claude/plugin/scripts/aic-compile-helper.cjs`.

**Verify:** Same as Step 4 for the plugin script.

### Step 6: Claude Code callers pass conversation-scoped id only

In aic-prompt-compile.cjs and aic-subagent-inject.cjs (and their plugin mirrors), compute the value passed to callAicCompile as conversation_id when available: `const conversationId = parsed.conversation_id ?? parsed.input?.conversation_id ?? null`. Do not pass session_id as this argument. Call `callAicCompile(intent, projectRoot, conversationId, timeoutMs)`.

**Verify:** Grep for callAicCompile; the third argument is derived from conversation_id (or null), not from session_id.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| conversationId_conversation_scoped_only | Cursor inject hook and Claude compile-helper use only conversation-scoped id for conversationId; session_id never used as conversationId |
| editorId_injected_for_aic_compile | Cursor inject hook adds editorId: "cursor" when updating aic_compile input |

## Acceptance Criteria

- [ ] All modified files updated per Files table and Change Specification
- [ ] No use of session_id or sessionId as conversationId in any integration hook
- [ ] Cursor preToolUse injects editorId: "cursor" for aic_compile when injecting conversationId
- [ ] Cursor session-init and compile-context use conversation-scoped id only for AIC_CONVERSATION_ID / compileArgs.conversationId
- [ ] Claude Code compile-helper accepts conversationId and passes it only when truthy; callers pass conversation_id when present, else null
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
