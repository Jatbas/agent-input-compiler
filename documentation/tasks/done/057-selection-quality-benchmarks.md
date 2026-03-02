# Task 057: Selection quality benchmarks

> **Status:** Done
> **Phase:** Phase K — Quality & Benchmarks
> **Layer:** shared (integration test)
> **Depends on:** Real-project integration tests (task 056), createFullPipelineDeps, InspectRunner, createProjectScope, initLanguageProviders

## Goal

Add selection quality benchmarks: for canonical task 1, run the pipeline (InspectRunner) against the fixture repo and assert that the set of selected file paths matches a committed expected baseline. Establishes the selection-baseline pattern for Phase K; token reduction benchmarks are a separate task.

## Architecture Notes

- One-off task: no adapter/storage/pipeline/composition-root recipe; structure follows MVP spec §5 Benchmark Suite and Phase K.
- Test reuses the same wiring as real-project-integration (createProjectScope, createFullPipelineDeps, initLanguageProviders, LoadConfigFromFile, applyConfigResult, rulePackProvider) with projectRoot set to fixture repo 1; builds InspectRunner instead of CompilationRunner.
- Expected selection lives in test/benchmarks/expected-selection/1.json (intent + selectedPaths). Comparison is set equality on path strings only; order-independent.
- Only canonical task 1 is in scope (fixture repos 2–10 do not exist yet). Pattern extends when those repos are added.

## Files

| Action | Path                                                                   |
| ------ | ---------------------------------------------------------------------- |
| Create | `test/benchmarks/expected-selection/1.json`                            |
| Create | `shared/src/integration/__tests__/selection-quality-benchmark.test.ts` |

## Interface / Signature

N/A — integration test. The test wires InspectRunner and calls `inspect(request)`; it does not implement a new interface.

Relevant types (for reference only):

- `InspectRequest`: intent, projectRoot, configPath, dbPath — shared/src/core/types/inspect-types.ts
- `InspectRunner.inspect(request): Promise<PipelineTrace>` — shared/src/core/interfaces/inspect-runner.interface.ts
- `PipelineTrace.selectedFiles`: readonly SelectedFile[] — shared/src/core/types/inspect-types.ts
- `SelectedFile.path`: RelativePath — shared/src/core/types/selected-file.ts

## Dependent Types

Test uses existing types only. Tier 2 (path-only): AbsolutePath (toAbsolutePath), FilePath (toFilePath). Request: intent string, projectRoot AbsolutePath, configPath null, dbPath FilePath from path.join(projectRoot, ".aic", "aic.sqlite").

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change (test files under **/**tests**/** already have restricted rules relaxed; test/benchmarks/ already ignored).

## Steps

### Step 1: Create expected selection baseline for canonical task 1

Create directory `test/benchmarks/expected-selection/` and file `test/benchmarks/expected-selection/1.json` with content:

```json
{
  "intent": "refactor auth module to use middleware pattern",
  "selectedPaths": ["src/auth/service.ts", "src/index.ts"]
}
```

Canonical task 1 (MVP spec §5) uses intent "refactor auth module to use middleware pattern" and fixture repo test/benchmarks/repos/1; the two files in that repo are the expected selection.

**Verify:** File exists at test/benchmarks/expected-selection/1.json.

### Step 2: Implement selection quality benchmark test

Create `shared/src/integration/__tests__/selection-quality-benchmark.test.ts`.

- Fixture root: `const fixtureRoot = toAbsolutePath(path.join(process.cwd(), "test", "benchmarks", "repos", "1"));` (use path from node:path).
- beforeAll: `providers = await initLanguageProviders(fixtureRoot as string);`
- For the test: createProjectScope(fixtureRoot), new Sha256Adapter(), LoadConfigFromFile().load(fixtureRoot, null), applyConfigResult(configResult, scope.configStore, sha256Adapter) to get budgetConfig and heuristicConfig, createCachingFileContentReader(fixtureRoot as string), rulePackProvider with getBuiltInPack() returning { constraints: [], includePatterns: [], excludePatterns: [] } and getProjectPack(projectRootArg, taskClass) returning loadRulePackFromPath(createProjectFileReader(projectRootArg as string), taskClass), createFullPipelineDeps(fileContentReader, rulePackProvider, budgetConfig, providers, heuristicConfig), new InspectRunner(deps, scope.clock).
- Build InspectRequest: intent "refactor auth module to use middleware pattern", projectRoot fixtureRoot, configPath null, dbPath toFilePath(path.join(fixtureRoot as string, ".aic", "aic.sqlite")).
- Run trace = await runner.inspect(request).
- Read expected baseline: fs.readFileSync(path.join(process.cwd(), "test", "benchmarks", "expected-selection", "1.json"), "utf8"), JSON.parse to get object with selectedPaths: string[].
- Assert order-independent set equality: actualPaths = trace.selectedFiles.map((f) => f.path as string) sorted; expectedPaths = baseline.selectedPaths sorted; expect(actualPaths).toEqual(expectedPaths).
- Test name: selection_quality_task1_matches_baseline. Use it(..., 30_000) for timeout.
- Import only from shared (path aliases #core, #pipeline, #adapters, #storage and relative paths for config and bootstrap) and node:path, node:fs; do not import from mcp or cli. Use toAbsolutePath, toFilePath from #core/types/paths.js, createProjectScope from #storage/create-project-scope.js, createCachingFileContentReader from #adapters/caching-file-content-reader.js, createFullPipelineDeps from ../../bootstrap/create-pipeline-deps.js, InspectRunner from #pipeline/inspect-runner.js, initLanguageProviders from #adapters/init-language-providers.js, LoadConfigFromFile and applyConfigResult from ../../config/load-config-from-file.js, loadRulePackFromPath from #core/load-rule-pack.js, createProjectFileReader from #adapters/project-file-reader-adapter.js. RulePackProvider type from #core/interfaces/rule-pack-provider.interface.js, type TaskClass from #core/types/enums.js.

**Verify:** Run `pnpm test shared/src/integration/__tests__/selection-quality-benchmark.test.ts`; the test selection_quality_task1_matches_baseline passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                | Description                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| selection_quality_task1_matches_baseline | InspectRunner.inspect for canonical task 1; selected paths match expected-selection/1.json (set equality) |

## Acceptance Criteria

- [ ] test/benchmarks/expected-selection/1.json exists with intent and selectedPaths for task 1
- [ ] shared/src/integration/**tests**/selection-quality-benchmark.test.ts exists
- [ ] Test wires real createProjectScope, createFullPipelineDeps, initLanguageProviders, LoadConfigFromFile, applyConfigResult; builds InspectRunner with fixture root test/benchmarks/repos/1
- [ ] selection_quality_task1_matches_baseline passes
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass including selection-quality-benchmark
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from mcp/ or cli/ in the test file

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
