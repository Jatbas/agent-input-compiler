# Task 022: Golden snapshot tests

> **Status:** In Progress
> **Phase:** H (Integration tests)
> **Layer:** shared (integration test)
> **Depends on:** InspectRunner, pipeline Steps 1–8, Zod schemas (CLI)

## Goal

Add one integration test that runs the full pipeline (InspectRunner) against a minimal fixture repo, snapshots the PipelineTrace, and asserts determinism (three runs produce identical trace). Establishes the golden-snapshot pattern for Phase H; benchmark suite and baseline are out of scope.

## Architecture Notes

- One-off task: no adapter/storage/pipeline/composition-root recipe; structure follows MVP spec §8a (Full pipeline cold cache → golden snapshot) and §5 (deterministic output).
- Snapshot subject: PipelineTrace from InspectRunner (not compiled prompt). CompilationRunner remains stub; no new runner in this task.
- RepoMapBuilder is not implemented; test uses a mock RepoMapSupplier that returns a deterministic RepoMap built from the fixture file list (same paths as files on disk so FileContentReader and pipeline steps see real content).
- Determinism: inject a mock Clock returning a fixed ISOTimestamp; RepoMap FileEntry use fixed lastModified and estimatedTokens so trace is stable. Run inspect three times and assert deep equality of the three traces.
- Test lives under shared so it can wire pipeline classes; test file is allowed node:fs/node:path (ESLint relaxed for test files). Fixture path: resolve from process.cwd() to test/benchmarks/repos/1 (Vitest runs with cwd = repo root).

## Files

| Action | Path                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| Create | `test/benchmarks/repos/1/src/auth/service.ts`                                                                  |
| Create | `test/benchmarks/repos/1/src/index.ts`                                                                         |
| Create | `shared/src/integration/__tests__/golden-snapshot.test.ts`                                                     |
| Create | `shared/src/integration/__tests__/__snapshots__/golden-snapshot.test.ts.snap` (created by Vitest on first run) |

## Interface / Signature

N/A — integration test. The test wires InspectRunner and calls `inspect(request)`; it does not implement a new interface.

Relevant types (for reference only; no new definitions):

- `InspectRunner.inspect(request: InspectRequest): Promise<PipelineTrace>` — shared/src/core/interfaces/inspect-runner.interface.ts
- `InspectRequest`: intent, projectRoot, configPath, dbPath — shared/src/core/types/inspect-types.ts
- `PipelineTrace`: intent, taskClass, rulePacks, budget, selectedFiles, guard, transforms, summarisationTiers, constraints, tokenSummary, compiledAt — shared/src/core/types/inspect-types.ts
- `RepoMap`: root, files (FileEntry[]), totalFiles, totalTokens — shared/src/core/types/repo-map.ts
- `FileEntry`: path, language, sizeBytes, estimatedTokens, lastModified — shared/src/core/types/repo-map.ts

## Dependent Types

Test uses existing types only. Tier 2 (path-only): AbsolutePath, RelativePath, FilePath, TokenCount, Bytes, ISOTimestamp — from shared/src/core/types (paths, units, identifiers). Factories: toAbsolutePath, toRelativePath, toFilePath, toTokenCount, toBytes; for ISOTimestamp use a fixed string that matches the project format (YYYY-MM-DDTHH:mm:ss.sssZ).

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change (test files already have restricted rules disabled).
- **vitest.config.ts:** No change. Pattern `shared/src/**/__tests__/**/*.test.ts` already includes `shared/src/integration/__tests__/*.test.ts`.

## Steps

### Step 1a: Create fixture file src/auth/service.ts

Create directory `test/benchmarks/repos/1/src/auth/` and file `test/benchmarks/repos/1/src/auth/service.ts` with content: `export function auth() { return "ok"; }`. No secrets, excluded paths, or prompt-injection strings so the guard passes.

**Verify:** File exists at test/benchmarks/repos/1/src/auth/service.ts.

