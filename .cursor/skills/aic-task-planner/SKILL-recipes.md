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

## Composition root recipe (mcp/src/server.ts)

Composition roots are fundamentally different from all other components. They do NOT implement an interface — they **wire** interfaces to concrete implementations. All the rules that ban `new`, Node APIs, and direct library imports in other layers exist precisely because composition roots are the ONE place where those things happen.

**Identifying a composition root:** If the component's job is to instantiate concrete classes, open databases, connect transports, register handlers, or start a process — it is a composition root. Example: `mcp/src/server.ts`.

**Files pattern:**

| Action | Path                                                       |
| ------ | ---------------------------------------------------------- |
| Create | `mcp/src/server.ts`                                        |
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

**Wiring steps must be split per file:** When a task wires into multiple files within the composition root, split into separate steps (Step 5a, Step 5b) — one per file. The one-file-per-step guardrail applies even for near-identical changes.

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

---

## Benchmark recipe (gold data, fixtures, and evaluation tests)

Benchmark tasks enrich the evaluation suite: gold annotations, fixture repositories, and benchmark tests. They produce no production code — only test infrastructure in `test/benchmarks/` and `shared/src/integration/__tests__/`.

**Identifying a benchmark task:** If the component's job is to define evaluation data (gold annotations, expected outputs), create or modify fixture repositories, or add/change benchmark evaluation tests — it is a benchmark task. These live outside the hexagonal architecture (no core, pipeline, adapter, or storage layers).

**Sub-types:**

- **Gold enrichment:** Add new annotation dimensions to existing gold data (e.g., path-only to block/line ranges)
- **New benchmark task:** Add a new fixture repo + gold data + evaluation test for a canonical task
- **Metric evolution:** Change how benchmarks compute and report metrics (e.g., add precision/recall)
- **Fixture enrichment:** Add files/content to existing fixture repos to exercise new pipeline capabilities

**Files pattern:**

| Action        | Path                                                          |
| ------------- | ------------------------------------------------------------- |
| Create/Modify | `test/benchmarks/expected-selection/[N].json` (gold data)     |
| Create/Modify | `test/benchmarks/repos/[N]/...` (fixture files)               |
| Create/Modify | `shared/src/integration/__tests__/[benchmark].test.ts`        |
| Modify        | `test/benchmarks/baseline.json` (only if token counts change) |

**Template differences — the Interface/Signature section becomes "Gold Data Schema":**

Instead of copying a core interface, the task must contain:

1. **A TypeScript interface** defining the gold data JSON structure. This is the contract between the gold data files and the benchmark test that reads them. Even though this interface is not compiled (gold data is read as JSON and cast), the task must define the shape precisely so the executor writes correct gold files and correct parsing code.

2. **A complete example JSON** showing one gold data entry with all fields populated. This serves as the reference for both the executor writing gold data and the benchmark test parsing it.

3. **A field-by-field mapping** showing which gold data field corresponds to which pipeline output field. Example:

   ```
   Gold field → Pipeline output:
   - selectedPaths[i] → trace.selectedFiles[i].path
   - blocks[i].filePath → trace.selectedFiles[i].path
   - blocks[i].startLine → matched against chunks in trace output
   ```

**Dependent Types:** Benchmark tests consume pipeline output types. Use the standard tiered system:

- **Tier 0:** Types the test directly reads fields from (e.g., `PipelineTrace`, `SelectedFile` — the test accesses `.selectedFiles`, `.path`, `.chunks`)
- **Tier 1:** Types passed through but not field-accessed (e.g., `InspectRequest` when constructed and passed to `runner.inspect()`)
- **Tier 2:** Branded types used to construct test inputs (e.g., `AbsolutePath`, `FilePath`)

**Gold data integrity rule:** Every annotation in the gold data must be verifiable against the fixture repo. If a gold entry says file `src/auth/service.ts` has a relevant block at lines 5–15, the fixture file must actually have meaningful code at those lines. During exploration, read every fixture file that the gold data references and record the line ranges of significant code structures (functions, classes, exported symbols). Gold annotations are written from this verified evidence — never from assumption.

**Fixture stability:** Fixture repos are deterministic snapshots. If the task modifies fixture files, note every change and its impact on existing gold data and baselines. Changes cascade: a modified fixture file may invalidate existing `expected-selection` entries and `baseline.json` token counts.

