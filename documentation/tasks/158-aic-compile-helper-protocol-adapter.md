# Task 158: aic-compile-helper.cjs protocol adapter

> **Status:** Pending
> **Phase:** T (Claude Code Hook-Based Delivery)
> **Layer:** integrations
> **Depends on:** —

## Goal

Create the shared protocol adapter in `integrations/claude/hooks/aic-compile-helper.cjs` that calls the AIC MCP server via stdio JSON-RPC and returns the compiled prompt string (or null on error), so T02–T05 hooks can invoke it without duplicating protocol logic.

## Architecture Notes

- Clean-layer: all Claude Code source lives in `integrations/claude/`; no changes to `mcp/src/` or `shared/`.
- Port the JSON-RPC pattern from `integrations/cursor/hooks/AIC-compile-context.cjs` (initialize, notifications/initialized, tools/call aic_compile); add four-arg signature with sessionId and conversationId forwarding per CC §9.
- Use `child_process.execFileSync` (not execSync) per T01 spec; local dev when `mcp/src/server.ts` exists use `npx tsx` that path, else `npx @jatbas/aic`.
- On spawn failure, timeout, or parse error return null — callers must handle; never throw.

## Files

| Action | Path                                                                    |
| ------ | ----------------------------------------------------------------------- |
| Create | `integrations/claude/hooks/aic-compile-helper.cjs`                     |
| Create | `integrations/claude/__tests__/aic-compile-helper.test.cjs`            |

## Interface / Signature

No core interface. Single exported function:

```javascript
function callAicCompile(intent, projectRoot, sessionId, timeoutMs) {}
// Returns string (compiled prompt) or null. sessionId forwarded as conversationId when truthy. timeoutMs default 25000.
```

Implementation must use the exact parameter names and return type above. Export via `module.exports = { callAicCompile };`.

## Dependent Types

Not applicable — integration script; plain strings and null only. No branded types or core interfaces.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Implement aic-compile-helper.cjs

Create directory `integrations/claude/hooks/` and file `integrations/claude/hooks/aic-compile-helper.cjs`.

- Require: `child_process` (use `execFileSync`), `fs` (use `existsSync`), `path` (use `join`).
- Implement `callAicCompile(intent, projectRoot, sessionId, timeoutMs)`:
  - Resolve server: `const serverPath = path.join(projectRoot, "mcp", "src", "server.ts");` If `fs.existsSync(serverPath)` then `args = ["tsx", serverPath]`, else `args = ["@jatbas/aic"]`. Command: `execFileSync("npx", args, { cwd: projectRoot, timeout: timeoutMs || 25000, encoding: "utf-8", input: stdinPayload, stdio: ["pipe", "pipe", "pipe"] })`.
  - Build stdin payload: three newline-terminated JSON-RPC messages: (1) `{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "AIC-claude-hook", version: "0.1.0" } } }`, (2) `{ jsonrpc: "2.0", method: "notifications/initialized" }`, (3) `{ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "aic_compile", arguments: { intent, projectRoot, ...(sessionId ? { conversationId: sessionId } : {}) } } }`. Stringify each with `JSON.stringify`, join with `"\n"`, append final `"\n"`.
  - Wrap spawn and parse in try/catch; on any throw return null.
  - Parse stdout: `raw.split("\n")`, filter empty lines. For each line, `JSON.parse(line)`. When `msg.id === 2` and `msg.result` and `msg.result.content`, find content item with `type === "text"`, then `parsed = JSON.parse(textContent.text)`, if `parsed.compiledPrompt` return it. After loop, return null.
- Export: `module.exports = { callAicCompile };`.
- Include SPDX license and short comment that this is the Claude Code protocol adapter.

**Verify:** File exists; `node -e "const { callAicCompile } = require('./integrations/claude/hooks/aic-compile-helper.cjs'); console.log(typeof callAicCompile)"` from repo root prints `function`.

### Step 2: Add tests

Create `integrations/claude/__tests__/aic-compile-helper.test.cjs`.

- **happy_path_returns_compiled_prompt:** Create a small mock MCP server script that writes one line to stdout: `{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"{\"compiledPrompt\":\"mock prompt\"}"}]}}`. In the test, stub `require("child_process").execFileSync` so that when the helper calls it, the stub runs that mock script with the payload the helper would send on stdin and returns the mock's stdout. Require the helper after the stub is in place; call `callAicCompile("intent", "/tmp/dummy", null, 5000)`. Assert return value is the string `"mock prompt"`.
- **conversationId_forwarded_when_sessionId_provided:** Use a mock script that reads stdin, finds the tools/call line, parses it and records `params.arguments`. Stub execFileSync to run this mock. Call `callAicCompile("intent", "/tmp/dummy", "session-123", 5000)`. Assert the recorded arguments include `conversationId: "session-123"`.
- **returns_null_on_parse_error:** Stub execFileSync to return invalid JSON or a line without `result.content`. Call the helper; assert return value is null.

Run tests with Node: `node integrations/claude/__tests__/aic-compile-helper.test.cjs`.

**Verify:** All three test cases pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                  | Description                                                |
| ------------------------------------------ | ---------------------------------------------------------- |
| happy_path_returns_compiled_prompt         | Mock MCP returns fixed compiledPrompt; assert string.     |
| conversationId_forwarded_when_sessionId_provided | Mock records tools/call args; assert conversationId set.   |
| returns_null_on_parse_error                | Mock returns bad/incomplete JSON; assert null.            |

## Acceptance Criteria

- [ ] integrations/claude/hooks/aic-compile-helper.cjs created with callAicCompile and correct signature
- [ ] conversationId included in aic_compile arguments when sessionId is truthy
- [ ] All three test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] On spawn/timeout/parse error the function returns null (no throw)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
