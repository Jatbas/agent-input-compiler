# Task 192: Integrations set triggerSource for compilation_log

> **Status:** Pending
> **Phase:** 1.0 (OSS Release)
> **Layer:** integrations (cursor + claude)
> **Depends on:** Phase T (Claude hooks), Phase CL (Cursor hooks), MCP aic_compile triggerSource (Done)

## Goal

Ensure Cursor and Claude integration hooks pass `triggerSource` when calling `aic_compile` so that `compilation_log.trigger_source` is set correctly (such as `session_start`, `subagent_start`, `prompt_submit`). Today the column exists and the MCP handler accepts it, but no hook sets it.

## Architecture Notes

- MCP tool `aic_compile` already accepts optional `triggerSource` (mcp/src/schemas/compilation-request.ts); handler defaults to `tool_gate` when omitted (mcp/src/handlers/compile-handler.ts).
- Core/pipeline/storage are unchanged; only integration-layer scripts are modified.
- Claude: single helper `callAicCompile` used by all hooks; add optional 5th parameter and include in MCP arguments when provided. Plugin scripts in `integrations/claude/plugin/scripts/` must stay in sync with `integrations/claude/hooks/` (mirror pattern per Phase T).
- Cursor: only session start knows its context; add `triggerSource: "session_start"` to compileArgs in AIC-compile-context.cjs. Cursor preToolUse does not expose a subagent signal (cursor-integration-layer.md); AIC-inject-conversation-id.cjs is unchanged for triggerSource until Cursor provides one.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `integrations/claude/hooks/aic-compile-helper.cjs` (add optional triggerSource param, include in arguments) |
| Modify | `integrations/claude/plugin/scripts/aic-compile-helper.cjs` (same as above) |
| Modify | `integrations/claude/hooks/aic-subagent-inject.cjs` (pass triggerSource "subagent_start") |
| Modify | `integrations/claude/plugin/scripts/aic-subagent-inject.cjs` (same) |
| Modify | `integrations/claude/hooks/aic-session-start.cjs` (pass triggerSource "session_start") |
| Modify | `integrations/claude/plugin/scripts/aic-session-start.cjs` (same) |
| Modify | `integrations/claude/hooks/aic-prompt-compile.cjs` (pass triggerSource "prompt_submit") |
| Modify | `integrations/claude/plugin/scripts/aic-prompt-compile.cjs` (same) |
| Modify | `integrations/cursor/hooks/AIC-compile-context.cjs` (add triggerSource: "session_start" to compileArgs) |
| Modify | `integrations/claude/__tests__/aic-compile-helper.test.cjs` (add test: triggerSource forwarded when provided) |

## Interface / Signature

No new TypeScript interface. Contract is the MCP tool arguments shape:

- `triggerSource` (optional): one of `"session_start"`, `"prompt_submit"`, `"tool_gate"`, `"subagent_start"`, `"cli"`, `"model_initiated"`, `"internal_test"`.

Helper signature change (CJS):

```javascript
// Before
function callAicCompile(intent, projectRoot, conversationId, timeoutMs) {

// After
function callAicCompile(intent, projectRoot, conversationId, timeoutMs, triggerSource) {
```

In the `arguments` object passed to `tools/call`, add `triggerSource` only when the 5th argument is truthy: `...(triggerSource ? { triggerSource } : {})`.

## Dependent Types

None (string literals matching MCP schema enum).

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Extend callAicCompile with optional triggerSource (hooks + plugin)

In `integrations/claude/hooks/aic-compile-helper.cjs`: change the function signature to `callAicCompile(intent, projectRoot, conversationId, timeoutMs, triggerSource)`. In the `params.arguments` object built for `tools/call`, add triggerSource when provided: spread `...(triggerSource ? { triggerSource } : {})` after the existing `...(conversationId ? { conversationId } : {})`.

Apply the same change to `integrations/claude/plugin/scripts/aic-compile-helper.cjs` (identical logic).

**Verify:** Grep both files for `triggerSource`; the arguments object must include the conditional spread.

### Step 2: Pass triggerSource from Claude SubagentStart, SessionStart, UserPromptSubmit (hooks + plugin)

In `integrations/claude/hooks/aic-subagent-inject.cjs`: change the call from `callAicCompile(intent, projectRoot, conversationId, 30000)` to `callAicCompile(intent, projectRoot, conversationId, 30000, "subagent_start")`.

In `integrations/claude/hooks/aic-session-start.cjs`: change the call to `callAicCompile(..., 30000, "session_start")` (add 5th argument).

In `integrations/claude/hooks/aic-prompt-compile.cjs`: change the call to `callAicCompile(intent, projectRoot, conversationId, 30000, "prompt_submit")`.

Apply the same three changes to the plugin mirrors: `integrations/claude/plugin/scripts/aic-subagent-inject.cjs`, `aic-session-start.cjs`, `aic-prompt-compile.cjs`. Do not change aic-pre-compact.cjs (no triggerSource — remains default tool_gate).

**Verify:** Grep each modified file for the new 5th argument; subagent/session/prompt must pass the correct string.

### Step 3: Add triggerSource to Cursor session-start compileArgs

In `integrations/cursor/hooks/AIC-compile-context.cjs`: add `triggerSource: "session_start"` to the `compileArgs` object (alongside intent, projectRoot, editorId, and optional conversationId).

**Verify:** Grep AIC-compile-context.cjs for triggerSource; value must be "session_start".

### Step 4: Add test and run verification

In `integrations/claude/__tests__/aic-compile-helper.test.cjs`: add a test that uses the mock that records MCP args (same pattern as conversationId_forwarded_when_provided). Call `callAicCompile("intent", tmpDir, null, 10000, "subagent_start")`, read the recorded args file, and assert `arguments.triggerSource === "subagent_start"`. Name the test `triggerSource_forwarded_when_provided`.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`. Ensure all pass.

**Verify:** New test passes; existing helper tests still pass (4-arg calls unchanged).

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| triggerSource_forwarded_when_provided | callAicCompile with 5th arg "subagent_start"; recorded MCP arguments include triggerSource |
| conversationId_forwarded_when_provided | (existing) still passes with 4 args |
| happy_path_returns_compiled_prompt | (existing) still passes with 4 args |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] Claude helper (hooks + plugin) accepts optional 5th param and includes it in MCP arguments when provided
- [ ] Claude subagent, session-start, prompt-compile hooks (hooks + plugin) pass correct triggerSource
- [ ] Cursor AIC-compile-context.cjs includes triggerSource: "session_start"
- [ ] New test triggerSource_forwarded_when_provided passes
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass including integrations/claude
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No changes to core, pipeline, storage, or MCP handler (only integrations)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
