# Task 209: Integration tests for simplified model resolution

> **Status:** Pending
> **Phase:** AF (Model ID Resolution Simplification)
> **Layer:** mcp (handlers) + test
> **Depends on:** AF04 (Remove dead code and redundant fallback paths)

## Goal

Add integration tests that verify the simplified model ID resolution flow: session-model cache write (simulated in test) → handler reads cache → resolved modelId is passed on the request → compilation_log.model_id matches. Covers cache hit per editor (cursor, claude-code), model switch mid-session, and empty-cache default to detector.

## Architecture Notes

- All tests extend existing `mcp/src/handlers/__tests__/compile-handler.test.ts` in a new `describe("model resolution integration")` block; no new test file (Approach B from exploration).
- Handler resolution order: `args.modelId ?? readSessionModelCache(projectRoot, conversationId, editorId) ?? getModelId(editorId)` then `normalizeModelId(raw)`. Request is built with the resolved value; runner receives it and records via `compilationLogStore.record(entry)`.
- Use in-memory DB (migration applied), real `CompilationLogStore` (via scope from `createProjectScope` or equivalent), and a recording runner that builds `CompilationLogEntry` from the request and calls `scope.compilationLogStore.record(entry)` without running the full pipeline.
- Cache file format in tests: same as handler and `integrations/shared/session-model-cache.cjs` (JSONL lines with `m`, `c`, `e`, `timestamp`). Write with `fs.writeFileSync` in test so mcp test does not require integrations.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (add describe block, helpers, four tests) |

## Interface / Signature

No new production interface. Tests use existing API:

- `createCompileHandler(getScope, getRunner, sha256Adapter, getSessionId, getEditorId, getModelId, installScopeWarnings, configLoader, setLastConversationId, getUpdateMessage, getConfigUpgraded)` — returns handler.
- Handler receives `args: { intent, projectRoot, modelId?, configPath?, conversationId? }`. Resolution uses `readSessionModelCache(projectRoot, args.conversationId ?? null, editorId)` when `args.modelId` is null.
- Recording runner: `(scope: ProjectScope) => { run(request: CompilationRequest) => Promise<{ compiledPrompt, meta, compilationId }> }` — inside `run`, build `CompilationLogEntry` from `request` (including `request.modelId ?? ""`) and call `scope.compilationLogStore.record(entry)`.

## Dependent Types

### Tier 0 — verbatim

Only the entry shape used when building the stub log entry in the recording runner:

- `CompilationLogEntry` — from `@jatbas/aic-core/core/types/compilation-log-entry.js`: `id`, `intent`, `taskClass`, `filesSelected`, `filesTotal`, `tokensRaw`, `tokensCompiled`, `tokenReductionPct`, `cacheHit`, `durationMs`, `editorId`, `modelId`, `sessionId`, `configHash`, `createdAt`, `triggerSource?`, `conversationId?`.

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ------ | ----- | ------- | ------- |
| `ProjectScope` | `shared/src/storage/create-project-scope.ts` | compilationLogStore, clock, idGenerator, projectId, projectRoot, … | Scope passed to runner; recording runner uses scope.compilationLogStore.record. |
| `CompilationRequest` | `@jatbas/aic-core/core/types/compilation-types.js` | modelId, editorId, conversationId, intent, projectRoot | Request passed to runner.run(); recording runner copies modelId into log entry. |

### Tier 2 — path-only

| Type | Path | Factory |
| ------ | ----- | ------- |
| `AbsolutePath` | `@jatbas/aic-core/core/types/paths.js` | `toAbsolutePath(raw)` |
| `EDITOR_ID` | `@jatbas/aic-core/core/types/enums.js` | `EDITOR_ID.CURSOR`, `EDITOR_ID.CLAUDE_CODE`, `EDITOR_ID.GENERIC` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add helper to write session-models.jsonl in test

In the new `describe("model resolution integration")` block, add a helper that takes a temp dir path, model string `m`, conversation string `c`, editor string `e`, and optional timestamp. Create `tmpDir/.aic` with `fs.mkdirSync(..., { recursive: true, mode: 0o700 })` and write one JSONL line to `tmpDir/.aic/session-models.jsonl` with `fs.writeFileSync(path.join(tmpDir, ".aic", "session-models.jsonl"), JSON.stringify({ m, c, e, timestamp: timestamp ?? "2026-01-01T00:00:00.000Z" }) + "\n", "utf8")`.

**Verify:** Helper exists and creates a file readable by the handler’s `readSessionModelCache` (same key names `m`, `c`, `e`).

### Step 2: Add helper to create scope with real in-memory DB and CompilationLogStore

Add a helper that: creates a temp dir with `fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"))`, obtains an in-memory DB with migration applied via `openDatabase(":memory:", clock)` from `@jatbas/aic-core/storage/open-database.js`, then calls `createProjectScope(toAbsolutePath(tmpDir), new NodePathAdapter(), db, clock)` and returns `{ scope, tmpDir, projectId: scope.projectId }` (use `scope.db` for queries). createProjectScope will call reconcileProjectId and register the project. Use the same clock/idGenerator pattern as existing tests: fixed timestamp and deterministic idGenerator.

