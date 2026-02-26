# Task 024: Full pipeline test

> **Status:** Done
> **Phase:** H (Integration tests)
> **Layer:** shared (pipeline, adapter, storage) + mcp + cli
> **Depends on:** Golden snapshot tests, InspectRunner, pipeline Steps 1–8, compile handler, compile command

## Goal

Implement the real CompilationRunner (run pipeline steps 1–8, assemble prompt, cache lookup/set), extend Clock for cache TTL and duration, add StringHasher adapter for cache keys, move project-scope creation to shared so CLI can build the runner, wire the runner in MCP and CLI, and add an integration test that snapshots compiled output and asserts determinism and cache hit per MVP Test Plan §8a.

## Architecture Notes

- ADR-007 (UUIDv7), ADR-008 (timestamps), ADR-009 (validation at boundary). Pipeline: one public method per class; dependencies via constructor injection.
- CompilationRunner reuses the same pipeline flow as InspectRunner (classify → resolve → allocate → getRepoMap → select → guard → transform → ladder → assemble); adds cache key computation (intent + projectRoot + fileTreeHash + configHash), cache get/set, and CompilationMeta build.
- ensureAicDir and createProjectScope move from mcp/server.ts to shared so CLI can build project scope without importing from mcp. ESLint allows node:fs and node:path in those two shared storage files only.
- Cache key: stringHasher.hash(intent + "\0" + projectRoot + "\0" + fileTreeHash + "\0" + (configHash ?? "")). File tree hash: stringHasher.hash(serializeRepoMap(repoMap)) with files sorted by path.

## Files

| Action | Path                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/string-hasher.interface.ts`                                                                      |
| Create | `shared/src/adapters/sha256-adapter.ts`                                                                                      |
| Create | `shared/src/pipeline/compilation-runner.ts`                                                                                  |
| Create | `shared/src/pipeline/__tests__/compilation-runner.test.ts`                                                                   |
| Create | `shared/src/storage/ensure-aic-dir.ts`                                                                                       |
| Create | `shared/src/storage/create-project-scope.ts`                                                                                 |
| Create | `shared/src/integration/__tests__/full-pipeline.test.ts`                                                                     |
| Modify | `shared/src/core/interfaces/clock.interface.ts` (add addMinutes, durationMs)                                                 |
| Modify | `shared/src/adapters/system-clock.ts` (implement addMinutes, durationMs)                                                     |
| Modify | `eslint.config.mjs` (node:crypto only in sha256-adapter; node:fs/node:path in ensure-aic-dir.ts and create-project-scope.ts) |
| Modify | `mcp/src/server.ts` (import ensureAicDir and createProjectScope from shared; replace stubRunner with CompilationRunner)      |
| Modify | `cli/src/main.ts` (build CompilationRunner via createProjectScope for compile action)                                        |

## Interface / Signature

```typescript
// CompilationRunner — Source: shared/src/core/interfaces/compilation-runner.interface.ts
import type { CompilationRequest } from "#core/types/compilation-types.js";
import type { CompilationMeta } from "#core/types/compilation-types.js";

export interface CompilationRunner {
  run(request: CompilationRequest): Promise<{
    compiledPrompt: string;
    meta: CompilationMeta;
  }>;
}
```

```typescript
// StringHasher — new interface at shared/src/core/interfaces/string-hasher.interface.ts
export interface StringHasher {
  hash(input: string): string;
}
```

```typescript
// Clock (modified) — shared/src/core/interfaces/clock.interface.ts
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { Milliseconds } from "#core/types/units.js";

