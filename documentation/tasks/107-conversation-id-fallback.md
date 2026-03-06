# Task 107: Conversation ID fallback (our own when editor does not provide)

> **Status:** Pending
> **Phase:** M (Reporting & Resources)
> **Layer:** mcp + .cursor (hooks, rules)
> **Depends on:** Conversation tracking schema + plumbing (069), Conversation tracking summary + prompt command (070)

## Goal

When Cursor does not provide a conversation ID, generate our own per-chat ID in `.aic/conversation-id` so compilations within one chat are grouped under a single ID and "show aic chat summary" returns stats for this chat only.

## Architecture Notes

- KL-004: conversation_id is already in compilation_log and aic_chat_summary exists; this task adds a fallback source when the editor does not supply conversation_id.
- `.aic/` security: directory must remain 0700; creating `.aic` when writing conversation-id uses `fs.mkdirSync(dir, { recursive: true, mode: 0o700 })`.
- Hooks run in editor process — use Node built-ins (fs, path, crypto.randomUUID) only; no MCP or shared scope.
- **Per-chat lifecycle:** The `sessionStart` hook generates and writes the conversation ID (overwriting the previous value). The `preToolUse` hook only reads the file. This ensures each new Cursor chat gets a fresh ID. Concurrent chats in the same project share the last-written ID — an acceptable trade-off given Cursor provides no native conversation identity.
- aic_chat_summary accepts optional conversationId; when omitted, server reads from `.aic/conversation-id` so the agent can call the tool without knowing the ID.
- GAP-12 in gaps.md states we do not cache conversationId. This task introduces a controlled exception: the file is overwritten on each sessionStart (not cached across chats). Update GAP-12 to note this fallback.

## Files

| Action | Path                                                                                                                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `.cursor/hooks/AIC-compile-context.cjs` (on sessionStart: generate UUID, write to `.aic/conversation-id`, use as conversationId for session-start compilation)                                              |
| Modify | `.cursor/hooks/AIC-inject-conversation-id.cjs` (on preToolUse: when editor has no conversation_id, read `.aic/conversation-id` — never create; inject into aic_compile tool_input)                          |
| Modify | `mcp/src/schemas/conversation-summary-request.ts` (conversationId optional)                                                                                                                                 |
| Modify | `mcp/src/server.ts` (aic_chat_summary handler: when conversationId omitted, read from `.aic/conversation-id`; use for getConversationSummary or return zero payload)                                        |
| Modify | `.cursor/rules/aic-architect.mdc` (update "show aic chat summary" bullet: when conversation ID not from editor, use project `.aic/conversation-id`; agent may call aic_chat_summary without conversationId) |
| Modify | `mcp/src/__tests__/server.test.ts` (add tests: omitted conversationId with file returns summary; omitted with no file returns zero payload)                                                                 |

## Interface / Signature

No new interface. Existing MCP tool `aic_chat_summary` gains optional `conversationId` in request schema. Existing hook continues to output `{ decision, updated_input? }`.

## Dependent Types

| Type           | Path                                 | Purpose                                             |
| -------------- | ------------------------------------ | --------------------------------------------------- |
| ConversationId | shared/src/core/types/identifiers.ts | toConversationId(raw), getConversationSummary param |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1a: sessionStart hook — generate and write conversation ID per chat

In `.cursor/hooks/AIC-compile-context.cjs`: After resolving `projectRoot` and before building `compileArgs`, generate a conversation ID for this chat. Add `const crypto = require("crypto");` at the top (fs and path are already imported). Compute `const conversationIdPath = path.join(projectRoot, ".aic", "conversation-id");` and `const generatedConversationId = crypto.randomUUID();`. Write the ID to file: `try { fs.mkdirSync(path.join(projectRoot, ".aic"), { recursive: true, mode: 0o700 }); fs.writeFileSync(conversationIdPath, generatedConversationId, "utf8"); } catch { /* non-fatal */ }`. Replace the existing `if (sessionId ...)` block: instead of only using `hookInput.session_id`, always set `compileArgs.conversationId = sessionId && typeof sessionId === "string" && sessionId.length > 0 ? sessionId : generatedConversationId;`. This ensures the session-start compilation gets a conversationId regardless of whether Cursor provides session_id, and the file is written for subsequent preToolUse reads.

