# Task 001: Claude Code conversation_id integration fix and PreToolUse hook

> **Status:** Pending
> **Phase:** Integration (Claude Code)
> **Layer:** integration
> **Depends on:** None
> **Research:** documentation/research/2026-03-17-claude-code-conversation-id-api-and-integration-alignment.md

## Goal

Align Claude Code hooks with the single source of truth for attribution (conversation_id only; never session_id). Implement correct conversationId passing in SessionStart and UserPromptSubmit (and plugin mirrors), fix invariants injection to use conversationId only when present, update Cursor doc table, and optionally add a PreToolUse hook to inject conversationId/editorId into aic_compile MCP calls.

## Architecture Notes

- Same source of truth as Cursor: conversation_id only for attribution. Session_id is used only for temp file and marker keys (session-scoped).
- Claude Code API does not provide conversation_id in hook input today; when absent, pass null — do not use session_id as fallback.
- PreToolUse updatedInput is documented for MCP tools (code.claude.com/docs); we do not derive conversationId from transcript_path unless Anthropic documents it.
- All changes in integrations/claude/ and documentation/; no shared/ or mcp/ code changes.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/hooks/aic-session-start.cjs` |
| Modify | `integrations/claude/hooks/aic-prompt-compile.cjs` |
| Modify | `integrations/claude/plugin/scripts/aic-session-start.cjs` |
| Modify | `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` |
| Modify | `documentation/cursor-integration-layer.md` |
| Modify | `integrations/claude/__tests__/aic-session-start.test.cjs` |
| Modify | `integrations/claude/__tests__/aic-prompt-compile.test.cjs` |
| Modify | `integrations/claude/__tests__/aic-compile-helper.test.cjs` |
| Create (optional) | `integrations/claude/hooks/aic-inject-conversation-id.cjs` |
| Modify (optional) | `integrations/claude/settings.json.template` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: SessionStart — pass conversationId to callAicCompile

In `integrations/claude/hooks/aic-session-start.cjs`: Read `conversationId` from parsed input (`parsed.conversation_id ?? parsed.input?.conversation_id ?? null`). Pass `conversationId` as the third argument to `callAicCompile` (not sessionId). Keep writing the marker file with `sessionId` (session-scoped). Keep all other behavior (projectRoot, intent string, marker path).

**Verify:** Run existing aic-session-start tests; add or adjust test that asserts third arg to callAicCompile is conversationId when present and null when absent.

### Step 2: UserPromptSubmit — AIC_CONVERSATION_ID only when conversationId truthy

In `integrations/claude/hooks/aic-prompt-compile.cjs`: In the invariants block header, emit `AIC_CONVERSATION_ID=<value>` only when `conversationId` is truthy. Remove use of sessionId for that line (currently `sessionId ? "\nAIC_CONVERSATION_ID=" + sessionId : ""` → use `conversationId` instead).

**Verify:** Tests: when conversationId is null, compiled output must not contain an AIC_CONVERSATION_ID line in the invariants block; when conversationId is set, it must.

### Step 3: Plugin mirrors — SessionStart and UserPromptSubmit

Apply the same logic in `integrations/claude/plugin/scripts/aic-session-start.cjs` and `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` as in Steps 1 and 2 (conversationId to callAicCompile in session-start; AIC_CONVERSATION_ID only when conversationId in prompt-compile).

**Verify:** Plugin scripts mirror hooks; no separate test run required if hook tests pass and plugin files are kept in sync.

### Step 4: Cursor doc — input field mapping table

In `documentation/cursor-integration-layer.md` section 4.3 (Input field mapping): Change the row that says `input.session_id` → conversationId for aic_compile (sessionStart hook) to `input.conversation_id` → conversationId for aic_compile (sessionStart hook and preToolUse). Ensure no other row implies session_id is used for attribution.

**Verify:** Grep for session_id in that table; attribution row uses conversation_id only.

### Step 5 (optional): PreToolUse hook for aic_compile

Create `integrations/claude/hooks/aic-inject-conversation-id.cjs`: Read stdin JSON (common input: session_id, transcript_path, cwd; tool_name, tool_input). If tool is aic_compile (tool_name includes aic_compile or tool_input has intent and projectRoot), build updatedInput = { ...tool_input, editorId: "claude-code" }; if we have a conversationId (from input or stored), add conversationId to updatedInput. Do not derive conversationId from transcript_path. Return stdout JSON: `hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput }`. For non-aic_compile, return allow with no updatedInput. Add PreToolUse entry in `integrations/claude/settings.json.template` with matcher matching MCP aic_compile (e.g. `mcp__.*__aic_compile`).

**Verify:** Manual or test: PreToolUse receives MCP tool call, returns allow + updatedInput with editorId and conversationId when available.

### Step 6: Tests

- In `integrations/claude/__tests__/aic-session-start.test.cjs`: Add or update test so that when stdin has conversation_id, callAicCompile is called with that value as third arg; when stdin has no conversation_id, third arg is null. Use a spy or mock that captures the third argument.
- In `integrations/claude/__tests__/aic-prompt-compile.test.cjs`: Add test that when conversationId is null, output does not include AIC_CONVERSATION_ID in the invariants section; when conversationId is set, it does.
- In `integrations/claude/__tests__/aic-compile-helper.test.cjs`: Rename test conversationId_forwarded_when_sessionId_provided to conversationId_forwarded_when_provided; keep assertion that third param is forwarded to MCP arguments.

**Verify:** `node integrations/claude/__tests__/aic-session-start.test.cjs` and same for aic-prompt-compile and aic-compile-helper pass.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| session_start_passes_conversationId_when_in_input | SessionStart calls callAicCompile with conversation_id from input as third arg |
| session_start_passes_null_when_no_conversation_id | SessionStart calls callAicCompile with null when input has no conversation_id |
| prompt_compile_no_AIC_CONVERSATION_ID_when_conversationId_null | Invariants block does not contain AIC_CONVERSATION_ID when conversationId is null |
| prompt_compile_includes_AIC_CONVERSATION_ID_when_conversationId_truthy | Invariants block contains AIC_CONVERSATION_ID=<value> when conversationId is set |
| conversationId_forwarded_when_provided | compile-helper forwards third param to MCP tools/call arguments |

## Acceptance Criteria

- [ ] SessionStart (hooks + plugin) passes conversationId from input to callAicCompile; never sessionId for attribution.
- [ ] UserPromptSubmit (hooks + plugin) injects AIC_CONVERSATION_ID only when conversationId is truthy.
- [ ] Cursor doc 4.3 table uses conversation_id (not session_id) for sessionStart/compile attribution.
- [ ] All listed tests pass.
- [ ] `pnpm lint` — zero errors, zero warnings.
- [ ] `pnpm typecheck` — clean.
- [ ] `pnpm knip` — no new unused files, exports, or dependencies.
- [ ] Optional: PreToolUse hook created and registered if scope includes it.

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work, stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
