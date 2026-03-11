# Task 135: Per-folder disable

> **Status:** Pending
> **Phase:** W — Global Server & Per-Project Isolation
> **Layer:** mcp + shared (config)
> **Depends on:** W07 (Wire ScopeRegistry into server)

## Goal

Add an `"enabled"` flag to `aic.config.json` so a project can disable AIC. When `enabled` is false, the compile handler returns a user-facing message immediately with no DB writes, and `show aic status` shows "Disabled" for that project.

## Architecture Notes

- ADR-009: validation at MCP boundary and config loader only; config schema (Zod) stays in `shared/src/config/load-config-from-file.ts`.
- Single source of truth: config file; handler and status resource read `config.enabled`.
- No new interfaces; extend `ResolvedConfig` and pass existing `ConfigLoader` into `createCompileHandler`.
- implementation-spec.md §W11: default true when omitted; compile returns early with spec message; no DB writes; status shows Disabled.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `shared/src/core/types/resolved-config.ts` |
| Modify | `shared/src/config/load-config-from-file.ts` |
| Modify | `mcp/src/handlers/compile-handler.ts` |
| Modify | `mcp/src/server.ts` |
| Modify | `.cursor/rules/aic-architect.mdc` |
| Modify | `shared/src/config/__tests__/load-config-from-file.test.ts` |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` |
| Modify | `mcp/src/__tests__/server.test.ts` |

## Interface / Signature

ConfigLoader (unchanged; handler will call it):

```typescript
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { FilePath } from "@jatbas/aic-core/core/types/paths.js";
import type { LoadConfigResult } from "@jatbas/aic-core/core/interfaces/load-config-result.interface.js";

