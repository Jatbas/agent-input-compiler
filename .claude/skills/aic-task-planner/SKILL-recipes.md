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

**Identifying a release-pipeline task:** If the component's job is to make a package publishable, add or change a workflow that publishes on tag/release, configure `publishConfig` / `files` / entry points, or document the release process — it is a release-pipeline task. Example: "npm publish pipeline (`@jatbas/aic`)" from Phase V.

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

1. **Package(s) to publish:** Exact npm package name(s) (e.g. `@jatbas/aic`). If multiple (e.g. `@jatbas/aic-core` and `@jatbas/aic`), state publish order (core first if mcp depends on it).

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
- **Workspace dependency and publish order:** If the published package depends on another workspace package (`"@jatbas/aic-core": "workspace:*"`), both packages must be published. `workspace:*` is a pnpm protocol that does not resolve on the npm registry. Use `pnpm publish` (not `npm publish`) — pnpm automatically replaces `workspace:*` with the resolved version at publish time. The dependency must be published first. Record the exact publish order.
- **Existing CI:** Read `.github/workflows/*.yml`. If a publish workflow already exists, the task Modifies it; otherwise Create. Record the exact trigger and job names.
- **SBOM / provenance (Phase 1+):** SBOM generation, `npm publish --provenance` — include in the task only if `documentation/tasks/progress/aic-progress.md` (main workspace only — gitignored) or `documentation/project-plan.md` explicitly calls for them in this component.
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

## Fix/patch recipe (correcting bugs, broken patterns, or deployment behavior)

**When to use:** The task's primary goal is fixing a bug, correcting a broken pattern, changing deployment/installation behavior, or patching incorrect logic in existing code. The key distinction: the task does NOT create a new component — it repairs or adjusts existing components. If the task creates a new adapter/storage/pipeline class as the fix, use the corresponding specialized recipe instead and incorporate the fix-specific checks from this recipe as additional exploration items.

**Identifying a fix/patch task:** If the task description contains "fix", "patch", "correct", "repair", "broken", "bug", or describes an existing behavior that is wrong and needs to change — it is a fix/patch task. Also applies when the task changes deployment scripts, installation behavior, or hook wiring without adding new components.

**Files pattern (derived from the fix scope):**

| Action | Path                                                  |
| ------ | ----------------------------------------------------- |
| Modify | `exact/path/to/broken-file.ts` (what changes)         |
| Modify | `exact/path/to/test-file.test.ts` (assertion updates) |
| Modify | Additional files containing the same broken pattern   |

Fix/patch tasks typically have zero "Create" rows — they modify existing files. If the fix requires creating a new file (e.g., a shared utility extracted during the fix), justify it in Architecture Notes.

### Exploration emphasis: blast radius over design

The primary exploration activity for fix/patch tasks is understanding the **blast radius** of the change — every file, test, config, and script that is affected. This contrasts with build-oriented recipes where the primary activity is designing interfaces and constructors.

**Mandatory exploration items (in addition to the universal checklist):**

1. **Root cause identification:** Read the broken code. Trace the execution path that leads to the bug. Identify the exact line(s) where the behavior diverges from the intended behavior. Record the root cause with file:line citations.

2. **Pattern exhaustiveness (elevated priority for fix tasks — reinforces item 8c):** The broken pattern is the fix task's equivalent of an interface — it defines the scope. After identifying the root cause:
   - Define the exact broken pattern as a regex or structural description.
   - Grep the ENTIRE codebase for all instances. Not just the files the user mentioned. Not just the first few matches.
   - List every instance: `[file]:[line] — [pattern match]`.
   - Classify each: "same root cause" (fix applies) / "different issue" (exclude with justification) / "already correct" (no action needed).
   - The fix MUST cover every "same root cause" instance. Partial fixes are only acceptable when Architecture Notes justify it (e.g., "fixing in deployment script covers all hooks at install time — no per-file fix needed").

3. **Test impact analysis (elevated priority — reinforces items 15 and 15b):** Fix tasks are the highest-risk category for breaking existing tests because they change existing behavior:
   - For every file being modified, grep all test files for references to that file.
   - For every observable side effect of the fix (changed output, different file count, altered directory contents), grep tests for assertions on that state.
   - Compute the new expected values. If a test asserts `=== 12` and the fix changes the count to 19, the task must update the assertion.
   - Function names and test names that encode stale assumptions (e.g., `install_twelve_scripts` when the count is now 19) must be renamed.