**Verify:** Returned scope has `compilationLogStore` that writes to `scope.db`; after a single `compilationLogStore.record(entry)`, `scope.db.prepare("SELECT model_id FROM compilation_log WHERE project_id = ?").get(projectId)` returns a row.

### Step 3: Add recording runner factory

Add a function that, given a `ProjectScope`, returns a runner object `{ run(request: CompilationRequest) }`. Inside `run`: build a `CompilationLogEntry` with `id: scope.idGenerator.generate()`, `intent: request.intent`, `taskClass: TASK_CLASS.OTHER`, `filesSelected: 0`, `filesTotal: 0`, `tokensRaw: toTokenCount(0)`, `tokensCompiled: toTokenCount(0)`, `tokenReductionPct: toPercentage(0)`, `cacheHit: false`, `durationMs: toMilliseconds(0)`, `editorId: request.editorId`, `modelId: request.modelId ?? ""`, `sessionId: request.sessionId ?? null`, `configHash: null`, `createdAt: scope.clock.now()`, `conversationId: request.conversationId ?? null`, `triggerSource: null`. Call `scope.compilationLogStore.record(entry)`. Return `Promise.resolve({ compiledPrompt: "", meta: STUB_COMPILATION_META, compilationId: entry.id })`.

**Verify:** When handler is invoked with this runner and a scope from Step 2, one row appears in `compilation_log` with `model_id` equal to the resolved value passed on the request.

### Step 4: Add test cache_entry_cursor_editor_model_id_recorded_in_db

In a temp dir: call the Step 1 helper to write cache with `m: "claude-sonnet-4"`, `c: "conv-1"`, `e: "cursor"`. Create scope and recording runner (Steps 2–3). Create handler with `getScope` returning that scope, `getModelId: () => null`, `getEditorId: () => EDITOR_ID.CURSOR` (or `"cursor"` per enum), and the recording runner. Call `await handler({ intent: "test", projectRoot: tmpDir, modelId: null, configPath: null, conversationId: "conv-1" }, undefined)`. Query `scope.db.prepare("SELECT model_id FROM compilation_log WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(projectId)` and assert `model_id === "claude-sonnet-4"`. Clean up tmpDir with `fs.rmSync(tmpDir, { recursive: true, force: true })` in a try/finally.

**Verify:** Test passes; failure when cache is missing or wrong editor/conversation confirms resolution path.

### Step 5: Add test cache_entry_claude_code_editor_model_id_recorded_in_db

Same as Step 4 but use `e: "claude-code"` in the cache line and `getEditorId: () => EDITOR_ID.CLAUDE_CODE` (or `"claude-code"`). Assert `model_id === "claude-sonnet-4"`.

**Verify:** Test passes.

### Step 6: Add test model_switch_mid_session

Create temp dir and scope with real DB. Write cache with model A: `m: "model-a"`, `c: "conv-1"`, `e: "cursor"`. Create handler with getModelId null, getEditorId cursor, recording runner. Call handler once. Append a second cache line with `m: "model-b"` (same c, e) to the same session-models.jsonl file (append with `fs.appendFileSync`). Call handler again. Query `scope.db.prepare("SELECT model_id FROM compilation_log WHERE project_id = ? ORDER BY created_at ASC").all(projectId)` and assert first row `model_id === "model-a"` and second row `model_id === "model-b"`.

**Verify:** Test passes; two compilations show correct order of model IDs.

### Step 7: Add test empty_cache_defaults_to_detector

Create temp dir and scope; do not create any session-models.jsonl file. Create handler with `getModelId: () => "auto"`, getEditorId returning cursor (or generic). Call handler. Query `scope.db.prepare("SELECT model_id FROM compilation_log WHERE project_id = ? ORDER BY created_at DESC LIMIT 1").get(projectId)` and assert `model_id === "auto"`.

**Verify:** Test passes; confirms getModelId(editorId) is used when cache is empty and args.modelId is null.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| cache_entry_cursor_editor_model_id_recorded_in_db | Cache with m/c/e for cursor; handler resolves from cache; compilation_log.model_id is that value. |
| cache_entry_claude_code_editor_model_id_recorded_in_db | Same for editor claude-code. |
| model_switch_mid_session | Two compilations with different cache entries; DB has two rows with model_id A then B. |
| empty_cache_defaults_to_detector | No cache file; getModelId returns "auto"; DB row has model_id "auto". |

## Acceptance Criteria

- [ ] All steps implemented in `mcp/src/handlers/__tests__/compile-handler.test.ts`
- [ ] Four test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No new production code; test-only changes
- [ ] Cache format in tests matches handler (m, c, e keys)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