export interface Clock {
  now(): ISOTimestamp;
  addMinutes(minutes: number): ISOTimestamp;
  durationMs(start: ISOTimestamp, end: ISOTimestamp): Milliseconds;
}
```

```typescript
// CompilationRunner class — shared/src/pipeline/compilation-runner.ts
// Import interface as ICompilationRunner to avoid self-reference; implement it.
import type { CompilationRunner as ICompilationRunner } from "#core/interfaces/compilation-runner.interface.js";
import type { CompilationRequest } from "#core/types/compilation-types.js";
import type { CompilationMeta } from "#core/types/compilation-types.js";
import type { IntentClassifier } from "#core/interfaces/intent-classifier.interface.js";
import type { RulePackResolver } from "#core/interfaces/rule-pack-resolver.interface.js";
import type { BudgetAllocator } from "#core/interfaces/budget-allocator.interface.js";
import type { ContextSelector } from "#core/interfaces/context-selector.interface.js";
import type { ContextGuard } from "#core/interfaces/context-guard.interface.js";
import type { ContentTransformerPipeline } from "#core/interfaces/content-transformer-pipeline.interface.js";
import type { SummarisationLadder } from "#core/interfaces/summarisation-ladder.interface.js";
import type { PromptAssembler } from "#core/interfaces/prompt-assembler.interface.js";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { Clock } from "#core/interfaces/clock.interface.js";
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import type { CacheStore } from "#core/interfaces/cache-store.interface.js";
import type { ConfigStore } from "#core/interfaces/config-store.interface.js";
import type { StringHasher } from "#core/interfaces/string-hasher.interface.js";

export class CompilationRunner implements ICompilationRunner {
  constructor(
    private readonly intentClassifier: IntentClassifier,
    private readonly rulePackResolver: RulePackResolver,
    private readonly budgetAllocator: BudgetAllocator,
    private readonly contextSelector: ContextSelector,
    private readonly contextGuard: ContextGuard,
    private readonly contentTransformerPipeline: ContentTransformerPipeline,
    private readonly summarisationLadder: SummarisationLadder,
    private readonly promptAssembler: PromptAssembler,
    private readonly repoMapSupplier: RepoMapSupplier,
    private readonly clock: Clock,
    private readonly tokenCounter: TokenCounter,
    private readonly cacheStore: CacheStore,
    private readonly configStore: ConfigStore,
    private readonly stringHasher: StringHasher,
  ) {}

