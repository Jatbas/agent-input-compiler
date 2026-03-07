# Task 114 (Optional): postToolUse hook for aic_compile confirmation

> **Status:** Done
> **Phase:** 1.0 — OSS Release (Cursor integration)
> **Layer:** integration (`.cursor/hooks/` CJS + `mcp/hooks/` + `mcp/src/install-cursor-hooks.ts`)
> **Depends on:** None

## Goal

Add a postToolUse hook that runs after MCP tool calls. When the tool was `aic_compile` and the call succeeded, inject a short `additional_context` confirmation (or supplementary instruction) so the model sees a brief follow-up. Cursor postToolUse input: `tool_name`, `tool_input`, `tool_output`, `tool_use_id`, `duration`. Output: `updated_mcp_tool_output`, `additional_context`.

## Architecture Notes

- Optional / low priority per user. Implement only if capacity allows.
- postToolUse with matcher "MCP": Cursor invokes the hook after each MCP tool call. We detect aic_compile by inspecting tool_input (intent, projectRoot) and optionally tool_output (success). Return `{ additional_context: "Short confirmation message." }` to append to context.
- Hook must not crash; try/catch; exit 0. If we cannot parse input or output, return {}.

## Files

| Action | Path                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| Create | `.cursor/hooks/AIC-post-compile-context.cjs`                                           |
| Create | `mcp/hooks/AIC-post-compile-context.cjs`                                               |
| Modify | `.cursor/hooks.json` (add postToolUse entry with matcher "MCP")                        |
| Modify | `mcp/src/install-cursor-hooks.ts` (DEFAULT_HOOKS postToolUse; AIC_SCRIPT_NAMES; merge) |

## Cursor postToolUse (reference)

- Input: `tool_name`, `tool_input`, `tool_output`, `tool_use_id`, `duration`
- Output: `updated_mcp_tool_output`, `additional_context`

## Config Changes

- None.

## Steps

### Step 1: Create AIC-post-compile-context.cjs

Read stdin (JSON). If tool_name is not MCP or tool_input does not look like aic_compile (intent + projectRoot), write `{}` and exit 0. If tool_output indicates success (e.g. has result content), write `JSON.stringify({ additional_context: "AIC compilation completed. Use the compiled context for your next response." })` (or similar). Else `{}`. Try/catch; exit 0.

### Step 2: Copy to mcp/hooks/

Mirror script to `mcp/hooks/AIC-post-compile-context.cjs`.

### Step 3: Register postToolUse in hooks.json and install-cursor-hooks.ts

Add postToolUse array with one entry: command for AIC-post-compile-context.cjs, matcher "MCP". Update DEFAULT_HOOKS and merge logic in install-cursor-hooks.ts; add script to AIC_SCRIPT_NAMES.

### Step 4: Final verification

`pnpm lint && pnpm typecheck` pass.

## Tests

| Test case | Description                                                                                        |
| --------- | -------------------------------------------------------------------------------------------------- |
| Manual    | After aic_compile MCP call, hook runs and returns additional_context when output indicates success |

## Acceptance Criteria

- [ ] postToolUse hook exists and is registered; runs after MCP calls
- [ ] When aic_compile succeeded, additional_context is returned
- [ ] Script never throws; exit 0 always
- [ ] Changes mirrored in mcp/hooks/ and install-cursor-hooks.ts

## Blocked?

If blocked, mark task as deferred; no circuit breaker required for optional task.