export interface ConfigLoader {
  load(projectRoot: AbsolutePath, configPath: FilePath | null): LoadConfigResult;
}
```

Wiring: `createCompileHandler` gains one parameter and the handler body gains an early-return branch.

```typescript
export function createCompileHandler(
  getScope: (projectRoot: AbsolutePath) => ProjectScope,
  getRunner: (scope: ProjectScope) => CompilationRunner,
  sha256Adapter: StringHasher,
  getSessionId: () => SessionId,
  getEditorId: () => EditorId,
  getModelId: (editorId: EditorId) => string | null,
  modelIdOverride: string | null,
  installScopeWarnings: readonly string[],
  configLoader: ConfigLoader,
): (args: { ... }, _extra: unknown) => Promise<CallToolResult>;
```

Inside the returned async function: after `validateProjectRoot(args.projectRoot)` and `getScope(projectRoot)`, resolve `configPath` (when `args.configPath !== null` call `validateConfigPath(args.configPath, projectRoot)`, else `null`). Call `configLoader.load(projectRoot, configPath)`. If `result.config.enabled === false`, return `{ content: [{ type: "text", text: JSON.stringify({ compiledPrompt: "AIC is disabled for this project. Set \"enabled\": true in aic.config.json to re-enable.", meta: {}, conversationId: resolveConversationId(args.conversationId) }) }] }` and do not call `ensureProjectInit`, `reconcileProjectId`, `recordToolInvocation`, `runner.run()`, `writeCompilationTelemetry`, or write last-compiled-prompt. Otherwise continue with the existing flow.

## Dependent Types

### Tier 0 — verbatim

ResolvedConfig (add one field):

```typescript
export interface ResolvedConfig {
  readonly contextBudget: {
    readonly maxTokens: TokenCount;
    readonly perTaskClass: Readonly<{ [K in TaskClass]?: TokenCount }>;
  };
  readonly heuristic: { readonly maxFiles: number };
  readonly model?: { readonly id?: string };
  readonly enabled: boolean;
}
```

`defaultResolvedConfig()` must include `enabled: true`.

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| LoadConfigResult | shared/src/core/interfaces/load-config-result.interface.ts | config, rawJson? | Return of ConfigLoader.load |
| ProjectScope | shared/src/storage/create-project-scope.ts | projectRoot, projectId, db, … | getScope return |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| AbsolutePath | shared/src/core/types/paths.ts | toAbsolutePath(raw) |
| FilePath | shared/src/core/types/paths.ts | toFilePath(raw) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add enabled to ResolvedConfig and defaultResolvedConfig

In `shared/src/core/types/resolved-config.ts`, add `readonly enabled: boolean` to the `ResolvedConfig` interface. In `defaultResolvedConfig()`, add `enabled: true` to the returned object.

**Verify:** `pnpm typecheck` passes; ResolvedConfig has `enabled` and defaultResolvedConfig returns it.

### Step 2: Add enabled to AicConfigSchema and buildResolvedConfig

In `shared/src/config/load-config-from-file.ts`, add `enabled: z.boolean().optional()` to `AicConfigSchema` (top-level of the `.object({...})`). In `buildResolvedConfig(parsed)`, set `enabled: parsed.enabled ?? true` in the returned object. Ensure the returned object is still a valid `ResolvedConfig` (all required fields including `enabled`).

**Verify:** `pnpm typecheck` passes; loading a config without `enabled` yields `enabled: true`.

### Step 3: Compile handler — configLoader param and early return when disabled

In `mcp/src/handlers/compile-handler.ts`, add `configLoader: ConfigLoader` as the last parameter of `createCompileHandler`. Import `ConfigLoader` from the core interface. In the returned async function, immediately after `const scope = getScope(projectRoot);`, compute `configPath` as `args.configPath !== null ? validateConfigPath(args.configPath, projectRoot) : null`. Call `const configResult = configLoader.load(projectRoot, configPath);`. If `configResult.config.enabled === false`, return `{ content: [{ type: "text" as const, text: JSON.stringify({ compiledPrompt: "AIC is disabled for this project. Set \"enabled\": true in aic.config.json to re-enable.", meta: {}, conversationId: resolveConversationId(args.conversationId) ?? null }) }] };`. Do not call `ensureProjectInit`, `reconcileProjectId`, `recordToolInvocation`, `runner.run()`, `writeCompilationTelemetry`, or write to last-compiled-prompt when returning. Otherwise leave the rest of the handler unchanged.

**Verify:** `pnpm typecheck` passes; handler signature has nine parameters with configLoader last.

### Step 4: Server — pass configLoader to handler and add projectEnabled to status

In `mcp/src/server.ts`, in the `server.tool("aic_compile", ...)` call, pass `configLoader` as the final argument to `createCompileHandler` (so the handler receives the existing `configLoader` instance). In the `server.resource("status", "aic://status", () => { ... })` callback, before building the return value, call `const statusConfigResult = configLoader.load(startupScope.projectRoot, null);`. In the `JSON.stringify` object for the status response, add `projectEnabled: statusConfigResult.config.enabled`.

**Verify:** `pnpm typecheck` passes; createCompileHandler is called with configLoader; status payload includes projectEnabled.

### Step 5: Architect rule — status table row for Project

In `.cursor/rules/aic-architect.mdc`, in the "show aic status" table (labels and formats), add one row: JSON key `projectEnabled`, Label **Project**, Format: show "Enabled" when true, "Disabled" when false.

**Verify:** The status table contains projectEnabled with label "Project".

### Step 6a: Tests — load-config-from-file

In `shared/src/config/__tests__/load-config-from-file.test.ts`, add test `load_config_enabled_omitted_defaults_true`: load with no file or with valid JSON that omits `enabled`; assert `result.config.enabled === true`. Add test `load_config_enabled_false`: write `{"enabled": false}` to aic.config.json, load; assert `result.config.enabled === false`. Add test `load_config_enabled_true`: write `{"enabled": true}`; assert `result.config.enabled === true`.

**Verify:** `pnpm test` for `shared/src/config/__tests__/load-config-from-file.test.ts` passes.

### Step 6b: Tests — compile-handler

In `mcp/src/handlers/__tests__/compile-handler.test.ts`, add test `compile_handler_disabled_returns_message_no_db_writes`: create a mock ConfigLoader whose `load` returns `{ config: { ...defaultResolvedConfig(), enabled: false }, rawJson: undefined }`. Pass this mock as the configLoader argument to `createCompileHandler`. Call the handler with valid args. Assert the response content text, when parsed as JSON, has `compiledPrompt` containing the disable message. Assert the runner's `run` was not called (use a mock runner that records invocations).

**Verify:** `pnpm test` for `mcp/src/handlers/__tests__/compile-handler.test.ts` passes.

### Step 6c: Tests — server status resource

In `mcp/src/__tests__/server.test.ts`, add test `status_resource_disabled_shows_projectEnabled_false`: create a temp dir with `aic.config.json` containing `{"enabled": false}`. Create the server with that dir as projectRoot (same pattern as existing status tests that use createMcpServer). Read the `aic://status` resource. Parse the response JSON and assert `projectEnabled === false`.

**Verify:** `pnpm test` for `mcp/src/__tests__/server.test.ts` passes.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| load_config_enabled_omitted_defaults_true | Omitted or missing enabled yields config.enabled === true |
| load_config_enabled_false | "enabled": false yields config.enabled === false |
| load_config_enabled_true | "enabled": true yields config.enabled === true |
| compile_handler_disabled_returns_message_no_db_writes | Disabled config returns disable message and runner.run not called |
| status_resource_disabled_shows_projectEnabled_false | Status resource returns projectEnabled: false when config has enabled: false |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] ResolvedConfig has enabled; defaultResolvedConfig and buildResolvedConfig set it (default true)
- [ ] createCompileHandler accepts configLoader and returns early when config.enabled === false with no DB writes
- [ ] aic://status includes projectEnabled from config
- [ ] Architect status table has projectEnabled row
- [ ] All five test cases pass
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
