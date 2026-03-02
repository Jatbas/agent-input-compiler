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

**Sibling reuse and shared code lifecycle:** The approach depends on how many siblings already exist:

- **First adapter in a family (no siblings):** During exploration, predict which functions are generic (would be identical in a future sibling with different config/predicates) vs specific (unique to this library). If 2+ generic functions are identified, extract them to a shared utility file from day one (e.g., `tree-sitter-node-utils.ts`, `[family]-utils.ts`). Future siblings will import from the shared utility without refactoring.

- **Second adapter in a family (one sibling, no shared utilities yet):** This is the extraction moment. Compare the new adapter's needs against the first sibling's inline code. Extract any structurally identical functions (differing only in callbacks/predicates/config) to a shared utility file as a prerequisite step. Add the shared utility file to the Files table and a "Modify" row for the first sibling to refactor it. The task has three phases: (1) extract shared code, (2) refactor first sibling, (3) implement new adapter using shared code.

- **Third+ adapter in a family (shared utilities already exist):** The task MUST mirror the closest sibling's structure and use the same shared factory and utilities — not reimplement them. The Interface/Signature section shows usage of the shared factory (e.g., `defineTreeSitterProvider`), not a manual class. Only the language-specific or library-specific parts (grammar, node types, naming rules, import detection logic) differ. This prevents clone accumulation and ensures new members immediately benefit from improvements to shared infrastructure.

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

**Conditional dependency loading:** Composition roots must NOT eagerly instantiate dependencies that are only relevant under certain project characteristics. For each concrete class the root creates, ask: "Is this always needed, or only when the project has certain files/configuration?" Examples:

- A `PythonProvider` (loads WASM grammar) is only useful when the project has `.py` files
- A future `GoProvider` is only useful when the project has `.go` files
- An external service client is only useful when the config enables it

For conditional dependencies:

1. The **bootstrap function** (e.g. `createPipelineDeps`) accepts them as an injected parameter (`additionalProviders?: readonly LanguageProvider[]`), never creates them internally
2. The **composition root's `main()`** decides whether to create them based on observable project state (e.g. scan for file extensions using existing glob adapter)
3. If creation is async (WASM init, network), it stays in `main()` — the bootstrap function stays sync
4. Functions like `createMcpServer` / `createFullPipelineDeps` remain sync and receive the pre-created dependencies

This ensures startup cost scales with what the project actually uses, not with how many providers/adapters exist in the codebase.

**Immutable accumulation pattern:** Under the project's immutability rules (no `.push()`, no `let`), conditional provider accumulation uses the ternary-spread pattern:

```typescript
const py = projectHasExtension(projectRoot, ".py") ? [await PythonProvider.create()] : [];
const go = projectHasExtension(projectRoot, ".go") ? [await GoProvider.create()] : [];
return [...py, ...go];
```

Each provider gets one `const` line; the return statement spreads them all. New providers add one line and extend the spread.

**Shared expensive init:** When multiple providers share an expensive initialization step (e.g. `Parser.init()` for WASM-based tree-sitter providers), factor it into the orchestrating function (`initLanguageProviders`) rather than duplicating it in each provider's `create()` factory. Call it once before creating any provider that depends on it.

**Wiring steps must be split per file:** When a task wires into multiple composition roots (e.g. both `mcp/src/server.ts` and `cli/src/main.ts`), split into separate steps (Step 5a, Step 5b) — one per file. The one-file-per-step guardrail applies even for near-identical changes.

**Shared vs. single-file library imports in ESLint:** When restricting library imports via ESLint, distinguish between:

- **Single-file imports** (e.g. `tree-sitter-python`): restricted to exactly one provider file. Architecture note: "Only this file may import `tree-sitter-python`."
- **Shared imports** (e.g. `web-tree-sitter`): used by multiple provider files. All providers are added to the ESLint ignores array. Architecture note: "The `web-tree-sitter` package is shared across all WASM-based providers; this file is added to the existing ESLint ignores array."

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

---

## Pipeline transformer recipe (Phase L content transformers)

