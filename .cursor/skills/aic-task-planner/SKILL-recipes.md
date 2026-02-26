# Task Planner — Recipes

Reference file for the task-planner skill. Read this when you need the recipe for the component's RECIPE type from the Exploration Report.

---

## Adapter recipe (wrapping an external library)

**Files pattern:**

| Action | Path                                                                              |
| ------ | --------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/[name].interface.ts` (if interface doesn't exist yet) |
| Create | `shared/src/adapters/[library]-adapter.ts`                                        |
| Create | `shared/src/adapters/__tests__/[library]-adapter.test.ts`                         |
| Modify | `eslint.config.mjs` (add per-file restriction — see below)                        |

**Constructor:** Typically `constructor()` with no infrastructure dependencies. Exception: if the adapter needs to generate timestamps or IDs, inject `Clock` or `IdGenerator`.

**ESLint per-library restriction:** Add this config block AFTER the general adapter boundary block and BEFORE the system-clock exemption.

**CRITICAL — flat config override semantics:** In ESLint flat config, when two blocks match the same file, the LAST block's rule value **replaces** the earlier one — it does NOT merge. A standalone block with only the new library path would DROP the adapter boundary's existing restrictions (better-sqlite3, zod, `BAN_RELATIVE_PARENT`, patterns) for all non-exempt adapter files. To prevent this, the per-library block must include ALL paths and patterns from the adapter boundary block PLUS the new library entry. Read `eslint.config.mjs`, find the adapter boundary block's `no-restricted-imports` paths and patterns arrays, and copy them into the new block:

```javascript
{
  files: ["shared/src/adapters/**/*.ts"],
  ignores: ["shared/src/adapters/[library]-adapter.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [
        // All existing adapter boundary paths (copy from adapter boundary block)
        ...existingAdapterBoundaryPaths,
        // New library restriction
        {
          name: "[library-package]",
          message: "Only [library]-adapter.ts may import [library-package]."
        },
      ],
      patterns: [
        // All existing adapter boundary patterns (copy from adapter boundary block)
        ...existingAdapterBoundaryPatterns,
      ],
    }],
  },
},
```

During exploration, record the exact adapter boundary paths and patterns so the Config Changes section contains the complete merged block — not just the new library entry.

**Sync/async:** Check the interface return type. If it returns `T` (not `Promise<T>`), state in the implementation step: "Use [library]'s sync API (`[function-name]`)." If `Promise<T>`, use the async API.

**Config Changes pattern:**

- Dependencies: check `shared/package.json`. State "already at [version]" or "add at [version]."
- ESLint: show the exact config block above with the library name filled in.

---

## Storage recipe (implementing a core store interface)

**Files pattern:**

| Action | Path                                                       |
| ------ | ---------------------------------------------------------- |
| Create | `shared/src/storage/sqlite-[name]-store.ts`                |
| Create | `shared/src/storage/__tests__/sqlite-[name]-store.test.ts` |

**Constructor:** Always starts with `db: ExecutableDb`. Add other params based on the decision checklist:

- Generates timestamps → add `clock: Clock`
- Generates entity IDs → add `idGenerator: IdGenerator`
- All timestamps come from input data → no Clock needed

**Layer constraint — NO file I/O:** The storage layer ESLint bans `node:fs`, `fs`, `node:path`, `path`. If the design requires reading/writing files, this is a **blocker** — stop and ask the user. Options: (a) store data in DB columns instead of files, (b) create a separate adapter behind an interface and inject it, (c) request an ESLint exception.

**SQL column mapping:** In the Steps section, show the exact mapping between type fields and table columns:

```
Type field → Column:
- event.id (UUIDv7) → id (TEXT PK)
- event.timestamp (ISOTimestamp) → created_at (TEXT)
- event.cacheHit (boolean) → cache_hit (INTEGER, 0/1)
```

**Test pattern:** Use in-memory SQLite (`":memory:"`) and run the migration before each test. Mock `Clock` and `IdGenerator` with deterministic implementations.

**Edge test checklist for storage:** Beyond happy-path tests, always include:

- **Computed columns:** If any SQL computes a derived value (e.g. `ROUND(...)`, percentage, ratio), add a test where the denominator is zero or the inputs are zero. Verify the store handles it without division-by-zero or NaN.
- **Idempotency / upsert:** If the schema uses `INSERT OR REPLACE`, `ON CONFLICT`, or similar, add a test that writes the same primary key twice and verifies the expected semantics (replace vs reject vs no-op).
- **Empty result sets:** Add a test that queries before any data is inserted and verifies the return value (empty array, null, or zero — whichever the interface specifies).

---

## Composition root recipe (mcp/src/server.ts, cli/src/commands/\*.ts)

Composition roots are fundamentally different from all other components. They do NOT implement an interface — they **wire** interfaces to concrete implementations. All the rules that ban `new`, Node APIs, and direct library imports in other layers exist precisely because composition roots are the ONE place where those things happen.

**Identifying a composition root:** If the component's job is to instantiate concrete classes, open databases, connect transports, register handlers, or start a process — it is a composition root. Examples: `mcp/src/server.ts`, `cli/src/commands/compile.ts`.

**Files pattern:**

| Action | Path                                                       |
| ------ | ---------------------------------------------------------- |
| Create | `mcp/src/server.ts` (or `cli/src/commands/[name].ts`)      |
| Create | `mcp/src/__tests__/server.test.ts` (or corresponding test) |
| Modify | `shared/package.json` (if exports needed)                  |
| Modify | `[package]/package.json` (if dependencies needed)          |

**Template differences — the Interface/Signature section becomes "Wiring Specification":**

Instead of copying an interface from core (there is none to copy), the task must contain:

1. **A code block listing every concrete class instantiated**, with constructor signatures copied verbatim from the actual source files. This is the composition root's "interface" — the executor needs to know what to `new` and with what arguments.

2. **A code block showing the exported function signatures** (e.g. `main()`, `createProjectScope()`) with full TypeScript types.

3. **A code block for every external library class used**, showing the exact import path and the constructor/method signatures copied from the installed `.d.ts`.

**Dependent Types for composition roots — tiered system:**

Unlike interface-implementing components (where "None" can be valid), composition roots always use domain types. "None" is almost never correct for a composition root.

Composition root tasks use the tiered type system (see `SKILL-guardrails.md` "Dependent Types — tiered system"). During exploration, classify every type:

- **Tier 0 (verbatim):** Interfaces the composition root calls methods on, or compound types it constructs inline (object literals matching the type shape). Paste full code blocks with all method signatures and imports.
- **Tier 1 (signature + path):** Interfaces passed to constructors but never consumed directly — `LanguageProvider`, `ContentTransformer`, `Clock`, `IdGenerator`, `ExecutableDb`, etc. when the root just passes them through. Show name, path, member count (methods + readonly properties), and purpose in a table. In the Purpose column, distinguish methods from properties: `methodA, methodB + props: propC, propD`.
- **Tier 2 (path-only):** Branded types (`AbsolutePath`, `TokenCount`, `ISOTimestamp`) and `as const` enum objects. Show name, path, factory function in a table.

When in doubt, use the higher tier — more detail is always safe. Abbreviated summaries like "(interface with X, Y, Z)" are never acceptable at any tier.

**Test strategy for composition roots:**

Composition root tests are integration-style, not unit-style:

- **Protocol communication test:** When testing a server that communicates over a protocol (MCP, JSON-RPC, etc.), prefer the library's own client SDK with in-process transport over raw child-process spawn. For MCP servers: use `Client` from `@modelcontextprotocol/sdk/client/index.js` with `InMemoryTransport` from `@modelcontextprotocol/sdk/inMemory.js` to call `client.listTools()` and `client.callTool(...)` in-process. This avoids fragile protocol framing issues (MCP stdio uses content-length headers, not newline-delimited JSON). If process-spawn tests are needed (for startup/crash behavior), verify the exact wire format from the transport's `.d.ts` before writing framing code.
- **Scope creation test:** Call the scope-creation function with a temp directory, verify it creates the expected directory structure and returns the expected objects.
- **Error boundary test:** Verify the composition root catches errors and returns appropriate error responses (MCP error codes for server, exit codes for CLI) instead of crashing.
- **Idempotency test:** Call scope creation twice on the same path, verify no crash (directories already exist, migrations already applied).
- **Permissions test:** Verify `.aic/` directory is created with `0700` permissions.

**Step granularity for composition roots:**

Since a composition root has no "methods" to count, break steps by concern:

- Step 1: Config changes (one file per step — split if multiple packages)
- Step 2: Helper functions (e.g. `ensureAicDir`, `createProjectScope`) — max 2 per step
- Step 3: Infrastructure wiring (clock, idGenerator, adapters)
- Step 4: Server/CLI setup and handler registration
- Step 5: Tests (one step per test concern — e.g. spawn test, scope test)

Each step still touches max 1 file.