**Backward compatibility:** When enriching existing gold data (adding fields to existing JSON), the new format must be backward-compatible with any existing benchmark tests that read the old format. New fields are additive; existing fields keep their semantics. If a test only reads `selectedPaths`, the enriched file with `selectedPaths` plus new annotation fields still works for that test.

**Config Changes pattern:** Typically none. Benchmark tasks add no production dependencies and require no ESLint changes (test files and `test/benchmarks/` already have relaxed lint rules).

**Test pattern:** The benchmark test IS the deliverable — there are no separate unit tests for gold data. The test:

- Reads gold data from `test/benchmarks/expected-selection/[N].json`
- Runs the full pipeline (via `InspectRunner` or `CompilationRunner`) against the fixture repo
- Compares pipeline output against gold data at every annotated granularity level
- Uses the same wiring pattern as existing benchmarks: `createProjectScope`, `createFullPipelineDeps`, `initLanguageProviders`, `LoadConfigFromFile`, `applyConfigResult`

**Step granularity:**

- Step 1: Gold data — create or update `expected-selection/[N].json` with new annotations (one step per gold file)
- Step 2: Fixture changes — modify fixture repo files if needed (one step per fixture change)
- Step 3: Test code — create or modify benchmark test to consume new gold format (one step per test file)
- Step 4: Existing benchmark verification — run existing benchmarks to confirm no regressions from fixture/gold changes
- Step 5: Final verification

Each step still touches max 1 file.

**Sibling reuse:** All benchmark tests follow the same wiring pattern (see existing `selection-quality-benchmark.test.ts` and `token-reduction-benchmark.test.ts`). New benchmark tests must mirror this wiring — not reinvent it. During exploration, read the closest existing benchmark test and replicate its setup structure.

**Exploration specifics for benchmark tasks:** Beyond the standard checklist, the exploration must:

1. **Read every existing gold data file** in `test/benchmarks/expected-selection/` — record the current schema shape.
2. **Read every existing benchmark test** in `shared/src/integration/__tests__/*benchmark*` — record the wiring pattern.
3. **Read every fixture file** referenced by gold data — record line numbers of functions, classes, exports, and other structural landmarks that gold annotations will reference.
4. **Run the pipeline** against the fixture repo (via `pnpm test` on the selection-quality benchmark) and read the actual `PipelineTrace` output shape to confirm which fields are available for gold comparison.
5. **Check baseline impact** — will the changes affect `baseline.json` token counts or `expected-selection` path lists?

---

## Release pipeline recipe (npm publish, CI automation)

Release pipeline tasks define how one or more packages are published to npm (or another registry). They cover package metadata for publishability, build output layout, and CI automation (e.g. GitHub Actions) that runs on release triggers (e.g. tag push) and executes the publish step. No new production code in core, pipeline, adapter, or storage — only package config, workflow files, and optional documentation.

**Identifying a release-pipeline task:** If the component's job is to make a package publishable, add or change a workflow that publishes on tag/release, configure `publishConfig` / `files` / entry points, or document the release process — it is a release-pipeline task. Example: "npm publish pipeline (`@aic/mcp`)" from Phase V.

**Files pattern:**

| Action | Path                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| Modify | `[package]/package.json` (name, version, main/types/bin, files, publishConfig, private)                      |
| Create | `.github/workflows/[name].yml` (e.g. publish.yml) — or Modify if one exists                                  |
| Modify | Root `package.json` (if release scripts or workspace publish config)                                         |
| Modify | `documentation/` (release runbook, CONTRIBUTING release section) — only if the task explicitly includes docs |

Do not add workflow or docs unless the exploration concludes they are in scope. Prefer a single workflow file; split only if triggers or jobs are clearly separate (e.g. CI vs publish).

**Template differences — the Interface/Signature section becomes "Publish specification":**

Release-pipeline tasks do not implement a core interface. Instead, the task must contain:

1. **Package(s) to publish:** Exact npm package name(s) (e.g. `@aic/mcp`). If multiple (e.g. `@aic/shared` and `@aic/mcp`), state publish order (shared first if mcp depends on it).