4. **Fix verification test:** Design at least one test assertion that:
   - Would FAIL on the current (broken) code
   - Would PASS after the fix is applied
   - Specifically asserts the corrected state, not just "the test suite passes"
     Example: "Read an installed hook file and assert it does not contain `../../shared/`." This catches future regressions against the specific fix.

5. **Idempotency check:** Verify the fix is idempotent — applying it to code that is already fixed produces no change. This is especially important for fixes to deployment/installation scripts where the script may run multiple times.

### Template section applicability

Fix/patch tasks use the standard template with these adjustments:

- **Goal:** One sentence stating what is broken and what the fix achieves. Example: "Fix Cursor hook installation so `require("../../shared/...")` paths are rewritten to `require("./...")` when shared modules are copied to `.cursor/hooks/`."
- **Architecture Notes:** Must include: (a) root cause with file:line citation, (b) why the fix is correct (not just "it works" — why this approach over alternatives), (c) blast radius summary (N files affected, M tests updated).
- **Interface / Signature:** Not always needed. If the fix changes a function signature or adds a new function, include the before/after signatures. If the fix is purely behavioral (same API, different implementation), this section **must be replaced** with a **Behavior Change** section using this exact format:

  ```markdown
  ## Behavior Change

  **Before (broken):** [exact input or trigger] → [exact wrong output or side effect]

  **After (fixed):** [same input or trigger] → [exact correct output or side effect]
  ```

  Example: "Before: `install.cjs` runs on a project that already has `aic-dir.cjs` deployed → cleanup loop deletes `aic-dir.cjs` immediately after copying it. After: `install.cjs` runs on the same project → `aic-dir.cjs` persists because the cleanup loop skips files listed in the shared utilities manifest."

- **Dependent Types:** Include only if the fix changes or adds type dependencies.
- **Files table:** Every file with the broken pattern gets a "Modify" row. Every test file with assertions that become invalid gets a "Modify" row. Zero "Create" rows unless justified.
- **Steps:** Ordered as: (1) fix the code, (2) update affected tests, (3) add fix-verification test assertion, (4) final verification.
- **Tests table:** Must include the fix-verification test case (from exploration item 4 above) in addition to any updated existing test cases.
- **Acceptance criteria:** Must include: "Fix-verification test passes (test that would fail without the fix)." Must NOT include "existing tests pass" without also including test-update steps for every test identified in the TEST IMPACT field.

### Mechanical review applicability

All universal checks apply. Fix-specific check emphasis:

| Check                                 | Fix-specific notes                                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| U (Acceptance criteria achievability) | **Critical for fix tasks.** The most common failure: acceptance criteria reference tests that the fix itself breaks. |
| V (Existing test compatibility)       | **Critical for fix tasks.** Verify every invalidated assertion is addressed in the Files table and Steps.            |
| A (Ambiguity scan)                    | Fix steps must be precise — "fix the pattern" is ambiguous; show the exact regex and replacement.                    |
| F (Files table)                       | No "Create" rows without justification. Fix tasks modify, not create.                                                |
| G (Self-contained)                    | Fix tasks must include the root cause — never "see issue #123" or "as discussed."                                    |
| N (Consumer completeness)             | If the fix changes an interface or type, all consumers must be covered.                                              |
| S (Code block API extraction)         | Every method/constructor call in fix code blocks verified against source.                                            |

Checks B (signature), C (dependent types), H (branded types), K (library API), L (wiring) are conditional on whether the fix touches those artifacts.

### Subagent resilience for fix tasks

Fix tasks are where cheaper models (subagents, fast models) fail most characteristically — they find the first instance of a problem, write a narrow fix, and declare victory. The pattern exhaustiveness scan (exploration item 2) and test impact analysis (item 3) are the primary countermeasures. Both are mandatory and enforced by mechanical checks U and V.

**Common subagent failure modes for fix tasks:**

| Failure mode                           | What goes wrong                                              | Countermeasure                                            |
| -------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| Narrow scope                           | Fixes 2 of 8 affected files                                  | Item 8c + fix exploration item 2 (pattern exhaustiveness) |
| Self-contradicting acceptance criteria | Says "tests pass" while fix breaks tests                     | Check U (acceptance criteria achievability)               |
| Missing test updates                   | Doesn't update hardcoded counts/assertions in existing tests | Items 15 + 15b + check V (existing test compatibility)    |
| No fix verification                    | No test that would fail if the fix were reverted             | Fix exploration item 4 + behavioral change guardrail      |
| Magic number blindness                 | Doesn't grep for the old count or names encoding the count   | Item 15b (quantitative change scan)                       |
| Forward effect blindness               | Doesn't trace who observes the state being changed           | A.4 forward effect simulation                             |

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

