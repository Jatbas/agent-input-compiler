# Task 128: Wire ScopeRegistry into server

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** mcp
> **Depends on:** W03 (Stable project ID), W05 (Store SQL project_root queries), W06 (ScopeRegistry class)

## Goal

Replace the single `createProjectScope(projectRoot)` call in `createMcpServer` with a `ScopeRegistry` so the compile handler resolves scope per request via `registry.getOrCreate(args.projectRoot)`; resources (`aic://status`, `aic://last`) keep using the startup scope until W12.

## Architecture Notes

- Composition root (mcp/src/server.ts) is the only place that instantiates ScopeRegistry and wires getScope/getRunner. DIP: no `new` for infrastructure outside server.ts.
- Runner per scope: cache `CompilationRunnerImpl` in createMcpServer keyed by `normaliser.normalise(scope.projectRoot)`; build on first use (config load for that scope, createFullPipelineDeps, new CompilationRunnerImpl).
- aic://status and aic://last use startup scope; W12 will scope them by project.
- Shutdown: `close()` calls `registry.close()` (closes all scope DBs), not a single `closeDatabase(scope.db)`.

## Files

| Action | Path |
| ------ | ----------------------------------------- |
| Modify | `mcp/src/server.ts` |
| Modify | `mcp/src/handlers/compile-handler.ts` |
| Modify | `mcp/src/__tests__/server.test.ts` |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` |

## Wiring Specification

Concrete classes/functions used (source: existing server.ts and scope-registry.ts):

```typescript
// shared/src/storage/scope-registry.ts
import { ScopeRegistry } from "@jatbas/aic-core/storage/scope-registry.js";
// ScopeRegistry: constructor(normaliser: ProjectRootNormaliser), getOrCreate(projectRoot: AbsolutePath): ProjectScope, close(): void

