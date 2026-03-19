# Task 205: Simplify server-side resolution chain

> **Status:** Pending
> **Phase:** AF (Model ID Resolution Simplification)
> **Layer:** mcp
> **Depends on:** AF02 (Extract shared cache read/write/validate module)

## Goal

Reduce the server-side model ID resolution to three steps (args → cache → detector default), remove the redundant modelIdOverride parameter by folding config into getModelId, remove the server-side cache write (hooks handle writes), and update the model-id-flow doc to match.

## Architecture Notes

- Phase AF: single write point (hooks), single read point (server). Config modelId is preserved by folding it into getModelId in the composition root so getModelId(editorId) returns configModelId ?? modelDetector.detect(editorId).
- MCP handler remains a thin facade; resolution logic stays in compile-handler.ts. No new interfaces.
- readSessionModelCache and normalizeModelId remain in compile-handler (AF04 will remove duplication with integrations/shared).

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/handlers/compile-handler.ts` (simplify resolveAndCacheModelId; remove modelIdOverride param) |
| Modify | `mcp/src/server.ts` (fold config into getModelId; remove configModelId from createCompileHandler call) |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (remove 7th argument at all createCompileHandler call sites) |
| Modify | `documentation/model-id-flow-per-editor.md` (Server-side resolution: 3 steps, no server write) |

## Interface / Signature

No new interface. Changed signatures:

**resolveAndCacheModelId** — remove modelIdOverride; do not call writeSessionModelCache:

```typescript
function resolveAndCacheModelId(
  argsModelId: string | null,
  getModelId: (editorId: EditorId) => string | null,
  editorId: EditorId,
  projectRoot: AbsolutePath,
  conversationId: string | null,
  timestamp: string,
): string | null {
  const raw: string | null =
    argsModelId ??
    readSessionModelCache(projectRoot, conversationId, editorId) ??
    getModelId(editorId);
  return raw !== null ? normalizeModelId(raw) : null;
}
```

**createCompileHandler** — remove 7th parameter (modelIdOverride):

```typescript
export function createCompileHandler(
  getScope: (projectRoot: AbsolutePath) => ProjectScope,
  getRunner: (scope: ProjectScope) => CompilationRunner,
  sha256Adapter: StringHasher,
  getSessionId: () => SessionId,
  getEditorId: () => EditorId,
  getModelId: (editorId: EditorId) => string | null,
  installScopeWarnings: readonly string[],
  configLoader: ConfigLoader,
  setLastConversationId: (id: string | null) => void,
  getUpdateMessage: () => string | null,
  getConfigUpgraded: () => boolean,
): (args: { ... }, _extra: unknown) => Promise<CallToolResult>
```

**server.ts** — getModelId folds in config; createCompileHandler call drops configModelId:

```typescript
const getModelId = (editorId: EditorId): string | null =>
  configModelId ?? modelDetector.detect(editorId);
// ...
const compileHandler = createCompileHandler(
  (projectRootArg: AbsolutePath) => registry.getOrCreate(projectRootArg),
  getRunner,
  sha256Adapter,
  getSessionId,
  getEditorId,
  getModelId,
  installScopeWarnings,
  configLoader,
  setLastConversationId,
  getUpdateMessage,
  getConfigUpgraded,
);
```

## Dependent Types

Unchanged. AbsolutePath, EditorId, SessionId, CompilationRequest, CallToolResult from existing imports. SessionModelEntry remains internal to compile-handler.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Simplify resolveAndCacheModelId to 3-step chain and remove cache write

In `mcp/src/handlers/compile-handler.ts`: Change resolveAndCacheModelId so that raw = argsModelId ?? readSessionModelCache(projectRoot, conversationId, editorId) ?? getModelId(editorId). Return raw !== null ? normalizeModelId(raw) : null. Remove the modelIdOverride parameter from the function. Remove the block that calls writeSessionModelCache when resolved !== null. Keep readSessionModelCache, normalizeModelId, and writeSessionModelCache function definitions (writeSessionModelCache is no longer called from resolveAndCacheModelId; AF04 may remove it).

**Verify:** resolveAndCacheModelId has 6 parameters; no call to writeSessionModelCache inside resolveAndCacheModelId.

### Step 2: Remove modelIdOverride from createCompileHandler

In `mcp/src/handlers/compile-handler.ts`: Remove the 7th parameter modelIdOverride: string | null from createCompileHandler. Update the call to resolveAndCacheModelId inside the handler to pass (args.modelId, getModelId, resolvedEditorId, projectRoot, args.conversationId ?? null, scope.clock.now()) — six arguments only.

**Verify:** createCompileHandler has 11 parameters; resolveAndCacheModelId is called with 6 arguments.

### Step 3: Fold config into getModelId and remove configModelId from createCompileHandler call

In `mcp/src/server.ts`: Change getModelId to return configModelId ?? modelDetector.detect(editorId). Remove configModelId from the createCompileHandler argument list (remove the 7th argument so the next arguments shift: installScopeWarnings, configLoader, setLastConversationId, getUpdateMessage, getConfigUpgraded).

**Verify:** createCompileHandler is called with 11 arguments; getModelId is defined as (editorId) => configModelId ?? modelDetector.detect(editorId).

### Step 4: Update all createCompileHandler call sites in tests

In `mcp/src/handlers/__tests__/compile-handler.test.ts`: At every createCompileHandler(..., getModelId, null, ...) call, remove the null (the 7th argument). Each call becomes (getScope, getRunner, sha256Adapter, getSessionId, getEditorId, getModelId, installScopeWarnings, ...).

**Verify:** Grep for createCompileHandler( in the test file shows 11 arguments per call (no null between getModelId and installScopeWarnings).

### Step 5: Update model-id-flow-per-editor.md Server-side resolution section

In `documentation/model-id-flow-per-editor.md`: Replace the "Server-side resolution" section so it states: (1) The compile handler resolves the model ID in this order: args.modelId, then readSessionModelCache(projectRoot, conversationId, editorId), then getModelId(editorId). (2) getModelId(editorId) returns config model.id when set, else the editor detector default. (3) The resolved value is normalized. The server does not write to the cache; hooks write on capture. Implementation: resolveAndCacheModelId in mcp/src/handlers/compile-handler.ts.

**Verify:** The doc lists exactly 3 resolution steps and states the server does not write to the cache.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| Existing compile-handler tests | All 21 createCompileHandler call sites updated to 11-arg signature; tests pass and still assert handler behavior |
| Resolution order | Resolution uses args then cache then getModelId (covered by existing or unchanged tests) |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] resolveAndCacheModelId has 6 parameters and does not call writeSessionModelCache
- [ ] createCompileHandler has 11 parameters (no modelIdOverride)
- [ ] server.ts getModelId returns configModelId ?? modelDetector.detect(editorId); createCompileHandler called with 11 args
- [ ] documentation/model-id-flow-per-editor.md Server-side resolution describes 3 steps and no server write
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