  run(
    request: CompilationRequest,
  ): Promise<{ compiledPrompt: string; meta: CompilationMeta }> {
    // Implement per Step 6 (cache key, get/set, pipeline run, meta build).
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// CompilationRequest, CompilationMeta, CachedCompilation — shared/src/core/types/compilation-types.ts (see existing file for full definitions)
// CompilationRequest: intent, projectRoot (AbsolutePath), modelId, editorId, configPath, optional session fields.
// CompilationMeta: intent, taskClass, filesSelected, filesTotal, tokensRaw, tokensCompiled, tokenReductionPct, cacheHit, durationMs, modelId, editorId, transformTokensSaved, summarisationTiers, guard.
// CachedCompilation: key, compiledPrompt, tokenCount, createdAt, expiresAt, fileTreeHash, configHash.
```

### Tier 1 — signature + path

| Type                                                                                                                                                                                | Path                                                 | Members | Purpose                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------- | ----------------------------------- |
| CacheStore                                                                                                                                                                          | shared/src/core/interfaces/cache-store.interface.ts  | 4       | get, set, invalidate, invalidateAll |
| ConfigStore                                                                                                                                                                         | shared/src/core/interfaces/config-store.interface.ts | 2       | getLatestHash, writeSnapshot        |
| IntentClassifier, RulePackResolver, BudgetAllocator, ContextSelector, ContextGuard, ContentTransformerPipeline, SummarisationLadder, PromptAssembler, RepoMapSupplier, TokenCounter | same as InspectRunner                                | —       | Passed to constructor               |

### Tier 2 — path-only

| Type                                 | Path                                 | Factory                                    |
| ------------------------------------ | ------------------------------------ | ------------------------------------------ |
| AbsolutePath, FilePath, RelativePath | shared/src/core/types/paths.ts       | toAbsolutePath, toFilePath, toRelativePath |
| TokenCount, Milliseconds             | shared/src/core/types/units.ts       | toTokenCount, toMilliseconds               |
| ISOTimestamp                         | shared/src/core/types/identifiers.ts | toISOTimestamp                             |
| TaskClass, EditorId, InclusionTier   | shared/src/core/types/enums.ts       | TASK_CLASS, EDITOR_ID, INCLUSION_TIER      |
| Percentage                           | shared/src/core/types/scores.ts      | toPercentage                               |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** Apply the following two changes.

  **(1) node:crypto — only sha256-adapter.ts may import.** In the existing block that has comment "Adapters: only typescript-provider.ts may import typescript", add `"shared/src/adapters/sha256-adapter.ts"` to the `ignores` array (so the array has five entries: typescript-provider, tiktoken-adapter, fast-glob-adapter, ignore-adapter, sha256-adapter). In the same block’s `paths` array, add:

  ```javascript
  {
    name: "node:crypto",
    message: "Only sha256-adapter.ts may import node:crypto.",
  },
  ```

  **(2) Storage: allow node:fs and node:path in ensure-aic-dir and create-project-scope.** Add a new block **after** the main storage boundary block (the one with `files: ["shared/src/storage/**/*.ts"]`), so it overrides for the two named files:

  ```javascript
  // ─── Storage: ensure-aic-dir and create-project-scope may use node:fs/node:path ───
  {
    files: [
      "shared/src/storage/ensure-aic-dir.ts",
      "shared/src/storage/create-project-scope.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "node:fs/promises", message: "Storage receives an open Database. Composition root handles FS." },
            { name: "node:crypto", message: "Use a Hasher interface. Crypto is wrapped in adapters/." },
            { name: "crypto", message: "Use a Hasher interface. Crypto is wrapped in adapters/." },
            { name: "zod", message: "Zod validates at boundaries only (MCP/CLI/config). See ADR-009." },
            { name: "tiktoken", message: "Use the Tokenizer interface. External libs are wrapped in adapters/." },
            { name: "fast-glob", message: "Use the GlobProvider interface. External libs are wrapped in adapters/." },
            { name: "ignore", message: "Use the IgnoreProvider interface. External libs are wrapped in adapters/." },
            { name: "typescript", message: "Use LanguageProvider interface." },
          ],
          patterns: [
            BAN_RELATIVE_PARENT,
            { group: ["@aic/cli", "@aic/cli/*", "**/cli/**"], message: "Storage must not import CLI code." },
            { group: ["@aic/mcp", "@aic/mcp/*", "**/mcp/**"], message: "Storage must not import MCP code." },
            { group: ["**/pipeline/**"], message: "Storage must not import pipeline code." },
            { group: ["**/adapters/**"], message: "Storage must not import adapters." },
          ],
        },
      ],
    },
  },
  ```

  (This omits node:fs, fs, node:path, path from the paths list so those two files are allowed to import them; other storage restrictions stay.)

## Steps

### Step 1: StringHasher interface

Create `shared/src/core/interfaces/string-hasher.interface.ts` with a single export: interface StringHasher { hash(input: string): string; }.

**Verify:** File exists; pnpm typecheck passes.

### Step 2: Sha256Adapter

Create `shared/src/adapters/sha256-adapter.ts`. Implement StringHasher. Constructor takes no arguments. hash(input: string): string uses createHash from node:crypto: createHash("sha256").update(input, "utf8").digest("hex").

**Verify:** File exists; pnpm typecheck passes.

### Step 3: ESLint node:crypto restriction

In eslint.config.mjs, add an adapter block so that only sha256-adapter.ts may import node:crypto. Copy the structure of the existing "only typescript-provider may import typescript" block: files shared/src/adapters/\*_/_.ts, ignores list that includes shared/src/adapters/sha256-adapter.ts (so all other adapter files are restricted), paths include node:crypto with message "Only sha256-adapter.ts may import node:crypto" plus all other adapter boundary paths (better-sqlite3, zod, tiktoken, fast-glob, ignore, typescript). Add node:crypto to the paths in the block that currently ignores tiktoken, fast-glob, ignore, typescript — and add sha256-adapter.ts to that block’s ignores list so sha256-adapter is the only file allowed node:crypto.

**Verify:** pnpm lint passes; changing sha256-adapter to not import node:crypto causes lint to fail for that file when it uses crypto elsewhere.

### Step 4: Clock interface

In `shared/src/core/interfaces/clock.interface.ts`, add addMinutes(minutes: number): ISOTimestamp and durationMs(start: ISOTimestamp, end: ISOTimestamp): Milliseconds. Add import for Milliseconds from #core/types/units.js.

**Verify:** File exports Clock with now, addMinutes, durationMs; pnpm typecheck passes.

### Step 5: SystemClock implement addMinutes and durationMs

In `shared/src/adapters/system-clock.ts`, implement addMinutes(minutes: number): return ISOTimestamp for now + minutes (use Date for arithmetic; this file is the single place for time). Implement durationMs(start, end): parse start and end as Date, return toMilliseconds(end.getTime() - start.getTime()).

**Verify:** SystemClock implements Clock; pnpm typecheck passes.

### Step 6: CompilationRunner implementation

Create `shared/src/pipeline/compilation-runner.ts`. Class CompilationRunner implements CompilationRunner interface. Constructor: intentClassifier, rulePackResolver, budgetAllocator, contextSelector, contextGuard, contentTransformerPipeline, summarisationLadder, promptAssembler, repoMapSupplier, clock, tokenCounter, cacheStore, configStore, stringHasher (all typed by interfaces). run(request): (1) Get repoMap via repoMapSupplier.getRepoMap(request.projectRoot). (2) Compute fileTreeHash = stringHasher.hash(serializeRepoMap(repoMap)) where serializeRepoMap sorts repoMap.files by path and joins path, sizeBytes, lastModified with "|". (3) configHash = configStore.getLatestHash() ?? "". (4) key = stringHasher.hash([request.intent, request.projectRoot, fileTreeHash, configHash].join("\0")). (5) cached = cacheStore.get(key). If cached: build CompilationMeta (cacheHit true, durationMs toMilliseconds(0)), return { compiledPrompt: cached.compiledPrompt, meta }. (6) Else: start = clock.now(); run pipeline (classify, resolve, allocate, contextSelector.selectContext, contextGuard.scan, contentTransformerPipeline.transform, summarisationLadder.compress, promptAssembler.assemble with OUTPUT_FORMAT.UNIFIED_DIFF); end = clock.now(); build CompilationMeta (filesSelected, filesTotal, tokensRaw, tokensCompiled, tokenReductionPct, cacheHit false, durationMs clock.durationMs(start,end), modelId request.modelId ?? "", editorId request.editorId, transformTokensSaved, summarisationTiers, guard); cacheStore.set({ key, compiledPrompt, tokenCount: promptTotal, createdAt: start, expiresAt: clock.addMinutes(60), fileTreeHash, configHash }); return { compiledPrompt, meta }.

**Verify:** pnpm typecheck passes; no imports from adapters/storage except interfaces.

### Step 7: CompilationRunner unit tests

Create `shared/src/pipeline/__tests__/compilation-runner.test.ts`. Mock CacheStore (get returns null first time; set stores entry; second get returns stored entry for same key). Mock ConfigStore (getLatestHash returns null). Mock StringHasher (hash(x) returns "h-" + x.length or fixed string). Mock Clock (now returns fixed ISOTimestamp, addMinutes returns same, durationMs returns toMilliseconds(0)). Mock RepoMapSupplier (returns fixture RepoMap with two files). Wire real pipeline steps (same as golden-snapshot test). Test first_run_returns_compiled_prompt_and_meta_cache_miss: run once, assert meta.cacheHit false and compiledPrompt is non-empty string. Test second_run_same_key_returns_cache_hit: run twice with same request, assert second result meta.cacheHit true and compiledPrompt equals first. Test repo_map_supplier_throws_run_rejects: mock getRepoMap to throw, assert run(request) rejects.

**Verify:** pnpm test shared/src/pipeline/**tests**/compilation-runner.test.ts passes.

### Step 8a: ensureAicDir in shared

Create `shared/src/storage/ensure-aic-dir.ts`. Export function ensureAicDir(projectRoot: AbsolutePath): AbsolutePath that creates .aic inside projectRoot with fs.mkdirSync(..., { recursive: true, mode: 0o700 }) and returns toAbsolutePath of that path. Use node:fs and node:path. Add ESLint override so this file is allowed node:fs and node:path (storage block that targets only this file).

**Verify:** File exists; pnpm typecheck passes.

### Step 8b: createProjectScope in shared

Create `shared/src/storage/create-project-scope.ts`. Export interface ProjectScope with db, clock, idGenerator, cacheStore, telemetryStore, configStore, guardStore, projectRoot (same types as in mcp/server.ts). Export function createProjectScope(projectRoot: AbsolutePath): ProjectScope that calls ensureAicDir(projectRoot), builds dbPath and cacheDir, opens database via openDatabase, instantiates SqliteCacheStore, SqliteTelemetryStore, SqliteConfigStore, SqliteGuardStore, SystemClock, UuidV7Generator, and returns the scope object. Use node:fs and node:path where needed. Add ESLint override for this file to allow node:fs and node:path.

**Verify:** File exists; pnpm typecheck passes; createProjectScope returns object with all scope fields.

### Step 8c: MCP server import scope from shared

In `mcp/src/server.ts`, remove the local ensureAicDir and createProjectScope implementations and the local ProjectScope interface. Import ensureAicDir and createProjectScope from @aic/shared/storage/ensure-aic-dir.js and @aic/shared/storage/create-project-scope.js (or the appropriate shared path). Use createProjectScope(projectRoot) where scope is currently built locally.

**Verify:** pnpm typecheck and pnpm test mcp/src/**tests**/server.test.ts pass.

### Step 9: Wire CompilationRunner in MCP server

In `mcp/src/server.ts`, instantiate Sha256Adapter, then instantiate CompilationRunner with intentClassifier, rulePackResolver, budgetAllocator, heuristicSelector, contextGuard, contentTransformerPipeline, summarisationLadder, promptAssembler, stubRepoMapSupplier, scope.clock, tiktokenAdapter, scope.cacheStore, scope.configStore, sha256Adapter. Replace stubRunner with this instance. Pass it to createCompileHandler.

**Verify:** pnpm typecheck passes; server.test.ts list_tools and stub_compile tests still pass (compile may still return stub or run; if RepoMapSupplier rejects, handler returns error).

### Step 10: Wire CompilationRunner in CLI

In `cli/src/main.ts`, for the compile command action: resolve projectRoot from args (same as other commands), call createProjectScope(projectRoot) from shared, build the same pipeline objects as in MCP (intentClassifier, rulePackResolver, budgetAllocator, heuristicSelector, contextGuard, contentTransformerPipeline, summarisationLadder, promptAssembler), use stubRepoMapSupplier (getRepoMap rejects), instantiate CompilationRunner with scope.cacheStore, scope.configStore, Sha256Adapter, and the pipeline deps. Pass this runner to compileCommand(args, runner). Replace the current stubRunner for compile with this.

**Verify:** pnpm typecheck passes; pnpm test cli/src/commands/**tests**/compile.test.ts passes.

### Step 11: Full-pipeline integration test

Create `shared/src/integration/__tests__/full-pipeline.test.ts`. Use same fixture root as golden-snapshot (test/benchmarks/repos/1). Build deterministic RepoMap, mock RepoMapSupplier, mock Clock (fixed now, addMinutes, durationMs), FileContentReader that reads from fixture, in-memory CacheStore (object with get/set storing last entry by key), ConfigStore mock (getLatestHash returns null). Wire all pipeline steps and CompilationRunner (real Sha256Adapter). Build CompilationRequest: intent "refactor auth module to use middleware pattern", projectRoot fixture, modelId null, editorId EDITOR_ID.GENERIC, configPath null. Test full_pipeline_compiled_output_matches_snapshot: run once, expect(result.compiledPrompt).toMatchSnapshot(). Test full_pipeline_deterministic: run twice, expect first and second result deep-equal. Test full_pipeline_second_run_cache_hit: run twice with same request, assert second result meta.cacheHit true and second result meta.durationMs equals toMilliseconds(0) (mock Clock returns zero duration).

**Verify:** pnpm test shared/src/integration/**tests**/full-pipeline.test.ts passes; snapshot file created under **snapshots**.

### Step 12: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                             | Description                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| first_run_returns_compiled_prompt_and_meta_cache_miss | First run returns non-empty compiledPrompt and meta with cacheHit false         |
| second_run_same_key_returns_cache_hit                 | Second run with same request returns meta.cacheHit true and same compiledPrompt |
| repo_map_supplier_throws_run_rejects                  | When RepoMapSupplier.getRepoMap throws, run(request) rejects                    |
| full_pipeline_compiled_output_matches_snapshot        | Integration test: compiled output matches golden snapshot                       |
| full_pipeline_deterministic                           | Integration test: two runs produce deep-equal result                            |
| full_pipeline_second_run_cache_hit                    | Integration test: second run has meta.cacheHit true and small durationMs        |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] CompilationRunner implements interface; Clock has addMinutes and durationMs; StringHasher implemented in Sha256Adapter
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files (system-clock, ensure-aic-dir/create-project-scope if they need date)
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