// shared/src/storage/create-project-scope.ts
import { createProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
// createProjectScope(projectRoot: AbsolutePath, normaliser: ProjectRootNormaliser): ProjectScope

// shared/src/storage/open-database.ts
import { closeDatabase } from "@jatbas/aic-core/storage/open-database.js";
// closeDatabase(db: ExecutableDb): void — called by ScopeRegistry.close()
```

```typescript
// createMcpServer(projectRoot: AbsolutePath, additionalProviders?: readonly LanguageProvider[]): McpServer
// After change: normaliser = new NodePathAdapter(), registry = new ScopeRegistry(normaliser), startupScope = registry.getOrCreate(projectRoot).
// getScope = (projectRoot: AbsolutePath) => registry.getOrCreate(projectRoot).
// getRunner(scope: ProjectScope): CompilationRunner — cache by normaliser.normalise(scope.projectRoot); on miss: configLoader.load(scope.projectRoot, null), applyConfigResult(..., scope.configStore, sha256Adapter), createCachingFileContentReader(scope.projectRoot), createRulePackProvider(scope.projectRoot), createFullPipelineDeps(...), new CompilationRunnerImpl(deps, scope.clock, scope.cacheStore, scope.configStore, sha256Adapter, scope.guardStore, scope.compilationLogStore, scope.idGenerator, new SqliteAgenticSessionStore(scope.projectRoot, scope.db)); cache and return.
// close(): registry.close() instead of closeDatabase(scope.db).
```

```typescript
// createCompileHandler new signature
export function createCompileHandler(
  getScope: (projectRoot: AbsolutePath) => ProjectScope,
  getRunner: (scope: ProjectScope) => CompilationRunner,
  sha256Adapter: StringHasher,
  getSessionId: () => SessionId,
  getEditorId: () => EditorId,
  getModelId: (editorId: EditorId) => string | null,
  modelIdOverride: string | null,
  installScopeWarnings: readonly string[],
): (args: { intent: string; projectRoot: string; ... }, _extra: unknown) => Promise<CallToolResult>;
// Handler body: scope = getScope(validateProjectRoot(args.projectRoot)); runner = getRunner(scope); telemetryDeps = { telemetryStore: scope.telemetryStore, clock: scope.clock, idGenerator: scope.idGenerator, stringHasher: sha256Adapter }; toolInvocationLogStore = new SqliteToolInvocationLogStore(scope.projectRoot, scope.db); use scope.clock, scope.idGenerator for recordToolInvocation; rest unchanged.
```

## Dependent Types

### Tier 0 — verbatim

ProjectScope (component calls methods on): `readonly db, clock, idGenerator, normaliser, cacheStore, telemetryStore, configStore, guardStore, compilationLogStore, sessionTracker, fileTransformStore, projectRoot` — from `shared/src/storage/create-project-scope.ts`.

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| CompilationRunner | core/interfaces/compilation-runner.interface.js | run(request) | Passed from getRunner(scope) |
| ProjectRootNormaliser | core/interfaces/project-root-normaliser.interface.js | normalise(raw) | Injected into ScopeRegistry |
| StringHasher | core/interfaces/string-hasher.interface.js | hash(s) | sha256Adapter for telemetryDeps |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| AbsolutePath | core/types/paths.js | toAbsolutePath(raw) |

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Wire ScopeRegistry and getRunner in server.ts

In `createMcpServer`, replace `const scope = createProjectScope(projectRoot, normaliser)` with: create `const registry = new ScopeRegistry(normaliser)` and `const startupScope = registry.getOrCreate(projectRoot)`. Use `startupScope` everywhere the current `scope` is used for one-off startup (purgeImmediateId, runStartupSelfCheck, installScope, session start, registerShutdownHandler, getUpdateInfo, config load, fileContentReader, rulePackProvider, deps, toolInvocationLogStore, inspectRunner). Add a `runnerCache = new Map<string, CompilationRunnerImpl>()` and a function `getRunner(scope: ProjectScope): CompilationRunnerImpl` that: computes `key = normaliser.normalise(scope.projectRoot)`; if `runnerCache.get(key)` is defined return it; else load config with `configLoader.load(scope.projectRoot, null)`, call `applyConfigResult(configResult, scope.configStore, sha256Adapter)` for budgetConfig and heuristicConfig, create `fileContentReader = createCachingFileContentReader(scope.projectRoot)`, `rulePackProvider = createRulePackProvider(scope.projectRoot)`, `deps = createFullPipelineDeps(fileContentReader, rulePackProvider, budgetConfig, additionalProviders, heuristicConfig)`, then `runner = new CompilationRunnerImpl(deps, scope.clock, scope.cacheStore, scope.configStore, sha256Adapter, scope.guardStore, scope.compilationLogStore, scope.idGenerator, new SqliteAgenticSessionStore(scope.projectRoot, scope.db))`, set `runnerCache.set(key, runner)`, return runner. Replace the single `createCompileHandler(compilationRunner, telemetryDeps, getScope, ...)` call with `createCompileHandler((projectRoot) => registry.getOrCreate(projectRoot), getRunner, sha256Adapter, getSessionId, getEditorId, getModelId, configModelId, installScopeWarnings)`. Remove the old arguments: compilationRunner, telemetryDeps, toolInvocationLogStore, clock, idGenerator. Do not pass toolInvocationLogStore, clock, or idGenerator — the handler derives them from scope internally. Change the server’s `out.close` to call `registry.close()` instead of `closeDatabase(scope.db)`. Add import for `ScopeRegistry` from `@jatbas/aic-core/storage/scope-registry.js`; remove direct import of `createProjectScope` if it is no longer used in server.ts (registry uses it internally).

**Verify:** `pnpm typecheck` passes; createMcpServer returns a server that registers aic_compile with the new handler signature.

### Step 2: Update compile-handler signature and body

In `mcp/src/handlers/compile-handler.ts`, change `createCompileHandler` so the first parameters are `getScope: (projectRoot: AbsolutePath) => ProjectScope`, `getRunner: (scope: ProjectScope) => CompilationRunner`, `sha256Adapter: StringHasher`, then `getSessionId`, `getEditorId`, `getModelId`, `modelIdOverride`, `installScopeWarnings`. Remove parameters `runner`, `telemetryDeps`, `toolInvocationLogStore`, `clock`, `idGenerator`. At the start of the returned async handler, after `validateProjectRoot(args.projectRoot)`, set `const scope = getScope(projectRoot)`, `const runner = getRunner(scope)`, `const telemetryDeps = { telemetryStore: scope.telemetryStore, clock: scope.clock, idGenerator: scope.idGenerator, stringHasher: sha256Adapter }`, and `const toolInvocationLogStore = new SqliteToolInvocationLogStore(scope.projectRoot, scope.db)`. Use `scope.clock` and `scope.idGenerator` in the `recordToolInvocation` call. Add import for `SqliteToolInvocationLogStore` from `@jatbas/aic-core/storage/sqlite-tool-invocation-log-store.js` and for `StringHasher` from core interfaces. Ensure all references to `clock` and `idGenerator` in the handler body use `scope.clock` and `scope.idGenerator`.

**Verify:** Handler compiles; existing call site in server.ts matches the new signature (already updated in Step 1).

### Step 3: Update server and compile-handler tests

In `mcp/src/__tests__/server.test.ts`, ensure every test that calls `createMcpServer(toAbsolutePath(tmpDir))` still passes. Any test that calls `server.close()` or asserts on shutdown behaviour should expect `registry.close()` (no change to test assertions if close() is still the same API). In `mcp/src/handlers/__tests__/compile-handler.test.ts`, update every `createCompileHandler(...)` call to the new signature: pass `getScope = (_projectRoot: AbsolutePath) => scope` (or the mock scope used in that test), `getRunner = (_scope: ProjectScope) => runner` (the mock runner used in that test), `sha256Adapter = { hash: (): string => "" }`, then `getSessionId`, `getEditorId`, `getModelId`, `null`, `[]`. Remove the arguments that were the old `runner`, `telemetryDeps`, `toolInvocationLogStore`, `clock`, `idGenerator` (the mock scope and runner are now passed via getScope/getRunner).

**Verify:** `pnpm test` for mcp/src passes. Test cases covered: server_createMcpServer_returns_server, server_close_calls_registry_close, compile_handler_getScope_getRunner, compile_handler_timeout.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| server_createMcpServer_returns_server | createMcpServer(toAbsolutePath(tmpDir)) returns server; aic_compile with same projectRoot succeeds |
| server_close_calls_registry_close | After close(), no single DB remains open; registry.close() closed all scopes |
| compile_handler_getScope_getRunner | createCompileHandler(getScope, getRunner, sha256Adapter, ...) uses scope and runner from getScope(projectRoot) and getRunner(scope) |
| compile_handler_timeout | compile_timeout_rejects_after_30s still passes with getScope/getRunner/sha256Adapter signature |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] createMcpServer uses ScopeRegistry; startupScope = registry.getOrCreate(projectRoot); getRunner(scope) caches CompilationRunnerImpl per normalised projectRoot
- [ ] createCompileHandler signature is (getScope, getRunner, sha256Adapter, getSessionId, getEditorId, getModelId, modelIdOverride, installScopeWarnings); handler derives scope, runner, telemetryDeps, toolInvocationLogStore from scope
- [ ] aic://status and aic://last use startupScope
- [ ] close() calls registry.close()
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