**Verify:** Run `node -c .cursor/hooks/AIC-compile-context.cjs` — no syntax errors. Review that the hook writes `.aic/conversation-id` before calling aic_compile, and uses `sessionId` when available, falling back to the generated UUID.

### Step 1b: preToolUse hook — read conversation ID from file (never create)

In `.cursor/hooks/AIC-inject-conversation-id.cjs`: When the tool is aic_compile (detect by intent + projectRoot), resolve conversationId as follows. If `input.conversation_id` is present and non-empty, use it (editor-provided ID takes priority). Otherwise, from `toolInput.projectRoot` compute `conversationIdPath = path.join(toolInput.projectRoot, ".aic", "conversation-id")`. Try `fs.readFileSync(conversationIdPath, "utf8")`; if success and trimmed content non-empty, use that as conversationId. If file missing or unreadable, do not create it — return `{ decision: "allow" }` without injecting. If a conversationId was resolved, set `updated = { ...toolInput, conversationId }` and return `{ decision: "allow", updated_input: updated }`. Add at top: `const fs = require("fs");` and `const path = require("path");`. Do NOT import crypto — this hook never generates IDs.

**Verify:** Run `node -c .cursor/hooks/AIC-inject-conversation-id.cjs` — no syntax errors. Confirm the hook never calls `writeFileSync` or `mkdirSync`.

### Step 2: Make conversationId optional in aic_chat_summary schema

In `mcp/src/schemas/conversation-summary-request.ts`, change `conversationId: z.string().min(1)` to `conversationId: z.string().min(1).optional()`.

**Verify:** `pnpm typecheck` passes. Schema allows `{}` or `{ conversationId: "x" }`.

### Step 3: aic_chat_summary handler resolves conversationId from file when omitted

In `mcp/src/server.ts`, in the aic_chat_summary tool handler: after `const parsed = z.object(ConversationSummaryRequestSchema).parse(args)`, compute effective ID. If `parsed.conversationId` is defined and non-empty after trim, use it as `idRaw`. Otherwise set `idRaw = null`, then try `conversationIdPath = path.join(scope.projectRoot, ".aic", "conversation-id")`, `content = fs.readFileSync(conversationIdPath, "utf8")`, and if trimmed content non-empty set `idRaw` to that. Catch read errors and leave `idRaw` null. Set `idForPayload = idRaw ?? ""`. Set `conversationId = idRaw !== null ? toConversationId(idRaw) : null`. Call `getConversationSummary(conversationId)` only when `conversationId !== null`; otherwise set `summary = null`. Build payload with `conversationId: idForPayload` in the zero-payload case. Return JSON as before.

**Verify:** `pnpm typecheck` passes. Handler does not call toConversationId when idRaw is null.

### Step 4: Update "show aic chat summary" in aic-architect.mdc

In `.cursor/rules/aic-architect.mdc`, in the "show aic chat summary" bullet: replace "When conversation ID is not available, explain that chat summary requires the editor to pass conversation ID" with wording that when the editor does not provide conversation ID, the project uses `.aic/conversation-id` (created on first aic_compile in this chat); the agent may call `aic_chat_summary` without conversationId and the server will use that file. Keep the rest of the bullet (reply line, table fields) unchanged.

**Verify:** Rule file contains the updated bullet and no contradictory instruction.

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

- [ ] sessionStart hook generates a new UUID per chat and writes to .aic/conversation-id (overwriting previous).
- [ ] .aic directory created with mode 0o700 when writing conversation-id.
- [ ] preToolUse hook reads .aic/conversation-id and injects for aic_compile; never creates the file.
- [ ] aic_chat_summary schema accepts request without conversationId.
- [ ] aic_chat_summary handler when conversationId omitted reads .aic/conversation-id and uses it for getConversationSummary, or returns zero payload when file missing.
- [ ] Rule "show aic chat summary" updated to describe fallback; agent may call aic_chat_summary without conversationId.
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
