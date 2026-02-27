# Task 028: Config loading from aic.config

> **Status:** In Progress
> **Phase:** 0.5 (Phase I — Live Wiring)
> **Layer:** shared (config + core types) + mcp + cli
> **Depends on:** ConfigStore, SqliteConfigStore, createProjectScope, createFullPipelineDeps, MCP server, CLI compile/inspect

## Goal

Load `aic.config.json` from project root (or explicit path), validate with Zod at the boundary, and use the resolved config to build BudgetConfig and HeuristicSelectorConfig so the pipeline and cache use config-driven values; write config snapshot to ConfigStore when a file is loaded so cache invalidation works.

## Architecture Notes

- ADR-009: Validation at boundary only; Zod used in shared/src/config (config loader), not in core or pipeline.
- Config loader is the single place that reads aic.config.json; composition roots (MCP, CLI) call the loader, then write snapshot and build deps from ResolvedConfig.
- LoadConfigResult.rawJson is set only when a file was read; composition root calls configStore.writeSnapshot(hasher.hash(rawJson), rawJson). No ConfigStore or StringHasher in the loader.
- ResolvedConfig is minimal for MVP: contextBudget (maxTokens, perTaskClass) and heuristic.maxFiles. Other config fields deferred.

## Files

| Action | Path                                                                                                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/types/resolved-config.ts`                                                                                                   |
| Create | `shared/src/core/interfaces/config-loader.interface.ts`                                                                                      |
| Create | `shared/src/config/load-config-from-file.ts`                                                                                                 |
| Create | `shared/src/config/__tests__/load-config-from-file.test.ts`                                                                                  |
| Modify | `eslint.config.mjs` (add override for shared/src/config/\*\*: allow node:fs, node:path, zod)                                                 |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (add optional heuristicSelectorConfig; pass to HeuristicSelector)                             |
| Modify | `mcp/src/server.ts` (load config before deps, write snapshot if rawJson, build BudgetConfig and HeuristicSelectorConfig from ResolvedConfig) |
| Modify | `cli/src/main.ts` (same: load config, write snapshot if rawJson, build budget and heuristic from config, pass to createFullPipelineDeps)     |

## Interface / Signature

```typescript
// shared/src/core/interfaces/config-loader.interface.ts
import type { AbsolutePath } from "#core/types/paths.js";
import type { FilePath } from "#core/types/paths.js";
import type { ResolvedConfig } from "#core/types/resolved-config.js";

export interface LoadConfigResult {
  readonly config: ResolvedConfig;
  readonly rawJson?: string;
}

export interface ConfigLoader {
  load(projectRoot: AbsolutePath, configPath: FilePath | null): LoadConfigResult;
}
```

```typescript
// LoadConfigFromFile implements ConfigLoader (shared/src/config/load-config-from-file.ts)
// No constructor parameters.
load(projectRoot: AbsolutePath, configPath: FilePath | null): LoadConfigResult
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// shared/src/core/types/resolved-config.ts
import type { TokenCount } from "#core/types/units.js";
import type { TaskClass } from "#core/types/enums.js";

export interface ResolvedConfig {
  readonly contextBudget: {
    readonly maxTokens: TokenCount;
    readonly perTaskClass: Readonly<Partial<Record<TaskClass, TokenCount>>>;
  };
  readonly heuristic: {
    readonly maxFiles: number;
  };
}

export function defaultResolvedConfig(): ResolvedConfig;
// Implementation: toTokenCount(8000), perTaskClass {}, maxFiles 20.
```

```typescript
// shared/src/core/interfaces/budget-config.interface.ts (existing)
import type { TokenCount } from "#core/types/units.js";
import type { TaskClass } from "#core/types/enums.js";