2. **Entry points:** For each package, the exact fields that define what gets run and what gets included:
   - `main`, `types`, `bin` — must point at built output (`dist/...`), not source (`src/...`), so that `npm pack` / install produces runnable code.
   - `exports` — if the package is consumed via subpath imports, the exports map must point at built output. State the exact exports object.
   - `files` — whitelist array of paths included in the npm tarball (`["dist"]`). Always specify `files` explicitly so tests, source, and dev artifacts are excluded from the published package. Never use `.npmignore` — the `files` whitelist is safer and more predictable.
   - `bin` shebang — if the package has a `bin` entry, the target file must start with `#!/usr/bin/env node`. State how the shebang is added (source file or post-build step).

3. **Build:** The exact command(s) that produce publishable output (`pnpm build` or `tsc -b`). Build must run before publish in CI; the task must state where it runs (same job as publish or dependency job).

4. **Trigger:** When the publish workflow runs — e.g. `workflow_dispatch` only, or `push` tags `v*`. Be explicit (tag pattern, branch, or manual).

5. **Secrets / auth:** What the workflow needs to authenticate to the registry (e.g. `NPM_TOKEN`). Document where the secret is set (repo secrets, org secrets) in Architecture Notes or a dedicated step; never hardcode.

**Dependent Types:** Not used. Write "Not applicable — release pipeline; no core types consumed."

**Exploration checklist specifics for release-pipeline:**

- **Current package.json state:** Read each package to be published. Record: `name`, `version`, `private`, `main`/`types`/`bin` (current values), presence of `files` and `publishConfig`. If `main`/`bin` point at `.ts` or `src/`, the task must switch them to `dist/` after build.
- **Build output:** Run the build command and list the resulting directories (shared/dist, mcp/dist). Confirm that entry points (main, bin) can point at files inside those directories (dist/server.js). Record the exact file names produced.
- **Shebang for bin entries:** If a package has a `bin` field, the target file must start with `#!/usr/bin/env node`. TypeScript's `tsc` does NOT add shebangs to compiled output. Check whether the source file already has one (tsc preserves it if present as a leading comment). If not, the task must add the shebang to the source file or add a post-build step that prepends it. Without the shebang, `npx <package>` fails on Unix systems.
- **tsconfig.json for published packages:** Read each published package's `tsconfig.json`. Record: `declaration` (must be true for `.d.ts` generation), `declarationMap`, `sourceMap`, `outDir`. If `declaration` is false or missing, the task must enable it so consumers get type information.
- **`exports` field mapping:** If a published package is consumed via subpath imports (consumers write `import { X } from "@scope/pkg/some/path.js"`), the `exports` field in `package.json` must map those subpaths to built output, not source. Check current `exports` values — if they point at `./src/*`, the task must change them to `./dist/*`. For packages with a single entry point (no subpath imports), `main` + `types` suffice and `exports` can match.
- **Workspace dependency and publish order:** If the published package depends on another workspace package (`"@aic/shared": "workspace:*"`), both packages must be published. `workspace:*` is a pnpm protocol that does not resolve on the npm registry. Use `pnpm publish` (not `npm publish`) — pnpm automatically replaces `workspace:*` with the resolved version at publish time. The dependency must be published first. Record the exact publish order.
- **Existing CI:** Read `.github/workflows/*.yml`. If a publish workflow already exists, the task Modifies it; otherwise Create. Record the exact trigger and job names.
- **SBOM / provenance (Phase 1+):** SBOM generation, `npm publish --provenance` — include in the task only if the mvp-progress or project-plan explicitly calls for them in this component.
- **Publish inclusion strategy:** AIC uses the `files` field in `package.json` to control what goes into the npm tarball — not `.npmignore`. The `files` field is a whitelist: only listed paths are included. This is safer than `.npmignore` (a blacklist that can accidentally ship dev artifacts). During exploration, determine the exact `files` array for each published package.

**Exploration Report — non-applicable fields:** For release-pipeline tasks, the following standard Exploration Report fields do not apply. Mark each as "N/A — release pipeline; no production code":
INTERFACES, CONSTRUCTOR, METHOD BEHAVIORS, SYNC/ASYNC, SCHEMA, OPTIONAL FIELD HAZARDS, WIRING SPECIFICATION, LIBRARY API CALLS, TRANSFORMER DETAILS.
Fill these fields instead: EXISTING FILES, DEPENDENCIES, ESLINT CHANGES (typically "no change"), DESIGN DECISIONS (publish order, trigger, workspace dep strategy, `files` array contents), and the release-pipeline-specific items above.

