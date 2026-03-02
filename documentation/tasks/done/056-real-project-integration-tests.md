# Task 056: Real-project integration tests

> **Status:** Done
> **Phase:** Phase K — Quality & Benchmarks
> **Layer:** shared (integration test)
> **Depends on:** Phase J (LanguageProvider suite Done), createFullPipelineDeps, CompilationRunner, createProjectScope, initLanguageProviders

## Goal

Add one integration test that runs the full pipeline (CompilationRunner) with real FileSystemRepoMapSupplier, real language providers, and real config loading against the repository root (process.cwd()). Asserts compilation succeeds, output has expected structure, and second run returns cache hit. Establishes the real-project integration pattern for Phase K; selection and token benchmarks are separate tasks.

## Architecture Notes

- One-off task: no adapter/storage/pipeline/composition-root recipe; structure follows MVP spec §8a (Full pipeline cold cache) and Phase K (run against real project).
- Test uses real createProjectScope, createCachingFileContentReader, createFullPipelineDeps (real RepoMapSupplier), LoadConfigFromFile, applyConfigResult, and initLanguageProviders. No mock RepoMapSupplier.
- Rule pack provider: build in test using shared's loadRulePackFromPath and createProjectFileReader; do not import from mcp. getBuiltInPack returns default pack; getProjectPack returns loadRulePackFromPath(createProjectFileReader(projectRoot), taskClass).
- Project root: toAbsolutePath(process.cwd()). Test assumes run from AIC repo root (pnpm test). .aic is gitignored.
- No snapshot of full compiled output (repo content varies); assert structural invariants only. Vitest timeout 30000ms for first run (real scan and WASM init).

## Files

| Action | Path                                                                |
| ------ | ------------------------------------------------------------------- |
| Create | `shared/src/integration/__tests__/real-project-integration.test.ts` |

## Interface / Signature

N/A — integration test. The test wires CompilationRunner and calls `run(request)`; it does not implement a new interface.

Relevant types (for reference only):

- `CompilationRequest`: intent, projectRoot, modelId, editorId, configPath — shared/src/core/types/compilation-types.ts
- `CompilationRunner.run(request): Promise<{ compiledPrompt: string; meta: CompilationMeta }>` — shared/src/pipeline/compilation-runner.ts

## Dependent Types

Test uses existing types only. Tier 2 (path-only): AbsolutePath (toAbsolutePath), EDITOR_ID (from shared/src/core/types/enums.js). Request shape: intent string, projectRoot AbsolutePath, modelId null, editorId EDITOR_ID.GENERIC, configPath null.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change (test files under **/**tests**/** already have restricted rules relaxed).

## Steps

### Step 1: Implement real-project integration test

Create `shared/src/integration/__tests__/real-project-integration.test.ts`.

- Set projectRoot: `const projectRoot = toAbsolutePath(process.cwd());`
- In a describe block, use a single shared setup: await initLanguageProviders(projectRoot) once (beforeAll or at top of describe), then for each it: createProjectScope(projectRoot), new Sha256Adapter(), LoadConfigFromFile().load(projectRoot, null), applyConfigResult(configResult, scope.configStore, sha256Adapter) to get budgetConfig and heuristicConfig, createCachingFileContentReader(projectRoot), rulePackProvider object with getBuiltInPack() returning { constraints: [], includePatterns: [], excludePatterns: [] } and getProjectPack(projectRootArg, taskClass) returning loadRulePackFromPath(createProjectFileReader(projectRootArg as string), taskClass), createFullPipelineDeps(fileContentReader, rulePackProvider, budgetConfig, providers, heuristicConfig), new CompilationRunner(deps, scope.clock, scope.cacheStore, scope.configStore, sha256Adapter, scope.guardStore, scope.compilationLogStore, scope.idGenerator). Build CompilationRequest: intent "refactor auth module to use middleware pattern", projectRoot, modelId null, editorId EDITOR_ID.GENERIC, configPath null.
- Test real_project_compile_succeeds: await runner.run(request); expect(result.compiledPrompt.length).toBeGreaterThan(0); expect(result.meta).toBeDefined(); expect(typeof result.meta.cacheHit).toBe("boolean"); expect(result.meta.durationMs).toBeDefined(). Use it(..., 30000) for timeout.
- Test real_project_compile_output_has_expected_structure: same run; expect(result.compiledPrompt).toContain("## Task"); expect(result.compiledPrompt).toContain("## Context").
- Test real_project_second_run_cache_hit: same runner and request; const first = await runner.run(request); const second = await runner.run(request); expect(second.meta.cacheHit).toBe(true).
- Import only from shared (path aliases #core, #pipeline, #adapters, #storage and relative paths for config and bootstrap) and node:path; do not import from mcp or cli. Use toAbsolutePath from #core/types/paths.js, EDITOR_ID from #core/types/enums.js, type TaskClass from #core/types/enums.js, createProjectScope from #storage/create-project-scope.js, createCachingFileContentReader from #adapters/caching-file-content-reader.js, createFullPipelineDeps from ../../bootstrap/create-pipeline-deps.js, CompilationRunner from #pipeline/compilation-runner.js, initLanguageProviders from #adapters/init-language-providers.js, LoadConfigFromFile and applyConfigResult from ../../config/load-config-from-file.js, loadRulePackFromPath from #core/load-rule-pack.js, createProjectFileReader from #adapters/project-file-reader-adapter.js, Sha256Adapter from #adapters/sha256-adapter.js. RulePackProvider type from #core/interfaces/rule-pack-provider.interface.js.

**Verify:** Run `pnpm test shared/src/integration/__tests__/real-project-integration.test.ts`; all three tests pass.

### Step 2: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                          | Description                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| real_project_compile_succeeds                      | CompilationRunner.run with real wiring and projectRoot = cwd succeeds |
| real_project_compile_output_has_expected_structure | compiledPrompt contains "## Task" and "## Context"                    |
| real_project_second_run_cache_hit                  | Second run with same request has meta.cacheHit true                   |

## Acceptance Criteria

- [ ] shared/src/integration/**tests**/real-project-integration.test.ts exists
- [ ] Test wires real createProjectScope, createFullPipelineDeps, initLanguageProviders, LoadConfigFromFile, applyConfigResult; builds rulePackProvider from loadRulePackFromPath and createProjectFileReader (no mcp import)
- [ ] real_project_compile_succeeds, real_project_compile_output_has_expected_structure, real_project_second_run_cache_hit pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass including real-project-integration
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from mcp/ or cli/ in the test file

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