export interface BudgetConfig {
  getMaxTokens(): TokenCount;
  getBudgetForTaskClass(taskClass: TaskClass): TokenCount | null;
}
```

```typescript
// shared/src/core/interfaces/heuristic-selector-config.interface.ts (existing)
export interface HeuristicSelectorConfig {
  readonly maxFiles: number;
  readonly weights?: {
    readonly pathRelevance: number;
    readonly importProximity: number;
    readonly recency: number;
    readonly sizePenalty: number;
  };
}
```

### Tier 1 — signature + path

| Type         | Path                                                  | Members | Purpose                                                            |
| ------------ | ----------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| ConfigStore  | shared/src/core/interfaces/config-store.interface.ts  | 2       | getLatestHash, writeSnapshot (used by composition root after load) |
| StringHasher | shared/src/core/interfaces/string-hasher.interface.ts | 1       | hash(input) — composition root hashes rawJson for writeSnapshot    |

### Tier 2 — path-only

| Type         | Path                           | Factory             |
| ------------ | ------------------------------ | ------------------- |
| AbsolutePath | shared/src/core/types/paths.js | toAbsolutePath(raw) |
| FilePath     | shared/src/core/types/paths.js | toFilePath(raw)     |
| TokenCount   | shared/src/core/types/units.js | toTokenCount(raw)   |
| TaskClass    | shared/src/core/types/enums.js | TASK_CLASS values   |

## Config Changes

- **package.json:** No change (zod already in shared).
- **eslint.config.mjs:** Add one block for `shared/src/config/**`: allow imports for `node:fs`, `node:path`, and `zod`. Keep all other path/pattern restrictions (no cli, mcp, pipeline, etc.) as in the storage override block. Place the new block after the storage override block (ensure-aic-dir, create-project-scope).

## Steps

### Step 1: ResolvedConfig type and default

Create `shared/src/core/types/resolved-config.ts`. Define interface ResolvedConfig with contextBudget (maxTokens: TokenCount, perTaskClass: Readonly<Partial<Record<TaskClass, TokenCount>>>) and heuristic (maxFiles: number). Export function defaultResolvedConfig(): ResolvedConfig that returns { contextBudget: { maxTokens: toTokenCount(8000), perTaskClass: {} }, heuristic: { maxFiles: 20 } }. Export ResolvedConfig from shared/src/core/types/index.ts (add to existing exports).

**Verify:** pnpm typecheck passes; ResolvedConfig and defaultResolvedConfig are importable from #core/types/resolved-config.js.

### Step 2: ConfigLoader interface

Create `shared/src/core/interfaces/config-loader.interface.ts`. Define LoadConfigResult { config: ResolvedConfig; rawJson?: string } and ConfigLoader { load(projectRoot: AbsolutePath, configPath: FilePath | null): LoadConfigResult }.

**Verify:** pnpm typecheck passes.

### Step 3: LoadConfigFromFile and schema

Create `shared/src/config/load-config-from-file.ts`. Import node:fs, node:path, z from "zod", ConfigError from core/errors, AbsolutePath/FilePath from core/types/paths, ResolvedConfig and defaultResolvedConfig from core/types/resolved-config, toTokenCount from core/types/units, TASK_CLASS and type TaskClass from core/types/enums. Define AicConfigSchema with z.object({ contextBudget: z.object({ maxTokens: z.number(), perTaskClass: z.record(z.string(), z.number()).optional() }).optional(), contextSelector: z.object({ heuristic: z.object({ maxFiles: z.number().optional() }).optional() }).optional() }).strict(). Catch JSON.parse and Zod parse errors; throw ConfigError with message. Resolve file path: if configPath is null use path.join(projectRoot, "aic.config.json"); else if path.isAbsolute(configPath) use configPath else path.join(projectRoot, configPath). If !fs.existsSync(filePath) return { config: defaultResolvedConfig() }. Else read fs.readFileSync(filePath, "utf8"), parse JSON, validate with schema, build ResolvedConfig (maxTokens toTokenCount, perTaskClass: only keys in TASK_CLASS with toTokenCount(value), maxFiles default 20). Return { config, rawJson: fileContent }. Export class LoadConfigFromFile implements ConfigLoader with no constructor and load(projectRoot, configPath) as above. Export function createBudgetConfigFromResolved(config: ResolvedConfig): BudgetConfig returning { getMaxTokens() { return config.contextBudget.maxTokens; }, getBudgetForTaskClass(taskClass) { return config.contextBudget.perTaskClass[taskClass] ?? null; } }.

**Verify:** File compiles; no import from core/pipeline/storage except allowed types and ConfigError.

### Step 4: ESLint override for config

In `eslint.config.mjs`, add a block after the storage override (ensure-aic-dir, create-project-scope). files: ["shared/src/config/**/*.ts"]. rules.no-restricted-imports: same structure as storage override but do not ban node:fs, node:path, or zod (allow those three). Keep bans for node:fs/promises, crypto, tiktoken, fast-glob, ignore, typescript, and patterns (BAN_RELATIVE_PARENT, no cli, mcp, pipeline).

**Verify:** pnpm lint passes for shared/src/config/load-config-from-file.ts.

### Step 5: Tests for LoadConfigFromFile