**Config Changes pattern:**

- **package.json:** List exact edits: add/change `files`, `main`, `types`, `bin`, `publishConfig`; remove or keep `private` (and when it is flipped, e.g. only in CI or permanently). Versions are not set by the pipeline task unless the task scope includes "version bump on release" (then state the mechanism).
- **No ESLint changes** for release-pipeline tasks unless the task adds a new script that touches source code.

**Step granularity:**

- Step 1: Package metadata — one step per package; update `package.json` so the package is publishable (entry points to dist, `files`, `publishConfig`).
- Step 2: Build verification — run build, then `npm pack` (or equivalent) in the package directory; verify the tarball contains only intended paths and that `main`/`bin` resolve inside the tarball.
- Step 3: Publish workflow — add or update the workflow file. One step per file. Trigger, jobs, and secret usage must be explicit.
- Step 4: Documentation — include this step when the task scope covers documentation changes (release runbook, CONTRIBUTING release section). One step per doc change. Omit entirely when docs are out of scope.
- Final step: Final verification — run `pnpm lint && pnpm typecheck && pnpm test`. Run the workflow with `--dry-run` to verify it executes without error.

**Tests:** Release-pipeline tasks typically do not add new test files. Verification is via: (a) `npm pack` and inspection of the tarball, (b) CI workflow run (manual or on tag). If the task adds a small script used only by the workflow (e.g. a version-bump helper), and that script has logic worth unit-testing, add a test file and a Tests table row; otherwise the Tests table can list a single row: "Publish dry-run: workflow runs without error and tarball contents are correct."

**Mechanical review (C.5) — N/A for release-pipeline:** Checks B (signature cross-check), C (dependent types), H (constructor branded types), K (library API accuracy), L (wiring accuracy) do not apply. Checks A (ambiguity), D (step count), E (config changes), F (files table — Create only for files that do not exist), G (self-contained), M (simplicity), and the verification steps apply. If the task adds no test file, J (test table ↔ step) is satisfied by the single verification row.

---

## General-purpose recipe (structured fallback when no specialized recipe fits)

Use this recipe when a component does not fit any of the six specialized recipes (adapter, storage, pipeline transformer, composition root, benchmark, release-pipeline). This recipe replaces the previous hard-stop behavior — instead of blocking, the planner follows a more rigorous analysis process that derives the task structure from first principles.

**When to use:** The component's primary concern is not wrapping an external library (adapter), implementing a store interface (storage), transforming content in the pipeline (pipeline transformer), wiring dependencies at the top level (composition root), enriching evaluation data (benchmark), or publishing packages (release-pipeline). Common examples: core domain logic, bootstrap/factory functions, utility extractors, configuration parsers, integration orchestrators, type-only changes, refactoring tasks, test infrastructure.

**Closest-recipe analysis (mandatory — before proceeding):** Identify which specialized recipe is _closest_ to the component and explain specifically what differs. This forces a second look at whether a specialized recipe actually fits before falling through to general-purpose. Record the analysis in the Exploration Report's RECIPE field:

```
RECIPE: general-purpose
CLOSEST RECIPE: [adapter | storage | pipeline | composition-root | benchmark | release-pipeline]
WHY NOT: [specific reason the closest recipe does not fit — not "it's different"]
```

If the closest-recipe analysis reveals the component _does_ fit a specialized recipe after all, switch to that recipe. The general-purpose recipe is the last resort, not the easy path.

### Component characterization (mandatory — 5 dimensions)

Since there is no fixed recipe to provide defaults, the planner must explicitly classify the component along five dimensions. Each dimension triggers specific exploration requirements and determines which template sections apply.

**Critical: every dimension must cite evidence.** Do not assert a dimension based on intuition. For each dimension, state the concrete observation (file path read, Grep result, interface name) that led to the classification. A dimension without evidence is not resolved — it is a guess. Cheaper models produce correct plans when every claim is grounded in tool output; they produce wrong plans when they assert things from training data.

**Dimension 1 — Primary concern (pick exactly one):**