**Step 4 — Graduated uncertainty resolution:** Review all exploration findings from Batch A and B. Count items where the evidence is partial, ambiguous, or contradictory (e.g., library API has multiple overloads and it's unclear which applies, an interface method's behavior is ambiguous from the signature alone, a file path referenced in the spec doesn't exist). Classify the count:

- **0 uncertain items:** Proceed normally.
- **1-2 uncertain items:** Investigate inline — read additional source files, trace the code path, check test files for usage examples, or search the web for library documentation. Resolve each before writing the task file. Do not leave uncertainties for the executor.
- **3+ uncertain items:** The component has significant ambiguity that inline investigation cannot efficiently resolve. Delegate to the `aic-researcher` skill for a focused codebase analysis investigation. Read `.claude/skills/aic-researcher/SKILL.md` and run the codebase analysis protocol targeting the uncertain items. Use the research findings to resolve all uncertainties before proceeding. This is more expensive but prevents the executor from hitting blockers on ambiguous task instructions.

This graduated approach ensures cheaper models don't silently write task files with unresolved ambiguities (training data fills in plausible-looking but wrong details). The escalation threshold of 3 balances thoroughness against cost.

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

### Subagent resilience (making cheaper models succeed)

The general-purpose recipe is designed to work with less capable models (subagents, fast models) by eliminating judgment calls and making every decision mechanical. This section documents the failure modes that cheaper models hit most often and the countermeasures built into the recipe.

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

### CJS integration domain notes (supplement — applies when layer is integration/hooks)

When the general-purpose recipe is applied to a task that creates or modifies `.cjs` hook scripts, install scripts (`install.cjs`), or shared utilities in `integrations/`, apply these additional exploration and planning constraints. These do not replace the general-purpose recipe — they supplement it.

**Identifying a CJS integration task:** The target files live in `integrations/claude/`, `integrations/cursor/`, `integrations/shared/`, `.cursor/hooks/`, or `~/.claude/hooks/`. The files are CommonJS (`.cjs`), not TypeScript. There is no core interface to implement and no branded types to use. The recipe is general-purpose with closest-recipe = fix/patch (if modifying behavior) or general-purpose (if adding capability).

**Mandatory exploration items (in addition to the standard checklist):**

1. **Deploy path verification:** For every `.cjs` file the task creates or modifies, determine its deployed path. Hook scripts copied to `~/.claude/hooks/` have a different `require()` depth than scripts in `integrations/claude/plugin/scripts/`. Record the exact resolved path for every `require()` call in each file. A `require("../../../shared/foo.cjs")` that resolves correctly in `integrations/` becomes a wrong path at `~/.claude/hooks/foo.cjs`.

2. **Cleanup loop safety:** Read the cleanup loop in `install.cjs` (both Claude and Cursor installers). The loop deletes any hook file matching a pattern that is NOT in the `AIC_SCRIPT_NAMES` manifest. If the task adds a new `.cjs` file that will be deployed, verify: (a) does the file's name match the cleanup regex? (b) is the file's name in `AIC_SCRIPT_NAMES`? If (a) is YES and (b) is NO, the file will be deleted on every reinstall — this is the exact class of bug that caused the Phase AJ database registration failure.

3. **Manifest registration:** Check `aic-hook-scripts.json` (or equivalent manifest). If the task adds a new hook entry-point script (not a shared utility), it must be added to the manifest. If the task adds a shared utility (deployed alongside hooks but not itself a hook), verify the cleanup loop excludes it — either by name pattern change or an explicit exclusion list.

4. **Shared utility require depth:** Shared utilities (files in `integrations/shared/`) are copied to the deployment directory alongside hook scripts. After copying, they are `require()`d as `require("./utility.cjs")` (same directory). Any task that adds a shared utility must verify all consumers update their require paths from the development path (`require("../../../shared/utility.cjs")`) to the deployed path (`require("./utility.cjs")`). The install script handles the copy — the hooks must handle the require path.

5. **Idempotency verification:** Install scripts run multiple times. Verify the task's changes produce identical end state on first and subsequent runs. Key invariants: files are copied not accumulated, manifests are not duplicated, cleanup loop leaves correct set.

6. **Claude vs Cursor symmetry:** Most hook behavior must be mirrored in both editors. Before scoping a CJS task to one editor only, verify the other editor does not need the same change. If it does, the task must cover both. If the behavior genuinely differs by design (e.g., path conventions), Architecture Notes must document why.

7. **Pack-install smoke test impact:** Read `integrations/__tests__/pack-install-smoke.test.cjs`. If the task changes any of: hook manifests, shared utilities, bundle scripts, package `files` field, install script behavior, or uninstall script behavior — the smoke test assertions must be updated. Add a verification step to the task file: "Run `node integrations/__tests__/pack-install-smoke.test.cjs` and verify all checks pass."

**Template section applicability for CJS integration tasks:**

- **Interface / Signature:** Replace with **Module Exports** — list every `module.exports` assignment with the function signatures (name, parameters with types/shapes, return value). For behavioral fixes, use the **Behavior Change** section from the fix/patch recipe instead.
- **Dependent Types:** Not applicable — CJS modules use plain JS objects, not branded types. Replace with **Data Shapes** — inline JSDoc-style shapes for any structured objects the module reads or writes.
- **Config Changes:** Always check `aic-hook-scripts.json`, `hooks.json`, and any manifest that registers hook names.

**Test strategy for CJS integration tasks:** Unit tests in Jest or equivalent are typically not present for hook scripts. Verification is behavioral:

- Run the install script in a temp directory and verify the deployed file set matches expectations (correct files present, deleted files absent).
- Run the hook script with a representative stdin payload and verify the output.
- Verify idempotency by running install twice and checking state is identical.
- Where a unit test is feasible (pure function extracted from the hook), add it to the test file referenced in the Files table.

---

## Cross-cutting: Documentation impact steps (all non-documentation recipes)

This section applies to every recipe above (adapter, storage, pipeline transformer, composition root, benchmark, release-pipeline, fix-patch, general-purpose, CJS integration). It is NOT a standalone recipe — it is an addendum that activates when the Exploration Report's DOCUMENTATION IMPACT field (from exploration item 21) identifies documentation files needing changes and the user's scope tier includes them.

**When this activates:** The DOCUMENTATION IMPACT field lists one or more files classified as WILL BECOME STALE or NEEDS UPDATE, and the user chose a scope tier that includes documentation changes (Recommended includes MECHANICAL changes; Comprehensive includes both MECHANICAL and SECTION EDIT changes).

**What it adds to the task file:**

1. **Files table rows:** Add a "Modify" row for each documentation file included in scope. Description: "Update [section/reference] to reflect [what changed]."

2. **Steps (appended after all code steps):** One step per documentation file (1-file-per-step rule). Documentation steps always come last — code changes must be complete before documenting them.

   Each documentation step contains a **Change Specification** with three parts:
   - **Current text:** the exact text that will be changed (so the executor can locate it)
   - **Required change:** what needs to change and why (one sentence)
   - **Target text:** the exact replacement text

   For MECHANICAL changes (name/path replacements), the Change Specification is written directly by the planner — no documentation-writer pipeline needed.

   For SECTION EDIT changes (prose rewrite), the planner delegates to the `aic-documentation-writer` skill's Phase 2 (Synthesis + Write) and Phase 3 (Adversarial Review) to produce the target text. Read `.claude/skills/aic-documentation-writer/SKILL.md` sections 2a-2d and 3a-3f. Use the Adaptive Protocol Scaling (section edit level).

3. **Verify lines for documentation steps:** Each documentation step's Verify line includes:
   - Grep the edited document for the old text — expect 0 matches (replaced)
   - Grep the edited document for key terms in the new text — expect matches at the correct location
   - For SECTION EDIT changes: note that the executor will run the documentation-writer's Phase 3 critics on the modified file (see executor §4-mixed)

**What it does NOT change:** The recipe's existing step granularity, Files pattern, exploration checklist, or verification checks. Documentation steps are purely additive — they extend the task without modifying its code structure.

**Step granularity interaction:** The recipe's existing steps handle code. Documentation steps are numbered after the last code step and before the final verification step. Example: if the adapter recipe has Steps 1-4 (config, implement, test, final verification), and documentation impact adds 1 doc file, the steps become 1-4 (code), 5 (documentation), 6 (final verification including doc checks).

---

## Documentation recipe (creating, editing, or improving documentation)

**When to use:** The task creates a new `.md` documentation file, edits existing documentation content, or improves documentation quality (accuracy, completeness, consistency, clarity). This recipe applies when the primary deliverable is documentation, not code. Code-adjacent documentation (inline comments, JSDoc) is NOT covered — that follows the code recipe for the relevant layer.

**Files pattern:**

| Action | Path                                         |
| ------ | -------------------------------------------- |
| Create | `documentation/[name].md` (new document)     |
| Modify | `documentation/[name].md` (edit to existing) |

No test files. No source files. Documentation tasks modify only `.md` files.

### Exploration checklist (Pass 1) — delegated to documentation-writer skill

The documentation recipe delegates exploration to the `aic-documentation-writer` skill's Phase 1 (Deep Analysis). This replaces the planner doing all exploration items itself — instead, 4 specialized subagents investigate in parallel, each focused on one dimension.

**How to run Phase 1:**

1. Read the `aic-documentation-writer` skill files: `.claude/skills/aic-documentation-writer/SKILL.md` and `.claude/skills/aic-documentation-writer/SKILL-dimensions.md`.
2. Follow Phase 1 (sections 1a through 1e) in `SKILL.md`:
   - Pre-read the target document, all sibling documents in `documentation/`, and the skill's dimension templates
   - Spawn 4 explorers in parallel using the templates from `SKILL-dimensions.md`:
     - Explorer 1 — Factual accuracy: cross-references every technical claim against the codebase
     - Explorer 2 — Structure + consistency: parallel sections, mirror documents, cross-doc terms, stale markers
     - Explorer 3 — Audience + writing quality baseline: audience classification, tone profile, quality metrics
     - Explorer 4 — Completeness + gaps: coverage analysis, cross-reference map, gap identification
   - Collect and merge explorer findings (1c)
   - Run gap check (1d) and evidence density check (1e)
3. Use all explorer findings to populate the documentation-specific Exploration Report fields (see Exploration Report additions below).

**What the explorers cover (mapping to the previous items 1-12):**

| Explorer                             | Covers previous items                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explorer 1 (factual accuracy)        | Items 3, 3b (cross-reference against codebase, uncertain claim escalation)                                                                                                   |
| Explorer 2 (structure + consistency) | Items 5, 5b, 5c, 5d, 5e, 11, 12 (structural analysis, parallel sections, ToC validation, scope-adjacent consistency, stale markers, cross-doc term ripple, mirror documents) |
| Explorer 3 (audience + quality)      | Items 1 (partial), 6, 6b, 7 (document reading for tone, audience analysis, information placement, writing quality baseline)                                                  |
| Explorer 4 (completeness + gaps)     | Items 2 (partial), 4, 8, 10 (sibling doc terminology index, completeness analysis, gap identification, cross-reference map)                                                  |

**Deep investigation escalation:** If explorer findings reveal the document needs deep investigation (many inaccuracies, fundamental structural problems, or significant gaps), delegate to the `aic-researcher` skill's documentation analysis protocol BEFORE proceeding to Phase 2. This replaces the previous item 9.

### Exploration Report additions

Beyond standard fields, documentation tasks add:

```
DOCUMENT PROFILE:
- Target: [file path]
- Purpose: [one sentence — what this document is for]
- Audience: [who reads it]
- Current state: [Good with minor issues | Needs significant updates | Fundamentally outdated | New document]
- Tone: [formal/informal, active/passive, technical level]

FACTUAL ACCURACY:
- [claim] — [source] — ACCURATE / INACCURATE / NOT FOUND
(list all checked claims)

COMPLETENESS:
- [topic] — DOCUMENTED / UNDOCUMENTED — [importance]
(list all gaps)

CONSISTENCY:
- [term/concept] — [this doc says X] vs [other doc says Y] — CONSISTENT / INCONSISTENT
(list all cross-document checks)

CROSS-REFERENCE MAP:
- Documents that reference this one: [list with file paths]
- Documents this one references: [list with file paths]
- Invalid references: [list, if any]

WRITING QUALITY BASELINE:
- Passive voice: [low/medium/high]
- Sentence variety: [monotonous/varied]
- Paragraph cohesion: [strong/weak]
- Formatting consistency: [consistent/inconsistent — details]

AUDIENCE CLASSIFICATION:
- Type: [user-facing guide | developer reference | mixed]
- Reasoning: [one sentence — why this classification]
- Mismatches found: [list subsections where detail level does not match audience, or "None"]

PARALLEL SECTION ANALYSIS:
- Parallel pairs identified: [Section A ↔ Section B — both describe X for different targets]
- Subsection inventory:
  | Section A heading | Section B heading | Classification | Status |
  | --- | --- | --- | --- |
  | Trigger Rule | Trigger Rule | shared | ALIGNED |
  | Hooks | Hooks | shared | ALIGNED |
  | (none) | Troubleshooting | unique-B candidate | MISSING IN A — inherent or gap? |
- Shared-concept ordering: [SAME ORDER / MISMATCHED — describe]
- Shared-concept naming: [SAME NAMES / MISMATCHED — list pairs]
- Content parity: [features in A but not B, and vice versa — classify as inherent or gap]
- Density comparison: [Section A: ~N words/subsection, Section B: ~M words/subsection — balanced/imbalanced]
- Unique-concept framing: [A has N unique subsections, B has M unique subsections — balanced/imbalanced]
- Recommendation: [align structure / align naming / reorder shared concepts / justify asymmetry / no action needed]

SCOPE-ADJACENT FINDINGS:
- [concept] — found at [line/section outside target] — STALE / INCONSISTENT / OK
- Action: [in-scope fix / follow-up item]
(list all occurrences of target-section concepts found elsewhere in the document)

STALE MARKERS:
- [marker type: GAP/TODO/FIXME/stale phase ref] — [line/section] — [details]
- In target section: [yes/no] → action: [add change to spec / report as follow-up]
(list all markers found in the full document)

UNCERTAIN CLAIMS:
- [claim] — [reason for uncertainty] — [resolution: investigated inline / delegated to researcher / flagged as blocker]
(list all claims from Explorer 1 that could not be definitively confirmed)

INFORMATION PLACEMENT:
- [subsection] — [audience mismatch: implementation detail in user guide / user instruction in dev reference] — [action: relocate / simplify / keep with justification]
(list all findings from Explorer 3 — audience + writing quality baseline)

CROSS-DOCUMENTATION TERM RIPPLE:
- [old term] → [new term]: grep `documentation/` for old term
  - [file:line] — NON-HISTORICAL (add to scope) / HISTORICAL (leave as-is) — [context]
- Or: No cross-doc ripple — all replaced terms are unique to the target document.
(from Explorer 2 — structure + consistency)

MIRROR DOCUMENT ANALYSIS:
- Mirror sibling: [path] or "No mirror document family detected"
- Section alignment: [heading-by-heading comparison — ALIGNED / MISSING IN TARGET / MISSING IN SIBLING / DIFFERENT NAME / DIFFERENT ORDER]
- Depth comparison: [section] — target ~N words, sibling ~M words — BALANCED / IMBALANCED (2x+)
- Recommendation: [align structure in this task / propose follow-up task for sibling / no action needed]
(from Explorer 2 — structure + consistency)
```

### Task file format (replaces Interface/Signature and Dependent Types)

Documentation tasks replace the code-specific sections with:

**Change Specification** (replaces Interface/Signature):

For each section to edit, provide:

```markdown
## Change Specification

### Change 1: [section heading or line range]

**Current text:**

> [Quote the exact current text that will be changed]

**Required change:** [What needs to change and why — one sentence]

**Target text:**

> [The exact replacement text. Not "improve this" — the actual words.]

### Change N: [...]

[Same format for each change]
```

Every change must have all three parts: current text (so the executor can locate it), rationale (so the executor understands why), and target text (so the executor does not need to make writing decisions).

**Target text production:** After Phase 1 exploration completes and the user approves the Exploration Report (checkpoint A.5), run the documentation-writer skill's Phase 2 (Synthesis + Write) and Phase 3 (Adversarial Review) to produce the target text. Read `.claude/skills/aic-documentation-writer/SKILL.md` sections 2a-2d and 3a-3f. The reviewed target text becomes the Change Specification. The planner wraps it in the task file template (Steps, Files table, Writing Standards, Cross-Reference Map, acceptance criteria).

**Line-break preservation:** Target text must match the source document's line-break structure. If the source uses single-line sentences in a section, keep them single-line; if it uses wrapped paragraphs, preserve that pattern. Do not introduce artificial line breaks at a fixed column width.

**ToC update rule:** If any change adds, removes, or renames a heading, and the document has a Table of Contents, the Change Specification MUST include a dedicated change (or a sub-step within the relevant change) that updates the ToC to match. The ToC change must list both the current ToC text and the target ToC text. Never assume the executor will notice a ToC needs updating — make it explicit.

**Writing Standards** (replaces Dependent Types — see also `.claude/skills/aic-documentation-writer/SKILL-standards.md` for the full reference):

```markdown
## Writing Standards

- **Tone:** [Match existing tone of document — formal/informal, technical level]
- **Audience:** [Who reads this — developers, users, contributors]
- **Audience writing guidance:**
  - User-facing guide: task-oriented language ("Run this command", "Open settings"), short paragraphs, numbered steps for procedures, avoid internal implementation details unless essential for understanding. Every section answers "what do I do?" not "how does it work internally?"
  - Developer reference: precise technical language, type signatures, architecture rationale, component relationships. Assume reader knows the codebase. Every section answers "how and why does this work?"
  - Mixed: clearly separate user instructions from technical details using headings or callout blocks. Label which parts are for which audience.
- **Terminology:** [Key terms that must be used consistently — list with definitions]
- **Formatting:** [Bullet vs prose, code block conventions, heading hierarchy rules, line-break structure (single-line vs wrapped paragraphs)]
- **Cross-reference format:** [How to link to other docs, how to reference code artifacts]
- **Temporal robustness:** Never reference phase names (Phase T, Phase U), task numbers (U06, T14), or temporal milestones ("in the next phase", "recently added") in the document body. These references become stale when the project progresses. Instead, describe capabilities: "AIC supports X" not "Phase T added X". If a feature is incomplete, write "Not yet available" instead of "Will be added in Phase X."
```

**Cross-Reference Map:**

```markdown
## Cross-Reference Map

| Document                 | References this doc   | This doc references | Consistency check         |
| ------------------------ | --------------------- | ------------------- | ------------------------- |
| `project-plan.md`        | Yes — §3 architecture | Yes — ADR-007       | Consistent / needs update |
| `implementation-spec.md` | Yes — component table | No                  | Consistent                |
```

### Pre-verification self-check

Before proceeding to verification, scan the Change Specification target text for temporal references. Grep all target text blocks for: phase heading references (`Phase (?:[A-Z]{1,2}|[0-9]+(?:\.[0-9]+)?)\b` — documentation-writer Dimension 9), task identifiers ("[A-Z][0-9]{2}:"), temporal phrases ("will be added", "in the next", "recently", "upcoming", "future task"). Rewrite any found to use timeless capability descriptions. This ensures the planner's own output does not introduce the staleness it was designed to detect.

### Verification (C.5 equivalent) — delegated to documentation-writer skill Phase 3

Instead of running a single writing quality subagent (the previous check F), the planner delegates verification to the `aic-documentation-writer` skill's Phase 3 (Adversarial Review). This spawns 3-4 parallel critics — each with zero prior context — for editorial quality, factual re-verification, cross-doc consistency, and reader simulation.

**How to run Phase 3:**

1. Read `.claude/skills/aic-documentation-writer/SKILL.md` (Phase 3 sections 3a through 3f).
2. Read `.claude/skills/aic-documentation-writer/SKILL-dimensions.md` (critic prompt templates).
3. Spawn 3-4 critics in parallel using the templates:
   - Critic 1 — Editorial quality: voice/tone match, sentence variety, paragraph cohesion, parallel section symmetry
   - Critic 2 — Factual re-verification: independently re-verifies every technical claim (double-blind, not anchored by Explorer 1)
   - Critic 3 — Cross-document consistency: independently checks terminology alignment across sibling docs
   - Critic 4 — Reader simulation (conditional — user-facing docs only): first-time reader walkthrough
4. Evaluate critic outputs (3d), run double-blind factual reconciliation (3e), apply backward feedback loop if needed (3f).

**In addition to Phase 3, the following mechanical checks still apply:**

| Check                              | What it verifies                                    | Method                                               |
| ---------------------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| A. Factual accuracy                | Every technical claim matches the codebase          | Covered by Critic 2 (factual re-verification)        |
| B. Cross-document consistency      | Terminology matches across all docs                 | Covered by Critic 3 (cross-doc consistency)          |
| C. Link validity                   | All internal references resolve                     | Glob for every linked path                           |
| D. No stale content                | Nothing refers to removed/renamed code              | Grep codebase for each code artifact mentioned       |
| E. Structural coherence            | Heading hierarchy consistent, no orphan sections    | Grep for heading patterns, verify nesting            |
| F. Writing quality                 | Tone matches, varied sentences, cohesive paragraphs | Covered by Critic 1 (editorial quality)              |
| G. Completeness                    | All required topics covered per gap analysis        | Cross-check against exploration's gap identification |
| H. Change specification compliance | Every specified change was applied                  | Diff target text against actual document text        |
| I. Cross-doc term ripple coverage  | No stale old terms remain in non-historical docs    | Grep `documentation/` for each old term replaced     |

Checks A, B, and F are now covered by the documentation-writer's critics (stronger than a single subagent). Checks C-E, G-I remain mechanical (grep/glob) and are run by the planner directly.

### Mechanical review scoring

Score each check 0 (fail) or 1 (pass):

1. Factual accuracy (check A)
2. Cross-document consistency (check B)
3. Link validity (check C)
4. No stale content (check D)
5. Structural coherence (check E)
6. Writing quality (check F)
7. Completeness (check G)
8. Change specification compliance (check H)
9. Cross-doc term ripple coverage (check I)

Target: 9/9 (100%). Fix every failing check before finalizing. Checks A, B, and F are scored based on the documentation-writer's critic outputs (Critic 2, Critic 3, Critic 1 respectively). Checks C-E, G-I are scored based on mechanical grep/glob results.

### Step granularity

- Step 1: Apply changes — one step per document (maximum 1 file per step applies). If the task edits multiple documents, each gets its own step.
- Step 2: Run documentation-writer Phase 3 (adversarial review) — spawn 3-4 critics per the skill's protocol. Fix issues.
- Step 3: Mechanical verification — run checks C-E, G-I from the verification table. Fix failures.
- Final step: Final verification — all checks pass (A, B, F covered by critics; C-E, G-I by mechanical checks).

### When to delegate to the researcher skill

During documentation planning, the planner auto-delegates to the `aic-researcher` skill when:

- The task is "analyze document X for problems" — this IS research (documentation analysis classification)
- The task involves cross-referencing against external standards or best practices — technology evaluation classification
- The task requires understanding how code actually works before documenting it — codebase analysis classification
- Explorer findings from Phase 1 reveal deep issues that the documentation-writer's pipeline cannot resolve (3+ UNCERTAIN claims from Explorer 1, fundamental structural problems from Explorer 2)

The planner does NOT delegate to the researcher when:

- The change is mechanical (update a status, add a row, fix a typo)
- The documentation-writer's explorers already found the correct content
- The task is purely structural (reorder sections, fix heading hierarchy)

**Note:** The documentation-writer skill itself can escalate to the researcher skill when Explorer 1 finds 3+ UNCERTAIN claims. This is built into the documentation-writer's Phase 1 (see `SKILL.md` section 1b, Explorer 1 template).

### Subagent resilience for documentation tasks

Documentation tasks are where cheaper models struggle most compared to Opus — writing quality, nuanced analysis, and cross-document consistency require the kind of holistic reasoning that cheaper models lack. The documentation recipe compensates by delegating to the `aic-documentation-writer` skill, which provides a multi-agent pipeline that surpasses single-model quality.

**How the documentation-writer skill surpasses Opus:**

1. **4 parallel explorers during analysis** — instead of a single agent doing all exploration items, 4 specialized subagents each investigate one dimension in depth. This provides broader coverage AND deeper analysis per dimension than a single Opus pass.
2. **Producer-critic separation** — the writing agent and review agents are different agents. Opus self-evaluates (anchoring bias); the documentation-writer's critics have zero sunk cost in the draft.
3. **Double-blind factual verification** — Explorer 1 verifies facts during analysis, then Critic 2 independently re-verifies during review. Two passes catch more errors than one careful pass. Disagreement triggers investigation.
4. **3-4 adversarial critics** — editorial quality, factual re-verification, cross-doc consistency, and reader simulation are each checked by a focused critic with zero prior context. Opus checks all dimensions in one pass with full anchoring on its own reasoning.
5. **Backward feedback loops** — when critics find issues, the target text is revised and re-checked. Opus cannot iterate on its own output in a single pass.
6. **Reader simulation agent** — a fresh agent with zero project knowledge reads as a first-time user. Opus has to pretend it does not know things it does — the reader simulation agent genuinely does not know.
7. **Explicit tone profile** — Explorer 3 builds a tone profile that the writing agent follows as rules. Cheaper models calibrate tone by feel (unreliable); rules are reproducible.

**Additional structural protections (inherited from previous recipe):**

8. **Explicit writing standards** — the task file specifies tone, audience, terminology, and formatting from `SKILL-standards.md`. The executor follows rules instead of making judgment calls.
9. **Target text in change specifications** — the planner writes the actual words. The executor applies them. This moves the writing burden to the planning phase where the multi-agent protocol ensures quality.
10. **Research delegation for deep analysis** — when explorer findings reveal deep issues, the planner delegates to the `aic-researcher` skill's documentation analysis protocol.
11. **Scope expansion recommendation** — the planner presents 3 scope tiers to the user after exploration, preventing under-scoping and over-scoping.
12. **Content format conventions** — explicit rules in `SKILL-standards.md` for definitions (table for 3+), comparisons (table), procedures (numbered list), and new sections (must update ToC).

The net effect: even cheaper models produce documentation that reads as if Opus wrote it, because the multi-agent pipeline handles the reasoning that a single model pass cannot do alone. The documentation-writer skill is the single source of truth — both planner and executor delegate to it, ensuring identical quality regardless of entry point.