Create `shared/src/config/__tests__/load-config-from-file.test.ts`. Use temp dir (fs.mkdtempSync). Tests: (1) load_missing_file_returns_defaults: loader.load(projectRoot, null) with no aic.config.json in projectRoot returns config with maxTokens 8000 and heuristic.maxFiles 20 and no rawJson. (2) load_valid_file_returns_config_and_rawJson: write aic.config.json with {"contextBudget":{"maxTokens":10000},"contextSelector":{"heuristic":{"maxFiles":15}}}, load(projectRoot, null), assert config.contextBudget.maxTokens equals toTokenCount(10000), config.heuristic.maxFiles 15, rawJson defined. (3) load_invalid_json_throws_config_error: write file "{ invalid", expect load() to throw ConfigError. (4) load_invalid_schema_throws_config_error: write file {"contextBudget":{"maxTokens":"not a number"}}, expect load() to throw ConfigError. (5) load_explicit_config_path_uses_that_file: create subdir with different aic.config.json, load(projectRoot, toFilePath("subdir/aic.config.json")) or absolute path, assert config matches file in that path.

**Verify:** pnpm test -- shared/src/config/**tests**/load-config-from-file.test.ts passes.

### Step 6: createPipelineDeps and createFullPipelineDeps accept heuristicSelectorConfig

In `shared/src/bootstrap/create-pipeline-deps.ts`, add optional fourth parameter heuristicSelectorConfig?: HeuristicSelectorConfig to createPipelineDeps and createFullPipelineDeps. When constructing HeuristicSelector, pass heuristicSelectorConfig ?? { maxFiles: 20 }. Import HeuristicSelectorConfig from core/interfaces/heuristic-selector-config.interface.js.

**Verify:** pnpm typecheck passes; existing callers (no fourth arg) still typecheck.

### Step 7: MCP server wires config loader

In `mcp/src/server.ts`, import LoadConfigFromFile and createBudgetConfigFromResolved from @aic/shared/config/load-config-from-file.js, and defaultResolvedConfig from @aic/shared/core/types/resolved-config.js. In createMcpServer(projectRoot): instantiate configLoader = new LoadConfigFromFile(), call result = configLoader.load(projectRoot, null). If result.rawJson is defined, call scope.configStore.writeSnapshot(sha256Adapter.hash(result.rawJson), result.rawJson). Set budgetConfig = createBudgetConfigFromResolved(result.config). Set heuristicConfig = { maxFiles: result.config.heuristic.maxFiles }. Pass heuristicConfig as fourth argument to createFullPipelineDeps(fileContentReader, rulePackProvider, budgetConfig, heuristicConfig). Remove createDefaultBudgetConfig() usage for this path.

**Verify:** pnpm typecheck and pnpm test for mcp pass.

### Step 8: CLI main wires config loader

In `cli/src/main.ts`, import LoadConfigFromFile and createBudgetConfigFromResolved from @aic/shared/config/load-config-from-file.js. Change createScopeAndDeps to createScopeAndDeps(projectRoot: string, configPath: string | null). Instantiate configLoader = new LoadConfigFromFile(), call result = configLoader.load(toAbsolutePath(projectRoot), configPath !== null ? toFilePath(configPath) : null). If result.rawJson is defined, scope.configStore.writeSnapshot(sha256Adapter.hash(result.rawJson), result.rawJson). Set budgetConfig = createBudgetConfigFromResolved(result.config), heuristicConfig = { maxFiles: result.config.heuristic.maxFiles }. Pass heuristicConfig to createFullPipelineDeps(..., budgetConfig, heuristicConfig). Update every caller of createScopeAndDeps to pass two arguments: projectRoot and args.configPath ?? null (compile and inspect actions already have args with configPath).

**Verify:** pnpm typecheck and pnpm test for cli pass.

### Step 9: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                  | Description                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| load_missing_file_returns_defaults         | No aic.config.json at projectRoot; load returns default config and no rawJson              |
| load_valid_file_returns_config_and_rawJson | Valid aic.config.json with maxTokens and maxFiles; load returns ResolvedConfig and rawJson |
| load_invalid_json_throws_config_error      | Malformed JSON in file; load throws ConfigError                                            |
| load_invalid_schema_throws_config_error    | Valid JSON but invalid schema (maxTokens as string); load throws ConfigError               |
| load_explicit_config_path_uses_that_file   | configPath non-null; load reads from that path and returns its config                      |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] ConfigLoader interface and LoadConfigFromFile implementation match; load returns LoadConfigResult
- [ ] All five test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] MCP server and CLI use loaded config for BudgetConfig and HeuristicSelectorConfig; config snapshot written when file loaded
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in new code
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
