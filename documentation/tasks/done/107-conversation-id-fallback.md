# Task 107: Conversation ID fallback (our own when editor does not provide)

> **Status:** Done
> **Phase:** M (Reporting & Resources)
> **Layer:** mcp + .cursor (hooks, rules)
> **Depends on:** Conversation tracking schema + plumbing (069), Conversation tracking summary + prompt command (070)

## Goal

When Cursor does not provide a conversation ID, generate our own per-chat ID so compilations within one chat are grouped under a single ID and "show aic chat summary" returns stats for this chat only. The ID is injected into the chat's system prompt so concurrent chats each carry their own identity.

## Architecture Notes

- KL-004: conversation_id is already in compilation_log and aic_chat_summary exists; this task adds a fallback source when the editor does not supply conversation_id.
- `.aic/` security: directory must remain 0700; creating `.aic` when writing conversation-id uses `fs.mkdirSync(dir, { recursive: true, mode: 0o700 })`.
- Hooks run in editor process — use Node built-ins (fs, path, crypto.randomUUID) only; no MCP or shared scope.
- **Two-tier design for concurrent chat safety:**
  - **Tier 1 (primary, per-chat):** The `sessionStart` hook generates a UUID (or uses editor-provided session_id), writes it to `.aic/conversation-id`, and embeds it in the chat's `additional_context`. Each chat's system prompt carries its own ID. The aic_compile rule instructs the agent to pass this ID explicitly as `conversationId` in every aic_compile call. This is immune to concurrent-chat interference because each chat has its own system prompt.
  - **Tier 2 (fallback, file-based):** The `preToolUse` hook reads `.aic/conversation-id` and injects it when the agent did not include conversationId. This handles edge cases where the agent omits the field. The `aic_chat_summary` handler also reads the file when conversationId is omitted. The file may reflect the most recently started chat, which is acceptable as a best-effort fallback.
- GAP-12 in gaps.md states we do not cache conversationId. This task introduces a controlled exception: the file is overwritten on each sessionStart (not cached across chats). Update GAP-12 to note this fallback.

## Files

| Action | Path                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `.cursor/hooks/AIC-compile-context.cjs` (on sessionStart: generate UUID or use session_id, write to `.aic/conversation-id`, embed in additional_context so agent knows its own ID) |
| Modify | `.cursor/hooks/AIC-inject-conversation-id.cjs` (on preToolUse: when editor has no conversation_id, read `.aic/conversation-id` — never create; inject into aic_compile tool_input) |
| Modify | `.cursor/rules/aic-architect.mdc` (update aic_compile rule to include conversationId from system prompt; update "show aic chat summary" bullet to describe fallback)               |
| Modify | `mcp/src/schemas/conversation-summary-request.ts` (conversationId optional)                                                                                                        |
| Modify | `mcp/src/server.ts` (aic_chat_summary handler: when conversationId omitted, read from `.aic/conversation-id`; use for getConversationSummary or return zero payload)               |
| Modify | `mcp/src/__tests__/server.test.ts` (add tests: omitted conversationId with file returns summary; omitted with no file returns zero payload)                                        |

## Interface / Signature

No new interface. Existing MCP tool `aic_chat_summary` gains optional `conversationId` in request schema. Existing hook continues to output `{ decision, updated_input? }`. The sessionStart hook's `additional_context` output gains one line with the conversation ID.

## Dependent Types

| Type           | Path                                 | Purpose                                             |
| -------------- | ------------------------------------ | --------------------------------------------------- |
| ConversationId | shared/src/core/types/identifiers.ts | toConversationId(raw), getConversationSummary param |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1a: sessionStart hook — generate conversation ID, write to file, embed in system prompt

In `.cursor/hooks/AIC-compile-context.cjs`: Add `const crypto = require("crypto");` at the top (fs and path are already imported). After reading `hookInput` and resolving `sessionId`, determine the conversation ID for this chat: `const conversationId = (sessionId && typeof sessionId === "string" && sessionId.length > 0) ? sessionId : crypto.randomUUID();`. Write it to `.aic/conversation-id` (overwriting any previous value): `try { fs.mkdirSync(path.join(projectRoot, ".aic"), { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(projectRoot, ".aic", "conversation-id"), conversationId, "utf8"); } catch { /* non-fatal */ }`. Set `compileArgs.conversationId = conversationId;` (replacing the existing `if (sessionId ...)` block). In the `additional_context` array (lines 82-93), add a line after the REMINDER block: `"", "AIC_CONVERSATION_ID=" + conversationId`. This embeds the ID in the chat's system prompt so the agent can reference it in every aic_compile call.

**Verify:** Run `node -c .cursor/hooks/AIC-compile-context.cjs` — no syntax errors. Confirm the hook writes `.aic/conversation-id`, sets `compileArgs.conversationId`, and includes the ID in `additional_context`.

### Step 1b: preToolUse hook — read conversation ID from file as fallback (never create)

In `.cursor/hooks/AIC-inject-conversation-id.cjs`: When the tool is aic_compile (detect by intent + projectRoot), resolve conversationId as follows. If `input.conversation_id` is present and non-empty, use it (editor-provided ID takes priority). If the tool_input already contains `conversationId` (agent passed it explicitly from system prompt), return `{ decision: "allow" }` without overriding. Otherwise, from `toolInput.projectRoot` compute `conversationIdPath = path.join(toolInput.projectRoot, ".aic", "conversation-id")`. Try `fs.readFileSync(conversationIdPath, "utf8")`; if success and trimmed content non-empty, use that as conversationId. If file missing or unreadable, do not create it — return `{ decision: "allow" }` without injecting. If a conversationId was resolved from the file, set `updated = { ...toolInput, conversationId }` and return `{ decision: "allow", updated_input: updated }`. Add at top: `const fs = require("fs");` and `const path = require("path");`. Do NOT import crypto — this hook never generates IDs.

