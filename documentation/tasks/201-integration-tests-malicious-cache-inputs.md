# Task 201: Integration tests for malicious cache inputs

> **Status:** Pending
> **Phase:** AE (Cache File Security Validation)
> **Layer:** test (mcp + integrations)
> **Depends on:** AE03 (Strict field validation on cache reads; sanitise cache values before pipeline use)

## Goal

Add integration tests that verify malicious or malformed `.aic/session-models.jsonl` inputs are silently rejected at every read and sanitise boundary: server compile-handler and Claude Code aic-compile-helper. No new production code; tests only.

## Architecture Notes

- AE02/AE03: per-field validation at cache read (isValidModelId, isValidConversationId, isValidEditorId) and server-side SanitisedCacheIdsSchema.safeParse. AE04 asserts these boundaries via integration tests.
- General-purpose recipe: test infrastructure only; closest recipe benchmark (test pattern borrowed); no gold data or fixture repos in test/benchmarks/.
- Two files modified: server handler test (full path: cache file → readSessionModelCache → resolveAndCacheModelId → safeParse → request) and Claude helper test (cache file → readSessionModelCache in helper → args passed to MCP). Cursor hook read path (AIC-subagent-compile) covered indirectly by server tests; inject hook only writes cache.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (add describe "malicious cache inputs" and six test cases) |
| Modify | `integrations/claude/__tests__/aic-compile-helper.test.cjs` (add malicious-cache test cases) |

## Interface / Signature

No new production code. Behaviour under test:

- **Server:** `createCompileHandler` → returned `handler(args)`. With `projectRoot` pointing at a temp dir containing `.aic/session-models.jsonl` with malicious lines, the handler reads the cache via `readSessionModelCache(projectRoot, conversationId, editorId)` and passes resolved values through `SanitisedCacheIdsSchema.safeParse`. Tests assert the `CompilationRequest` passed to the mock runner has `modelId`, `conversationId`, and `editorId` safe (null or within schema: modelId ≤256 printable ASCII, conversationId ≤128 printable ASCII, editorId one of cursor/cursor-claude-code/claude-code/generic).
- **Claude helper:** `callAicCompile(intent, projectRoot, conversationId, timeout)` with `projectRoot` pointing at a temp dir containing `.aic/session-models.jsonl` with malicious lines. Helper reads cache before calling MCP. Tests use mock MCP that records the tool arguments; assert recorded `modelId`/`conversationId`/`editorId` do not contain overlong strings or control characters.

## Dependent Types

Tests only; no new types. Assertions use:

- **Tier 1:** `CompilationRequest` — `mcp` handler test captures the request passed to `runner.run()`; assert `modelId`, `conversationId`, `editorId`. Path: `@jatbas/aic-core/core/types/compilation-types.js`.
- **Tier 2:** `toAbsolutePath` (path), `EDITOR_ID` (enum) — existing imports in compile-handler.test.ts.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Server tests — malicious cache inputs (compile-handler.test.ts)

In `mcp/src/handlers/__tests__/compile-handler.test.ts`, add a new `describe("malicious cache inputs", () => { ... })` block. For each test: create a temp dir with `fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"))`; create `.aic` with `fs.mkdirSync(path.join(tmpDir, ".aic"), { recursive: true, mode: 0o700 })`; write one or more lines to `path.join(tmpDir, ".aic", "session-models.jsonl")` using `fs.writeFileSync` with the malicious content; build `getScope` so that `getScope(projectRoot)` returns `mockScopeForHandler(mockClock, mockIdGenerator, toAbsolutePath(tmpDir))` (scope must use the same tmpDir as projectRoot so the handler reads from that cache file); build a mock runner that captures the single `CompilationRequest` passed to `runner.run()`; call `createCompileHandler(..., getScope, ...)` and then `handler({ intent: "test", projectRoot: tmpDir, modelId: null, configPath: null, conversationId: ... }, undefined)`; assert the captured request has `modelId` null or string ≤256 chars and matching `/^[\x20-\x7E]+$/`, `conversationId` null or within schema, `editorId` equal to `EDITOR_ID.GENERIC` or a valid enum value. Clean up with `fs.rmSync(tmpDir, { recursive: true, force: true })` in a `finally` block.

Implement exactly six test cases:

1. **malicious_cache_overlong_modelId_rejected:** One JSONL line with `m` a string of 257 characters. Assert captured request has `modelId` null (bad row skipped; no valid row).
2. **malicious_cache_control_char_in_modelId_rejected:** One line with `m` containing `\x00` or `\n`. Assert `modelId` null.
3. **malicious_cache_nested_object_as_modelId_rejected:** One line with `m` an object `{ "nested": true }`. Assert `modelId` null (typeof check skips row).
4. **malicious_cache_empty_modelId_rejected:** One line with `m: ""`. Assert `modelId` null.
5. **malicious_cache_missing_m_rejected:** One line with fields `c`, `e`, `timestamp` only — no `m` field. Assert `modelId` null.
6. **malicious_cache_duplicate_keys_invalid_last_rejected:** One line with duplicate key `m` where the last value is a 257-character string. JSON.parse gives last value; assert that row is skipped and `modelId` null.

**Verify:** Run `pnpm test mcp/src/handlers/__tests__/compile-handler.test.ts` and confirm all six new tests pass.

### Step 2: Claude helper tests — malicious cache inputs (aic-compile-helper.test.cjs)

In `integrations/claude/__tests__/aic-compile-helper.test.cjs`, add test functions that: create a temp dir; create `.aic` and write `session-models.jsonl` with one or more malicious lines; set up the mock MCP that records tool arguments (same pattern as mockRecordsArgs in the file); call `callAicCompile("intent", tmpDir, null, 10000)`; read the recorded tool arguments and assert `modelId` is null or a string of length ≤256 with no control characters, and `conversationId`/`editorId` within the same constraints. Cover at least: overlong modelId in cache (257 chars), control character in modelId, nested object as modelId. Use the same temp-dir and cleanup pattern as existing tests in the file. Export and run the new test functions from the file's runner (same pattern as existing async functions).

**Verify:** Run the project's test script that executes this file (see package.json scripts), or run `node integrations/claude/__tests__/aic-compile-helper.test.cjs`. Confirm the new tests pass.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| malicious_cache_overlong_modelId_rejected | Server: session-models.jsonl line with m length 257; request.modelId null |
| malicious_cache_control_char_in_modelId_rejected | Server: line with m containing control char; request.modelId null |
| malicious_cache_nested_object_as_modelId_rejected | Server: line with m as object; request.modelId null |
| malicious_cache_empty_modelId_rejected | Server: line with m ""; request.modelId null |
| malicious_cache_missing_m_rejected | Server: line without m field; request.modelId null |
| malicious_cache_duplicate_keys_invalid_last_rejected | Server: line with duplicate m, last value invalid; request.modelId null |
| helper_malicious_cache_rejected | Claude helper: cache with malicious lines; recorded MCP args have safe modelId/conversationId/editorId |

## Acceptance Criteria

- [ ] Both files modified per Files table
- [ ] All seven test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No new production code; test-only changes
- [ ] Malicious vectors (overlong, control char, nested object, empty, missing field, duplicate keys) all result in silent rejection (no throw; safe fallback values in request/args)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
