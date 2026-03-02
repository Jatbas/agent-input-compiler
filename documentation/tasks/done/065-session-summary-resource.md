# Task 065: aic://session-summary resource

> **Status:** Done
> **Phase:** M (Reporting & Resources)
> **Layer:** mcp
> **Depends on:** (none — Phase M is independent)

## Goal

Expose project status aggregates (compilations, cache hit rate, guard counts, last compilation, installation) as an MCP resource at `aic://session-summary` so editors can read session summary data without running the CLI.

## Architecture Notes

- Composition root change only: register a new resource in `mcp/src/server.ts`. No new interfaces in core.
- Reuse existing `SqliteStatusStore` and `StatusAggregates`; the resource handler instantiates the store from `scope.db` and `scope.clock` and returns `getSummary()` as JSON.
- MCP resource read response shape: `{ contents: [{ uri, mimeType?, text? }] }` per MCP spec. Session-summary returns one content item with `mimeType: "application/json"` and `text: JSON.stringify(summary)`.
- Security: Resource is read by the local MCP client (editor); no outbound telemetry. StatusAggregates includes last intent and editor/model — acceptable for local context.

## Files

| Action | Path                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| Modify | `mcp/src/server.ts` (import SqliteStatusStore, register session-summary resource) |
| Modify | `mcp/src/__tests__/server.test.ts` (add tests for session-summary resource)       |

## Wiring Specification

**Existing resource (pattern to follow):**

```typescript
server.resource("last-compilation", "aic://last-compilation", () => ({
  contents: [],
}));
```

**New resource handler:** Instantiate `SqliteStatusStore(scope.db, scope.clock)`, call `getSummary()`, return:

```typescript
{
  contents: [{
    uri: "aic://session-summary",
    mimeType: "application/json",
    text: JSON.stringify(summary),
  }],
}
```

**Concrete class used in handler:**

- `SqliteStatusStore` — Source: `shared/src/storage/sqlite-status-store.ts`
  - Constructor: `constructor(db: ExecutableDb, clock: Clock)`
  - Method: `getSummary(): StatusAggregates`

## Dependent Types

### Tier 0 — verbatim

`StatusAggregates` (shared/src/core/types/status-types.ts) is the payload shape. No need to paste full type in task — handler returns `statusStore.getSummary()` serialized as JSON.

### Tier 1 — signature + path

| Type               | Path                                                   | Purpose                     |
| ------------------ | ------------------------------------------------------ | --------------------------- |
| `StatusStore`      | `shared/src/core/interfaces/status-store.interface.js` | getSummary()                |
| `StatusAggregates` | `shared/src/core/types/status-types.js`                | Return type of getSummary() |

### Tier 2 — path-only

| Type       | Path | Factory                                                    |
| ---------- | ---- | ---------------------------------------------------------- |
| (none new) | —    | scope.db, scope.clock already available in createMcpServer |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Register session-summary resource in server

In `mcp/src/server.ts`:

- Add named import: `SqliteStatusStore` from `@aic/shared/storage/sqlite-status-store.js`.
- After the existing `server.resource("last-compilation", ...)` registration, add a second resource registration:
  - Name: `"session-summary"`.
  - URI: `"aic://session-summary"`.
  - Handler: a function that creates `new SqliteStatusStore(scope.db, scope.clock)`, calls `getSummary()`, and returns `{ contents: [{ uri: "aic://session-summary", mimeType: "application/json", text: JSON.stringify(summary) }] }`.

**Verify:** `pnpm typecheck` passes. Grep for `session-summary` in server.ts shows the new resource registration.

### Step 2: Add tests for session-summary resource

In `mcp/src/__tests__/server.test.ts`:

- Add test **session_summary_resource_returns_json**: Create temp dir, call `createMcpServer(toAbsolutePath(tmpDir))`, connect server and client with `InMemoryTransport.createLinkedPair()`, call `client.readResource({ uri: "aic://session-summary" })`, assert `result.contents` has length 1, `result.contents[0].mimeType === "application/json"`, and `JSON.parse(result.contents[0].text)` is an object with numeric `compilationsTotal` and `compilationsToday`, and either `lastCompilation` (object or null) or other StatusAggregates fields. Use the same tmpDir/connect pattern as in the existing test list_tools.
- Add test **session_summary_resource_empty_db**: Same setup with a fresh temp dir (no compilations run). Call `client.readResource({ uri: "aic://session-summary" })`, parse JSON, assert `compilationsTotal === 0` and the parsed object has the expected top-level keys: `compilationsTotal`, `compilationsToday`, `cacheHitRatePct`, `guardByType`, `topTaskClasses`, `lastCompilation`, `installationOk`, `installationNotes`.

**Verify:** `pnpm test mcp/src/__tests__/server.test.ts` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                             | Description                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| session_summary_resource_returns_json | Resource aic://session-summary returns one JSON content item with StatusAggregates shape |
| session_summary_resource_empty_db     | Fresh DB: resource returns valid JSON with compilationsTotal 0 and expected keys         |

## Acceptance Criteria

- [ ] session-summary resource registered in server.ts
- [ ] Handler returns StatusAggregates as application/json
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