| Concern                   | Description                                                                      | Triggers                                                            |
| ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Pure domain logic         | No I/O, no external deps, pure computation (scoring, classification, formatting) | Stateless constructor analysis                                      |
| Bootstrap/factory         | Creates and returns configured objects for use by composition roots              | Conditional dependency check (O), wiring-style exploration          |
| Integration/orchestration | Coordinates multiple existing components into a workflow                         | Consumer analysis (N), all dependency types explored                |
| Configuration             | Loads, validates, or transforms configuration data                               | Validation boundary check, config schema analysis                   |
| Type/interface definition | Defines new branded types, interfaces, or type aliases — no runtime code         | Minimal: no constructor, no tests beyond typecheck                  |
| Refactoring               | Restructures existing code without changing behavior                             | Consumer analysis (N) for every modified file, regression test plan |
| Test infrastructure       | Test helpers, fixtures, custom matchers, shared test utilities                   | Relaxed layer constraints, no production code changes               |

**Validation gate 1:** After picking a concern, verify it does not overlap with a specialized recipe. Ask: "If I described this concern to someone who knows the six specialized recipes, would they say it fits one?" If yes, switch to that recipe. Common mistake: classifying a component as "pure domain logic" when it actually implements a core interface behind a library → that is an adapter.

**Dimension 2 — Layer placement:**

| Layer        | Constraints triggered                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `core/`      | Strictest: zero imports from adapters, storage, mcp, Node.js APIs, external packages. All I/O through interfaces. |
| `pipeline/`  | Same as core: no I/O, no external imports, interfaces only.                                                       |
| `bootstrap/` | Can import from all shared layers. Can create objects. No external library imports.                               |
| `mcp/`       | Most permissive. Can import everything. Composition root territory.                                               |
| `test/`      | Relaxed constraints. No production code impact.                                                                   |
| Cross-layer  | Multiple layers affected. Each file's layer constraints apply independently.                                      |

**Validation gate 2:** Read the `implementation-spec.md` entry for this component. What layer does the spec place it in? If the spec says `shared/src/adapters/`, the layer is adapter — which means the adapter recipe likely fits (go back to recipe selection). If the spec says `shared/src/pipeline/`, check if it implements `ContentTransformer` before assuming general-purpose. The layer often reveals the correct specialized recipe.

**Dimension 3 — Interface relationship:**

| Relationship                          | Template impact                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implements existing interface         | Interface/Signature section required: paste interface verbatim from source, show implementing class.                                               |
| Defines new interface                 | Interface/Signature section required: show new interface + implementing class. Architecture Notes must justify why no existing interface suffices. |
| Standalone function(s)                | Interface/Signature section required: show full export signature(s) with parameter types and return types.                                         |
| No new code (type-only / refactoring) | Interface/Signature section shows the type definitions or before/after signatures of modified code.                                                |

**Validation gate 3:** If "implements existing interface," Read the interface file right now and paste it into the exploration report. If you cannot find the interface file, the relationship is wrong — re-evaluate. If "defines new interface," Grep `core/interfaces/` for any interface with overlapping method names. Record what you found.

**Dimension 4 — Dependency profile:**

| Profile                       | Exploration triggered                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| None (pure function)          | Constructor section: "None — pure function, no dependencies."                        |
| Interface-only dependencies   | Standard constructor analysis (Clock, IdGenerator, ExecutableDb checklist).          |
| External library dependencies | Full library API verification from installed `.d.ts` (same rigor as adapter recipe). |
| Database access               | Schema analysis + normalization check (same rigor as storage recipe).                |
| Mixed                         | All applicable checks from each profile above.                                       |

**Validation gate 4:** If "none," verify by checking the implementation-spec description. Does it mention any external library, database table, or file system operation? If yes, the profile is not "none." If "external library," check `shared/package.json` — is the library already installed? Read its `.d.ts` now. If "database," read the migration file now.

**Dimension 5 — State model:**

| Model                   | Implication                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Stateless               | No constructor state. Prefer standalone exported functions over classes with one method. |
| Immutable configuration | Config passed to constructor, stored as `private readonly`, never mutated.               |
| Mutable state           | **Red flag.** Architecture Notes must justify why immutable approach is insufficient.    |