**Verify:** Run `node -c .cursor/hooks/AIC-inject-conversation-id.cjs` — no syntax errors. Confirm the hook never calls `writeFileSync` or `mkdirSync`. Confirm it skips injection when `toolInput.conversationId` is already present.

### Step 2: Update aic_compile rule and "show aic chat summary" in aic-architect.mdc

In `.cursor/rules/aic-architect.mdc`, in the aic_compile critical reminder bullet: change the example call from `{ "intent": "<user message summary>", "projectRoot": "/Users/jatbas/Desktop/AIC" }` to `{ "intent": "<user message summary>", "projectRoot": "/Users/jatbas/Desktop/AIC", "conversationId": "<from AIC_CONVERSATION_ID in system prompt, if available>" }`. Add a note: "If `AIC_CONVERSATION_ID=<uuid>` appears in your system prompt (injected at session start), include that value as `conversationId` in every aic_compile call."

In the "show aic chat summary" bullet: replace "When conversation ID is not available, explain that chat summary requires the editor to pass conversation ID" with wording that the agent should call `aic_chat_summary` with its `conversationId` from the system prompt. When the agent does not have a conversation ID, it may call `aic_chat_summary` without conversationId and the server will read from `.aic/conversation-id` as a fallback. Keep the rest of the bullet (reply line, table fields) unchanged.

**Verify:** Rule file contains the updated aic_compile bullet with conversationId and the updated "show aic chat summary" bullet. No contradictory instructions remain.

### Step 3: Make conversationId optional in aic_chat_summary schema

In `mcp/src/schemas/conversation-summary-request.ts`, change `conversationId: z.string().min(1)` to `conversationId: z.string().min(1).optional()`.

**Verify:** `pnpm typecheck` passes. Schema allows `{}` or `{ conversationId: "x" }`.

### Step 4: aic_chat_summary handler resolves conversationId from file when omitted

In `mcp/src/server.ts`, in the aic_chat_summary tool handler: after `const parsed = z.object(ConversationSummaryRequestSchema).parse(args)`, compute effective ID. If `parsed.conversationId` is defined and non-empty after trim, use it as `idRaw`. Otherwise set `idRaw = null`, then try `conversationIdPath = path.join(scope.projectRoot, ".aic", "conversation-id")`, `content = fs.readFileSync(conversationIdPath, "utf8")`, and if trimmed content non-empty set `idRaw` to that. Catch read errors and leave `idRaw` null. Set `idForPayload = idRaw ?? ""`. Set `conversationId = idRaw !== null ? toConversationId(idRaw) : null`. Call `getConversationSummary(conversationId)` only when `conversationId !== null`; otherwise set `summary = null`. Build payload with `conversationId: idForPayload` in the zero-payload case. Return JSON as before.

**Verify:** `pnpm typecheck` passes. Handler does not call toConversationId when idRaw is null.

### Step 5: Tests for omitted conversationId

In `mcp/src/__tests__/server.test.ts`: Add test `aic_chat_summary_omitted_conversation_id_uses_file`: create tmpDir, create `.aic` directory with `fs.mkdirSync(path.join(tmpDir, ".aic"), { recursive: true })`, write a known UUID to `path.join(tmpDir, ".aic", "conversation-id")`, call aic_compile with that same conversationId in arguments, then call aic_chat_summary with `arguments: {}`. Parse response JSON and assert `compilationsInConversation >= 1`. Add test `aic_chat_summary_omitted_conversation_id_no_file_returns_zero`: create tmpDir (no .aic/conversation-id file), createMcpServer, call aic_chat_summary with `arguments: {}`. Assert response JSON has `compilationsInConversation === 0` and `conversationId === ""`.

**Verify:** `pnpm test` for mcp/src/**tests**/server.test.ts passes both new tests.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                     | Description                                                                                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| aic_chat_summary_omitted_conversation_id_uses_file            | Omit conversationId; .aic/conversation-id exists with ID; one compilation recorded for that ID; summary returns compilationsInConversation >= 1 |
| aic_chat_summary_omitted_conversation_id_no_file_returns_zero | Omit conversationId; no .aic/conversation-id; response has compilationsInConversation 0, conversationId ""                                      |

## Acceptance Criteria

- [ ] sessionStart hook generates a new UUID per chat (or uses editor session_id), writes to .aic/conversation-id (overwriting previous), and embeds `AIC_CONVERSATION_ID=<uuid>` in the chat's additional_context system prompt.
- [ ] .aic directory created with mode 0o700 when writing conversation-id.
- [ ] preToolUse hook reads .aic/conversation-id as fallback when agent did not pass conversationId; never creates the file; skips injection when conversationId already present in tool_input.
- [ ] aic_compile rule in aic-architect.mdc instructs agent to include conversationId from AIC_CONVERSATION_ID in system prompt.
- [ ] "show aic chat summary" rule updated: agent passes conversationId from system prompt; falls back to server-side file read when omitted.
- [ ] aic_chat_summary schema accepts request without conversationId.
- [ ] aic_chat_summary handler when conversationId omitted reads .aic/conversation-id and uses it for getConversationSummary, or returns zero payload when file missing.
- [ ] Both new server tests pass.
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
