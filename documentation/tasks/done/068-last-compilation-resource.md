# Task 068: aic://last-compilation resource (fix stub)

> **Status:** Done
> **Phase:** M (Reporting & Resources)
> **Layer:** mcp
> **Depends on:** aic://session-summary resource (Done)

## Goal

Replace the stub `aic://last-compilation` MCP resource handler with a real implementation that returns `compilationCount` and `lastCompilation` from `StatusStore.getSummary()` so editors can read the most recent compilation summary without running the CLI.

## Architecture Notes

- Composition root change only: replace the existing stub callback in `mcp/src/server.ts`. No new interfaces in core.
- Reuse existing `SqliteStatusStore` and `StatusAggregates`; the handler uses the same pattern as session-summary: instantiate the store from `scope.db` and `scope.clock`, call `getSummary()`, return a subset as JSON.
- Payload shape `{ compilationCount: number, lastCompilation: StatusAggregates["lastCompilation"] }` satisfies MVP spec ("aic://last-compilation always includes compilationCount") and uses persisted data from `compilation_log` via `getSummary()`.

## Files

| Action | Path                                                                         |
| ------ | ---------------------------------------------------------------------------- |
| Modify | `mcp/src/server.ts` (replace last-compilation stub with real handler)        |
| Modify | `mcp/src/__tests__/server.test.ts` (add tests for last-compilation resource) |

## Wiring Specification

**Current stub (to replace):**

```typescript
server.resource("last-compilation", "aic://last-compilation", () => ({
  contents: [],
}));
```

**New handler:** Same pattern as session-summary. Instantiate `SqliteStatusStore(scope.db, scope.clock)`, call `getSummary()`, return one content item with JSON:

```typescript
server.resource("last-compilation", "aic://last-compilation", () => {
  const statusStore = new SqliteStatusStore(scope.db, scope.clock);
  const summary = statusStore.getSummary();
  return {
    contents: [
      {
        uri: "aic://last-compilation",
        mimeType: "application/json",
        text: JSON.stringify({
          compilationCount: summary.compilationsTotal,
          lastCompilation: summary.lastCompilation,
        }),
      },
    ],
  };
});
```

**Concrete class used in handler:** `SqliteStatusStore` — Source: `shared/src/storage/sqlite-status-store.ts`. Constructor: `constructor(db: ExecutableDb, clock: Clock)`. Method: `getSummary(): StatusAggregates`. Already imported in server.ts.

## Dependent Types

### Tier 0 — verbatim

Handler reads `summary.compilationsTotal` and `summary.lastCompilation` from `getSummary()` return value. Response shape: `{ compilationCount: number, lastCompilation: StatusAggregates["lastCompilation"] }`. The `lastCompilation` type is the inline type from `StatusAggregates` in `shared/src/core/types/status-types.ts` (intent, filesSelected, filesTotal, tokensCompiled, tokenReductionPct, created_at, editorId, modelId) or null.

### Tier 1 — signature + path

| Type               | Path                                                   | Purpose                                                           |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- |
| `StatusStore`      | `shared/src/core/interfaces/status-store.interface.js` | getSummary()                                                      |
| `StatusAggregates` | `shared/src/core/types/status-types.js`                | Return type of getSummary(); .compilationsTotal, .lastCompilation |

### Tier 2 — path-only

scope.db and scope.clock are already available in createMcpServer; no new branded types in the handler.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Replace last-compilation stub handler in server

In `mcp/src/server.ts`, replace the existing `server.resource("last-compilation", "aic://last-compilation", () => ({ contents: [] }));` registration with a handler that: creates `new SqliteStatusStore(scope.db, scope.clock)`, calls `getSummary()`, and returns `{ contents: [{ uri: "aic://last-compilation", mimeType: "application/json", text: JSON.stringify({ compilationCount: summary.compilationsTotal, lastCompilation: summary.lastCompilation }) }] }`. SqliteStatusStore is already imported; no new imports required.

**Verify:** `pnpm typecheck` passes. Grep for `last-compilation` in server.ts shows the resource registration with a handler that references `getSummary()` and `compilationCount`.

### Step 2: Add tests for last-compilation resource

In `mcp/src/__tests__/server.test.ts`:

- Add test **last_compilation_resource_returns_json**: Create temp dir with `fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"))`, call `createMcpServer(toAbsolutePath(tmpDir))`, connect server and client with `InMemoryTransport.createLinkedPair()`, connect client. Call `client.callTool({ name: "aic_compile", arguments: { intent: "fix bug", projectRoot: tmpDir } })` once to create one compilation. Then call `client.readResource({ uri: "aic://last-compilation" })`. Assert `result.contents` has length 1, `result.contents[0].mimeType === "application/json"`. Parse the text as JSON. Assert `parsed.compilationCount >= 1`, `parsed.lastCompilation` is an object, `parsed.lastCompilation.intent === "fix bug"`, and the object has fields filesSelected, filesTotal, tokensCompiled, tokenReductionPct, created_at, editorId, modelId.
- Add test **last_compilation_resource_empty_db**: Fresh temp dir (no compilations). createMcpServer, connect client. Call `client.readResource({ uri: "aic://last-compilation" })`. Parse the first content item's text as JSON. Assert `parsed.compilationCount === 0`, `parsed.lastCompilation === null`, and `Object.keys(parsed)` has exactly two keys: "compilationCount" and "lastCompilation".

**Verify:** `pnpm test mcp/src/__tests__/server.test.ts` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                              | Description                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| last_compilation_resource_returns_json | After one aic_compile, resource returns JSON with compilationCount >= 1 and lastCompilation object     |
| last_compilation_resource_empty_db     | Fresh DB: resource returns JSON with compilationCount 0, lastCompilation null, and only those two keys |

## Acceptance Criteria

- [ ] last-compilation resource handler in server.ts returns real data (compilationCount, lastCompilation)
- [ ] Handler uses SqliteStatusStore(scope.db, scope.clock) and getSummary()
- [ ] Both test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries (MCP may import from @aic/shared)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
