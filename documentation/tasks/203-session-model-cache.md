# Task 203: Extract shared cache read/write/validate module

> **Status:** Pending
> **Phase:** AF (Model ID Resolution Simplification)
> **Layer:** integrations
> **Depends on:** AF01

## Goal

Create a single CommonJS module in `integrations/shared/session-model-cache.cjs` that exports `isValidModelId`, `normalizeModelId`, `readSessionModelCache`, and `writeSessionModelCache`, and refactor all Cursor and Claude Code hooks to require from this file so the session-model cache has one implementation.

## Architecture Notes

- Integration hooks are CommonJS; the shared module lives in `integrations/shared/` (not `shared/src/` or `mcp/`) per hexagonal boundaries.
- `isValidModelId` is re-exported from `integrations/shared/cache-field-validators.cjs` so hooks can require one module for all four symbols.
- Unified API: `readSessionModelCache(projectRoot, conversationId, editorId)` and `writeSessionModelCache(projectRoot, modelId, conversationId, editorId [, timestamp])`. Cursor callers pass `editorId` `"cursor"`; Claude callers pass the result of their editor detection.
- Server (`mcp/src/handlers/compile-handler.ts`) is out of scope for this task; it keeps its TypeScript implementations until AF03/AF04.

## Files

| Action | Path |
| ------ | ---- |
| Create | `integrations/shared/session-model-cache.cjs` |
| Create | `integrations/shared/__tests__/session-model-cache.test.cjs` |
| Modify | `integrations/claude/hooks/aic-compile-helper.cjs` (require shared module; remove local normalizeModelId, writeSessionModelCache, readSessionModelCache) |
| Modify | `integrations/claude/plugin/scripts/aic-compile-helper.cjs` (require shared module; remove local implementations) |
| Modify | `integrations/cursor/hooks/AIC-subagent-compile.cjs` (require shared module; remove local read/write; call with editorId `"cursor"`) |
| Modify | `integrations/claude/hooks/aic-inject-conversation-id.cjs` (require shared module; remove local normalizeModelId, readSessionModelCache) |
| Modify | `integrations/cursor/hooks/AIC-compile-context.cjs` (require shared module; use isValidModelId, normalizeModelId, writeSessionModelCache; remove inline write) |
| Modify | `integrations/cursor/hooks/subagent-start-model-id.cjs` (require shared module for normalizeModelId; remove local normalizeModelId) |
| Modify | `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs` (require shared module; replace inline session-models write with writeSessionModelCache) |
| Modify | `integrations/cursor/hooks/AIC-inject-conversation-id.cjs` (require shared module; replace inline session-models write with writeSessionModelCache) |

## Interface / Signature

Standalone CommonJS exports (no class). Implementations use Node `fs` and `path` and require `./cache-field-validators.cjs` for validation.

```javascript
const {
  isValidModelId,
  isValidConversationId,
  isValidEditorId,
} = require("./cache-field-validators.cjs");

function normalizeModelId(raw) {
  return raw.toLowerCase() === "default" ? "auto" : raw;
}

function readSessionModelCache(projectRoot, conversationId, editorId) {
  const filePath = path.join(projectRoot, ".aic", "session-models.jsonl");
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const cid = typeof conversationId === "string" ? conversationId.trim() : "";
  let lastMatch = null;
  let lastAny = null;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (
        typeof entry.m !== "string" ||
        !isValidModelId(entry.m) ||
        typeof entry.c !== "string" ||
        !isValidConversationId(entry.c) ||
        typeof entry.e !== "string" ||
        !isValidEditorId(entry.e) ||
        entry.e !== editorId
      )
        continue;
      lastAny = entry.m;
      if (cid.length > 0 && entry.c === cid) lastMatch = entry.m;
    } catch {
      // skip malformed
    }
  }
  return lastMatch !== null ? lastMatch : lastAny;
}
// On read error (file missing or unreadable): return null. Use try/catch around readFileSync.

function writeSessionModelCache(projectRoot, modelId, conversationId, editorId, timestamp) {
  const filePath = path.join(projectRoot, ".aic", "session-models.jsonl");
  const ts = timestamp !== undefined ? timestamp : new Date().toISOString();
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const entry = JSON.stringify({
    c: typeof conversationId === "string" ? conversationId.trim() : "",
    m: modelId,
    e: editorId,
    timestamp: ts,
  });
  fs.appendFileSync(filePath, entry + "\n", "utf8");
}
// On write error: non-fatal, use try/catch and do not throw.

module.exports = { isValidModelId, normalizeModelId, readSessionModelCache, writeSessionModelCache };
```

Only `isValidModelId` is re-exported; `isValidConversationId` and `isValidEditorId` are used only inside `readSessionModelCache`.

## Dependent Types

Not applicable — CJS module uses plain strings and Node built-ins only.

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Create session-model-cache.cjs

