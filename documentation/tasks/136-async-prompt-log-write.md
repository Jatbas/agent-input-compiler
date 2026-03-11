# Task 136: Async prompt log write in compile handler

> **Status:** Pending
> **Phase:** X (Hot-Path I/O Elimination)
> **Layer:** mcp
> **Depends on:** —

## Goal

Replace the synchronous prompt-log write in the compile handler with an async write so the call no longer blocks the event loop, eliminating one blocking I/O per compilation.

## Architecture Notes

- Phase X (mvp-progress): hot-path I/O elimination; change is in MCP handler only.
- Write remains non-fatal (existing try/catch); semantics unchanged.
- No new dependencies; `fs.promises` is the same `node:fs` module already imported.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/handlers/compile-handler.ts` (sync → async write) |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (add test for last-compiled-prompt.txt) |

## Modification specification

In `compile-handler.ts`, replace the synchronous write with the async write inside the existing try/catch. Handler is already async; await the write so errors are still caught and non-fatal.

**Before (lines 157–161):**

```typescript
try {
  fs.writeFileSync(lastPromptPath, result.compiledPrompt, "utf8");
} catch {
  // Non-fatal — do not fail the request
}
```

**After:**

```typescript
try {
  await fs.promises.writeFile(lastPromptPath, result.compiledPrompt, "utf8");
} catch {
  // Non-fatal — do not fail the request
}
```

Leave the `lastPromptPath` construction (path.join) unchanged. No other edits in this file.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Async write in compile handler

In `mcp/src/handlers/compile-handler.ts`, replace the try block that writes the prompt log (the block that currently calls `fs.writeFileSync(lastPromptPath, result.compiledPrompt, "utf8")`) with the async version: call `await fs.promises.writeFile(lastPromptPath, result.compiledPrompt, "utf8")` inside the same try/catch. Keep the catch block empty (non-fatal; do not fail the request).

**Verify:** Grep for `writeFileSync` in `mcp/src/handlers/compile-handler.ts` returns 0 matches. Grep for `fs.promises.writeFile` returns 1 match.

### Step 2: Test that last-compiled-prompt.txt is written

In `mcp/src/handlers/__tests__/compile-handler.test.ts`, add a test that after a successful compile with a temp project root, the file `.aic/last-compiled-prompt.txt` exists and its content equals the compiled prompt. Use the existing pattern: `fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"))` for tmpDir, `makeDeps()` and `makeSuccessRunner("expected prompt content")`, call the handler, then assert `fs.existsSync(path.join(tmpDir, ".aic", "last-compiled-prompt.txt"))` is true and `fs.readFileSync(path.join(tmpDir, ".aic", "last-compiled-prompt.txt"), "utf8")` equals the same prompt string passed to `makeSuccessRunner`. Name the test `prompt_log_written_after_successful_compile`. Clean up tmpDir in a finally block with `fs.rmSync(tmpDir, { recursive: true, force: true })`.

**Verify:** `pnpm test mcp/src/handlers/__tests__/compile-handler.test.ts` passes and the new test appears in the output.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| prompt_log_written_after_successful_compile | After successful compile, `.aic/last-compiled-prompt.txt` exists and content equals compiled prompt |
| compile_timeout_rejects_after_30s | Existing: timeout still rejects after 30s |
| response_includes_conversation_id_when_provided | Existing: conversationId in response when provided |
| response_includes_conversation_id_null_when_omitted | Existing: conversationId null when omitted |
| compile_handler_disabled_returns_message_no_db_writes | Existing: disabled config returns message, no runner call |
| auto_init_creates_config_and_aic_dir_when_project_has_no_config | Existing: auto-init creates config and .aic dir |

## Acceptance Criteria

- [ ] compile-handler.ts uses `await fs.promises.writeFile` for the prompt log; no `writeFileSync` for that path
- [ ] New test prompt_log_written_after_successful_compile passes
- [ ] All existing compile-handler tests pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