Pipeline transformers implement the `ContentTransformer` interface and wire into the `ContentTransformerPipeline` via `create-pipeline-deps.ts`. They are pipeline-layer components with no adapters, no storage, and no external dependencies — pure string/regex logic.

**Files pattern:**

| Action | Path                                                              |
| ------ | ----------------------------------------------------------------- |
| Create | `shared/src/pipeline/[name].ts`                                   |
| Create | `shared/src/pipeline/__tests__/[name].test.ts`                    |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (wire transformer) |

**Constructor:** Typically no parameters (stateless). Same pattern as `CommentStripper`. Exception: configuration-driven transformers receive config values (e.g. `excludedExtensions`).

**Interface:** All transformers implement `ContentTransformer` from `#core/interfaces/content-transformer.interface.ts`:

```typescript
export interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: readonly FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

**Format-specific vs non-format-specific:** Transformers with `fileExtensions = []` are non-format-specific (run on all files after format-specific transformers). Transformers with specific extensions are format-specific (first match by extension wins — one per file max). The MVP spec defines the execution order: format-specific first, then non-format-specific; within each group, array order in `create-pipeline-deps.ts` applies. The exploration report must determine which category the transformer belongs to and state its position in the array.

**Wiring order in create-pipeline-deps.ts:** The `transformers` array in `create-pipeline-deps.ts` determines execution order within the non-format-specific group. When wiring a new transformer, specify the exact array position:

- Format-specific transformers: `jsonCompactor`, `lockFileSkipper`, then new format-specific transformers
- Non-format-specific transformers: new non-format-specific transformers first, then `whitespaceNormalizer`, `commentStripper` last (cleanup runs after content-stripping)

**Sibling reuse:** All transformers follow the same class shape (`id`, `fileExtensions`, `transform`). No shared utility extraction is needed unless 2+ transformers share structurally identical internal logic (e.g. identical header-scanning patterns). Check existing transformers (`comment-stripper.ts`, `whitespace-normalizer.ts`, `json-compactor.ts`, `lock-file-skipper.ts`) for reusable logic before writing new parsing helpers.

**File-type safety tests (mandatory):** Each transformer must include tests that verify semantic safety for the file types it handles. "Semantic safety" means the transformer never breaks indentation (Python, YAML, Makefile), JSX syntax, or templating language markers. Test strategy:

- For **non-format-specific** transformers (`fileExtensions = []`): include at least one test per sensitive file type (Python, YAML, JSX) verifying the content remains syntactically valid after transformation
- For **format-specific** transformers: include tests for each listed extension verifying the output preserves the format's structural requirements (e.g. YAML indentation, JSON validity, HTML nesting)
- Name pattern: `safety_[filetype]_[what is preserved]` (e.g. `safety_python_indentation_preserved`, `safety_yaml_structure_unchanged`)

**Benchmark verification step (mandatory):** Every transformer task must include a penultimate step (before final verification) that runs the token reduction benchmark (the test auto-ratchets the baseline when tokens decrease):

```
### Step N: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

The benchmark test auto-ratchets `test/benchmarks/baseline.json`: if the actual token count is lower than the stored baseline, the test writes the new values to disk automatically. No manual editing of `baseline.json` is needed.

Read the test output and note whether the baseline was ratcheted (look for "baseline ratcheted" in stdout) or unchanged. If ratcheted, the updated `baseline.json` will appear in the git diff and should be committed with the task.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.
```

This step ensures that each transformer's token savings are committed to the baseline, preventing future regressions against the improved level.

**Config Changes pattern:** Typically none. Pipeline transformers use no external dependencies and require no ESLint changes. If the transformer uses a library (rare), follow the adapter recipe's ESLint restriction pattern.

**Test pattern beyond safety:** Standard functional tests:

- Content with the target pattern is stripped/compacted correctly
- Content without the target pattern is returned unchanged
- Empty content returns unchanged
- Edge cases specific to the transformer's logic (e.g. "pattern only in file body, not header" for header strippers)