**Validation gate 5:** If "stateless," verify the component does not need to remember anything between method calls. Check: does it generate IDs (needs IdGenerator state)? Does it cache results? Does it track configuration? If any of these are true, it is "immutable configuration," not "stateless."

Record all five dimensions with their evidence in the Exploration Report under the **COMPONENT CHARACTERIZATION** section (placed immediately after the RECIPE field).

### Self-correction protocol

After completing the characterization, run this 3-step self-correction before proceeding:

**Step 1 — Recipe re-check:** Re-read the characterization as a whole. Does the combination of dimensions describe a component that actually fits a specialized recipe? Common false negatives:

| Characterization combination                                              | Likely correct recipe                          |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| Interface-only deps + implements existing interface + wraps library calls | **Adapter** (not general-purpose)              |
| Database access + implements `*Store` interface                           | **Storage** (not general-purpose)              |
| Bootstrap/factory + creates instances + lives in `mcp/`                   | **Composition root** (not general-purpose)     |
| Pipeline layer + transforms content + has `fileExtensions`                | **Pipeline transformer** (not general-purpose) |

If any row matches, switch to the specialized recipe now. Do not proceed with general-purpose.

**Step 2 — Evidence audit:** For each dimension, verify the evidence is from a tool call in this session (Read, Grep, Glob output), not from memory or training data. If any evidence is "I know that..." or "Based on the spec..." without a file read, re-read the file now.

**Step 3 — Simplicity check:** Count the total new artifacts the characterization implies (files, types, interfaces). If the count exceeds 4, pause and ask: "Am I overcomplicating this? Could any of these live in existing files?" Run the EXISTING HOME CHECK before proceeding.

### Files pattern (derived, not fixed)

The general-purpose recipe has no fixed files pattern. The planner derives the file list from the characterization:

| Condition                                     | Minimum files                                      |
| --------------------------------------------- | -------------------------------------------------- |
| Single class or function                      | 2: `source.ts` + `source.test.ts`                  |
| New interface needed                          | 3: `interface.ts` + `source.ts` + `source.test.ts` |
| New branded type(s)                           | 1 per type in `core/types/`                        |
| Modifies existing files                       | 1 Modify row per affected file                     |
| Type-only / refactoring (no new runtime code) | 0 Create rows, N Modify rows                       |

**Simplicity constraint:** More than 3 "Create" rows for a single-concern component requires explicit justification in Architecture Notes (same as all recipes — enforced by check M).

**Function vs class decision:** If the component is stateless and has a single public entry point, prefer a standalone exported function over a class. A class is justified when: (a) the component has constructor-injected dependencies, (b) the component has multiple related methods sharing state, or (c) the component implements an existing interface that requires a class shape. Record this decision in Architecture Notes.

### Constructor analysis

Same checklist as all recipes — walk through the standard decision tree:

- Generates timestamps? → needs `Clock`
- Generates entity IDs? → needs `IdGenerator`
- Executes SQL? → needs `ExecutableDb`
- Wraps an external library? → library instance or config
- Reads/writes files? → check layer constraints (core/pipeline ban all I/O)

For general-purpose components, additionally ask:

- **Could this be a standalone function instead of a class?** If stateless + single method → prefer function. Record decision.
- **Could this be added as a method to an existing class or interface?** Check closest existing files in the same layer/directory. Adding a method is simpler than a new file. Record finding.

### Template section applicability

All standard template sections apply. The general-purpose recipe does not replace or rename any section (unlike composition root which replaces Interface/Signature with "Wiring Specification"). Specific guidance per section:

- **Architecture Notes:** Must include: (a) the component characterization (all 5 dimensions), (b) the closest-recipe analysis, (c) the function-vs-class decision, (d) any layer constraint considerations. This section is larger than in specialized recipes because the reader has no recipe context to fall back on.
- **Interface/Signature:** Always required. For standalone functions, show the full `export function` signature with all parameter types and return type. For classes, show the full class declaration with constructor and method signatures.
- **Dependent Types:** Always required when any types are consumed or produced. Use the standard tiered system.
- **Config Changes:** Always check — usually "no change" for general-purpose components.
- **Steps:** Same granularity rules as all recipes (max 2 methods per step, max 1 file per step).
- **Tests:** Required for all components with non-trivial runtime logic. The only exception is type-only tasks (new branded type, interface definition) where `pnpm typecheck` is the sole verification.