Create `integrations/shared/session-model-cache.cjs`. Require `fs`, `path`, and `./cache-field-validators.cjs` (destructure `isValidModelId`, `isValidConversationId`, `isValidEditorId`). Implement `normalizeModelId(raw)` as `raw.toLowerCase() === "default" ? "auto" : raw`. Implement `readSessionModelCache(projectRoot, conversationId, editorId)`: build path with `path.join(projectRoot, ".aic", "session-models.jsonl")`; wrap `fs.readFileSync(filePath, "utf8")` in try/catch and return `null` on error; split by `"\n"`, filter empty lines; for each line parse JSON, validate `entry.m`/`entry.c`/`entry.e` with the validators and `entry.e === editorId`, skip invalid; track lastMatch (when `entry.c === cid`) and lastAny; return `lastMatch ?? lastAny`. Implement `writeSessionModelCache(projectRoot, modelId, conversationId, editorId, timestamp)`: if `timestamp` is undefined use `new Date().toISOString()`; build path; `fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })`; build entry object `{ c, m, e, timestamp }`; `fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8")`; wrap in try/catch and do not throw. Export `{ isValidModelId, normalizeModelId, readSessionModelCache, writeSessionModelCache }`.

**Verify:** File exists; `node -e "const m = require('./integrations/shared/session-model-cache.cjs'); console.log(typeof m.readSessionModelCache, typeof m.writeSessionModelCache)"` from repo root prints `function function`.

### Step 2: Migrate aic-compile-helper.cjs (Claude hooks)

In `integrations/claude/hooks/aic-compile-helper.cjs`, add `const { isValidModelId, normalizeModelId, readSessionModelCache, writeSessionModelCache } = require("../../shared/session-model-cache.cjs");`. Remove the local `normalizeModelId`, `writeSessionModelCache`, and `readSessionModelCache` function definitions. Remove the `require("../../shared/cache-field-validators.cjs")` for the validators used only by the removed functions; keep no other validator usage in this file. Ensure all call sites use the shared functions with `editorId` from `detectEditorId()`.

**Verify:** File has no local definition of `readSessionModelCache` or `writeSessionModelCache`; grep for `require.*session-model-cache` returns one match.

### Step 3: Migrate aic-compile-helper.cjs (Claude plugin)

In `integrations/claude/plugin/scripts/aic-compile-helper.cjs`, add `const { isValidModelId, normalizeModelId, readSessionModelCache, writeSessionModelCache } = require("../../../shared/session-model-cache.cjs");`. Remove the local `normalizeModelId`, `writeSessionModelCache`, and `readSessionModelCache` function definitions. Remove the require of cache-field-validators if it is only used by the removed functions. Ensure call sites use the shared functions with `editorId` from `detectEditorId()`.

**Verify:** File has no local definition of `readSessionModelCache` or `writeSessionModelCache`; grep for `require.*session-model-cache` returns one match.

### Step 4: Migrate AIC-subagent-compile.cjs

In `integrations/cursor/hooks/AIC-subagent-compile.cjs`, add `const { writeSessionModelCache, readSessionModelCache } = require("../../shared/session-model-cache.cjs");`. Remove the local `writeSessionModelCache` and `readSessionModelCache` function definitions. Remove the require of `cache-field-validators.cjs` from this file. Update call sites: `writeSessionModelCache(projectRoot, mid, conversationId, "cursor")` and `readSessionModelCache(projectRoot, conversationId)` becomes `readSessionModelCache(projectRoot, conversationId, "cursor")`.

**Verify:** No local `writeSessionModelCache` or `readSessionModelCache`; calls pass three arguments to `readSessionModelCache`.

### Step 5: Migrate aic-inject-conversation-id.cjs (Claude)

In `integrations/claude/hooks/aic-inject-conversation-id.cjs`, add `const { readSessionModelCache, normalizeModelId } = require("../../shared/session-model-cache.cjs");`. Remove the local `normalizeModelId` and `readSessionModelCache` function definitions. Remove the require of cache-field-validators if only used by the removed code. Shared `readSessionModelCache` returns raw `entry.m`; the caller must normalize: keep `return result !== null ? normalizeModelId(result) : null` in the read path.

**Verify:** No local `readSessionModelCache` or `normalizeModelId`; require from session-model-cache.

### Step 6: Migrate AIC-compile-context.cjs

In `integrations/cursor/hooks/AIC-compile-context.cjs`, add `const { isValidModelId, normalizeModelId, writeSessionModelCache } = require("../../shared/session-model-cache.cjs");`. Replace the inline session-models write block (mkdir, JSON.stringify, appendFileSync) with: if `isValidModelId(trimmed)` then `modelId = normalizeModelId(trimmed)` and `writeSessionModelCache(projectRoot, modelId, conversationId || "", "cursor")`. Remove the local `normalizeModelId` function and the inline validation (length and regex); use `isValidModelId` for the guard.