### Step 1b: Create fixture file src/index.ts

Create file `test/benchmarks/repos/1/src/index.ts` with content: `import { auth } from "./auth/service"; export { auth };`.

**Verify:** File exists at test/benchmarks/repos/1/src/index.ts.

### Step 2: Implement golden snapshot test

Create `shared/src/integration/__tests__/golden-snapshot.test.ts`.

- Resolve fixture root: `const fixtureRoot = toAbsolutePath(path.join(process.cwd(), "test", "benchmarks", "repos", "1"));` (use `path` from `node:path`; test files may import Node APIs).
- Build a deterministic RepoMap for the fixture: root = fixtureRoot; files = two FileEntry entries for `src/auth/service.ts` and `src/index.ts` with fixed language `"ts"`, sizeBytes (toBytes(byteLength)), estimatedTokens (toTokenCount(n)), lastModified the fixed ISOTimestamp `"2026-01-01T00:00:00.000Z"`. totalFiles = 2; totalTokens = sum of the two estimatedTokens.
- Mock RepoMapSupplier: `getRepoMap(_projectRoot) { return Promise.resolve(repoMap); }`.
- Mock Clock: single method `now()` returning the same fixed ISOTimestamp used in RepoMap.
- FileContentReader: object with `getContent(pathRel: RelativePath): string` that reads `path.join(fixtureRoot as string, pathRel as string)` via `fs.readFileSync(..., "utf8")`.
- Wire all pipeline dependencies as in mcp/src/server.ts (IntentClassifier, RulePackResolver, BudgetAllocator, HeuristicSelector with TypeScriptProvider + GenericProvider, ContextGuard with ExclusionScanner, SecretScanner, PromptInjectionScanner, ContentTransformerPipeline with same transformers, SummarisationLadder, PromptAssembler, TiktokenAdapter as TokenCounter). Use the mock RepoMapSupplier and mock Clock and the FileContentReader above. Instantiate InspectRunner with these deps.
- Build InspectRequest: intent `"refactor auth module to use middleware pattern"`, projectRoot = fixtureRoot, configPath = null, dbPath = toFilePath(path.join(fixtureRoot as string, ".aic", "aic.sqlite")).
- Call `const trace = await runner.inspect(request)`.
- Assert snapshot: `expect(trace).toMatchSnapshot();` (Vitest will create `__snapshots__/golden-snapshot.test.ts.snap` on first run).
- Assert determinism: in the same test or a second it, call `runner.inspect(request)` three times and assert that the three traces are deep-equal: `expect(trace1).toEqual(trace2)` and `expect(trace2).toEqual(trace3)`. Use the mock Clock so compiledAt is identical across runs.

**Verify:** Run `pnpm test shared/src/integration/__tests__/golden-snapshot.test.ts`; test passes; snapshot file is created under `shared/src/integration/__tests__/__snapshots__/`.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                   | Description                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| full_pipeline_trace_matches_golden_snapshot | InspectRunner.inspect with fixture repo and fixed intent returns PipelineTrace that matches committed snapshot |
| full_pipeline_trace_is_deterministic        | Three consecutive inspect calls with same request return identical traces (deep equality)                      |

## Acceptance Criteria

- [ ] Fixture repo exists at test/benchmarks/repos/1/ with src/auth/service.ts and src/index.ts
- [ ] shared/src/integration/**tests**/golden-snapshot.test.ts exists and wires InspectRunner with mock RepoMapSupplier, mock Clock, and FileContentReader reading from fixture
- [ ] Test runs inspect with intent "refactor auth module to use middleware pattern" and asserts toMatchSnapshot()
- [ ] Test asserts determinism (three runs, same trace)
- [ ] Snapshot file created and committed under **snapshots**/
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test` — all pass including golden-snapshot
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports from mcp/ or cli/ in the test file (shared-only plus Node for path/fs in test)

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