### Test strategy (derived from characterization)

Since the general-purpose recipe covers diverse component types, the test strategy is derived from the closest analogy:

| Component resembles        | Test approach                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Adapter (wraps something)  | Mock the wrapped dependency. Verify the adapter translates correctly between domain types and library types.                               |
| Storage (data access)      | In-memory store, deterministic data. Same edge-test checklist as storage recipe (computed columns, idempotency, empty results).            |
| Pipeline (transforms data) | Input/output pairs. Include edge cases: empty input, already-transformed input, boundary content.                                          |
| Pure logic (no deps)       | Example-based tests with no mocking. Cover: happy path, edge cases, error cases. If logic is combinatorial, use parameterized tests.       |
| Bootstrap/factory          | Call the factory with controlled inputs, verify returned objects have correct types and wiring.                                            |
| Refactoring                | Regression tests: existing tests pass unchanged. Add targeted tests for any behavior that was previously untested but is now restructured. |
| Configuration              | Valid config → correct output. Invalid config → specific error. Missing optional fields → defaults applied.                                |

Record the chosen test approach in the Exploration Report's TEST STRATEGY section with the analogy stated: "Closest test analogy: [type]. Approach: [details]."

### Exploration Report additions

Beyond the standard Exploration Report fields, general-purpose tasks add:

```
COMPONENT CHARACTERIZATION:
- Primary concern: [pure domain logic | bootstrap/factory | integration/orchestration | configuration | type/interface definition | refactoring | test infrastructure]
- Layer: [core | pipeline | bootstrap | mcp | test | cross-layer]
- Interface relationship: [implements existing | defines new | standalone function | no new code]
- Dependency profile: [none | interface-only | external library | database | mixed]
- State model: [stateless | immutable config | mutable (JUSTIFY)]

CLOSEST RECIPE ANALYSIS:
- Closest recipe: [name]
- Why it does not fit: [specific reason]
- What is borrowed: [which exploration items or template patterns from the closest recipe are reused]

FUNCTION VS CLASS DECISION:
- Decision: [function | class]
- Reason: [stateless + single method → function | has injected deps → class | implements interface → class | ...]

EXISTING HOME CHECK (mandatory):
- Could this be a method on an existing class? [YES → which class, stop and propose | NO → why not]
- Could this live in an existing file? [YES → which file, stop and propose | NO → why not]
```

The EXISTING HOME CHECK prevents unnecessary file proliferation. If the answer to either question is YES, the planner must propose the simpler approach to the user before creating new files.

### Mechanical review applicability

All universal checks always apply:

| Check                         | Applies | Notes                                                                           |
| ----------------------------- | ------- | ------------------------------------------------------------------------------- |
| A (Ambiguity scan)            | Always  | Same banned patterns as all recipes.                                            |
| B (Signature cross-check)     | Always  | Even for standalone functions — verify export signature matches implementation. |
| C (Dependent types)           | Always  | If no types consumed/produced, "None" is valid only for type-only tasks.        |
| D (Step count)                | Always  | Max 2 methods per step, max 1 file per step.                                    |
| E (Config changes)            | Always  | Usually "None" with no caveats.                                                 |
| F (Files table)               | Always  | No "Create" for existing files.                                                 |
| G (Self-contained)            | Always  | No "see Task NNN" references.                                                   |
| H (Branded types)             | Always  | Constructor params representing domain values use branded types.                |
| I (Verify instructions)       | Always  | Actionable against codebase state at that step.                                 |
| J (Test table ↔ step)         | Always  | Every test in table appears in step instructions and vice versa.                |
| M (Simplicity)                | Always  | >3 Create rows for single-concern component requires justification.             |
| S (Code block API extraction) | Always  | Every method/constructor call verified against source.                          |

Conditional checks — triggered by the component characterization:

| Check                              | Triggered when                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| K (Library API accuracy)           | Dependency profile includes "external library."                                            |
| L (Wiring accuracy)                | Primary concern is "bootstrap/factory" and the component creates instances with `new`.     |
| N (Consumer completeness)          | Task modifies existing interfaces or types (common for refactoring and integration tasks). |
| O (Conditional dependency loading) | Primary concern is "bootstrap/factory" and the component creates conditional resources.    |
| P (Sibling pattern reuse)          | Always — same as all recipes. Check closest sibling in the same layer/directory.           |
| Q (Transformer benchmark)          | Never — not a pipeline transformer.                                                        |
| R (Transformer safety tests)       | Never — not a pipeline transformer.                                                        |
| T (Database normalization)         | Dependency profile includes "database" and the task creates or modifies a migration.       |