**Verify:** No inline `path.join(projectRoot, ".aic", "session-models.jsonl")` or `appendFileSync` for session-models in this file; single require of session-model-cache.

### Step 7: Migrate subagent-start-model-id.cjs

In `integrations/cursor/hooks/subagent-start-model-id.cjs`, add `const { normalizeModelId } = require("../../shared/session-model-cache.cjs");`. Remove the local `normalizeModelId` function definition. Keep `modelIdFromSubagentStartPayload` in this file; it may call `normalizeModelId(trimmed)` from the shared module.

**Verify:** No local `normalizeModelId`; require from session-model-cache.

### Step 8: Migrate AIC-before-submit-prewarm.cjs

In `integrations/cursor/hooks/AIC-before-submit-prewarm.cjs`, add `const { isValidModelId, normalizeModelId, writeSessionModelCache } = require("../../shared/session-model-cache.cjs");`. In the stdin "end" handler, replace the block that writes to session-models.jsonl (the `if (model.length >= 1 && ...)` block with mkdirSync, JSON.stringify, appendFileSync) with: if `isValidModelId(model)` then `writeSessionModelCache(projectRoot, normalizeModelId(model.trim()), conversationId, "cursor")`. Use the same `ts` variable for timestamp if the shared function is called with it, or omit timestamp so the shared module uses `new Date().toISOString()`. Call `writeSessionModelCache(projectRoot, normalizeModelId(model.trim()), conversationId, "cursor", ts)` to reuse the same timestamp as the prompt log entry.

**Verify:** No inline session-models path or appendFileSync in this file; require from session-model-cache.

### Step 9: Migrate AIC-inject-conversation-id.cjs (Cursor)

In `integrations/cursor/hooks/AIC-inject-conversation-id.cjs`, add `const { isValidModelId, normalizeModelId, writeSessionModelCache } = require("../../shared/session-model-cache.cjs");`. Replace the block that writes to session-models.jsonl (when `input.model` is valid: trimmed length/regex check, normalized, mkdirSync, appendFileSync) with: if `isValidModelId(trimmed)` then `updated.modelId = normalizeModelId(trimmed)` and `writeSessionModelCache(projectRoot, normalizeModelId(trimmed), idStr || "", "cursor")`.

**Verify:** No inline session-models path or appendFileSync in this file; require from session-model-cache.

### Step 10: Add unit tests for session-model-cache

Create `integrations/shared/__tests__/session-model-cache.test.cjs`. Use Node `assert` and `fs`/`path`/`os.tmpdir()`. Implement test cases: normalizeModelId_default (normalizeModelId("default") and "Default" return "auto"), normalizeModelId_passthrough (normalizeModelId("claude-sonnet-4") returns "claude-sonnet-4"), isValidModelId_empty (isValidModelId("") returns false), isValidModelId_valid (isValidModelId("a") returns true), isValidModelId_too_long (isValidModelId("x".repeat(257)) returns false), write_read_roundtrip (writeSessionModelCache then readSessionModelCache in temp dir returns same modelId), read_filters_editorId (two writes with different editorId, read with one editorId returns only that entry), read_skips_invalid_line (file with invalid JSON line then valid line, read returns valid entry). Run tests with `node integrations/shared/__tests__/session-model-cache.test.cjs` from repo root.

**Verify:** All tests pass.

### Step 11: Final verification

Run from repo root: `pnpm lint && pnpm typecheck`. Run `node integrations/claude/__tests__/aic-compile-helper.test.cjs` and `node integrations/cursor/__tests__/AIC-subagent-model-id.test.cjs` (or the project's test command for integrations) so existing integration tests pass.

**Verify:** Lint and typecheck pass; both integration test files pass.

## Tests

| Test case | Description |
| --------- | ----------- |
| normalizeModelId_default | normalizeModelId("default") returns "auto"; "Default" returns "auto" |
| normalizeModelId_passthrough | normalizeModelId("claude-sonnet-4") returns "claude-sonnet-4" |
| isValidModelId_empty | isValidModelId("") returns false |
| isValidModelId_valid | isValidModelId("a") returns true |
| isValidModelId_too_long | isValidModelId("x".repeat(257)) returns false |
| write_read_roundtrip | writeSessionModelCache then readSessionModelCache in temp dir returns same modelId |
| read_filters_editorId | Two writes with different editorId; read with one editorId returns only that entry |
| read_skips_invalid_line | File with invalid JSON line then valid line; read returns valid entry |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] All hook files require from `integrations/shared/session-model-cache.cjs` and have no local definitions of the four functions
- [ ] All test cases in Tests table pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] Existing integrations tests (aic-compile-helper.test.cjs, AIC-subagent-model-id.test.cjs) pass
- [ ] No change to `mcp/src/handlers/compile-handler.ts`

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