### Enhanced user gate (A.5)

Because the general-purpose recipe lacks the domain-specific knowledge of specialized recipes, the A.5 user checkpoint must present the full characterization for explicit user confirmation. The standard A.5 summary is extended with:

> **Recipe:** General-purpose (closest: [name] — does not fit because [reason])
>
> **Characterization:** [primary concern] | [layer] | [interface relationship] | [dependency profile] | [state model]
>
> **Existing home:** [why this cannot live in an existing file/class]

The user must confirm both the design decisions AND the characterization before Pass 2 proceeds. This compensates for the absence of recipe-level automation.

### Auto-mode resilience (making cheaper models succeed)

The general-purpose recipe is designed to work with less capable models (auto mode, fast models) by eliminating judgment calls and making every decision mechanical. This section documents the failure modes that cheaper models hit most often and the countermeasures built into the recipe.

**Why cheaper models struggle without this:** Specialized recipes work well with cheaper models because the recipe provides the structure — the model just fills in blanks. Without a recipe, the model must _derive_ the structure, which requires synthesis and judgment that cheaper models lack. The general-purpose recipe compensates by providing exhaustive decision trees, validation gates, and self-correction checkpoints that turn synthesis into verification.

**Common failure modes and countermeasures:**

| Failure mode                         | What goes wrong                                                               | Built-in countermeasure                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Recipe misclassification             | Model picks general-purpose when a specialized recipe fits                    | Recipe decision tree in SKILL.md A.1.5 + validation gates 1–2 + self-correction Step 1              |
| Dimension assertion without evidence | Model asserts "pure domain logic" without reading any files                   | "Every dimension must cite evidence" rule + validation gates per dimension + self-correction Step 2 |
| Over-engineering                     | Model creates many new files, types, interfaces out of comprehensiveness bias | Simplicity constraint (max 3 Create rows), existing-home check, self-correction Step 3              |
| Training-data hallucination          | Model writes API calls that exist in training data but not in the project     | Check S (code block API extraction) applies to all recipes including general-purpose                |
| Ambiguous instructions               | Model writes "if needed" or "or similar" in step text                         | Check A (ambiguity scan) applies to all recipes including general-purpose                           |
| Missing test strategy                | Model skips tests or writes vague test descriptions                           | "Closest test analogy" table forces a concrete strategy derived from characterization               |
| Wrong layer constraints              | Model imports forbidden packages in core/pipeline code                        | Validation gate 2 forces layer verification against implementation-spec                             |

**Explicit reasoning prompts:** At each stage of the general-purpose recipe, the planner must pause and write one sentence explaining its reasoning before proceeding. This is not for documentation — it is a forcing function that catches errors. Cheaper models that "explain then act" make fewer mistakes than models that "act then rationalize."

- After closest-recipe analysis: "I chose general-purpose over [closest] because [one sentence]."
- After each dimension: "Evidence: [tool call result]. This means [dimension value] because [one sentence]."
- After self-correction: "Re-check passed. No specialized recipe fits because [one sentence]."
- After existing-home check: "New files needed because [one sentence]."
- After function-vs-class decision: "Chose [function/class] because [one sentence]."

These sentences are recorded in the Exploration Report. They serve as audit trail — if the plan is wrong, the sentences reveal where the reasoning went off track.

**When to escalate:** If during the general-purpose recipe process the planner encounters any of these situations, it should tell the user explicitly rather than guessing:

- Two dimensions contradict each other (e.g., "stateless" but needs Clock injection)
- The existing-home check reveals an obvious home but changing that file would be risky
- The closest-recipe analysis is ambiguous (two recipes seem equally close)
- The implementation-spec description is vague or missing for this component
- The self-correction protocol reveals a possible recipe match but the fit is uncertain

In each case, state what was found, what the uncertainty is, and what decision the user needs to make. A plan that stops once for user input is better than a plan that proceeds on a wrong assumption.
