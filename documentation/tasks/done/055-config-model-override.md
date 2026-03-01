# Task 055: Config model override

> **Status:** Done
> **Phase:** Phase 1 (KL-006 completion)
> **Layer:** core, config, mcp
> **Depends on:** createCompileHandler, applyConfigResult

## Goal

When `model.id` is set in `aic.config.json`, use it as the compilation model id so `compilation_log.model_id` is populated from config. Handler receives a config-derived override; resolution order is args.modelId then modelIdOverride then getModelId(editorId).

## Architecture Notes

- ADR-009: config validation at boundary in shared/src/config. ResolvedConfig extended with optional model.
- Design: applyConfigResult return type gains modelId; createCompileHandler gains modelIdOverride; MCP passes config model id. CLI unchanged (continues to destructure only budgetConfig, heuristicConfig).

## Files

| Action | Path                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| Modify | `shared/src/core/types/resolved-config.ts` (add optional model)                                                  |
| Modify | `shared/src/config/load-config-from-file.ts` (Zod schema, buildResolvedConfig, applyConfigResult return modelId) |
| Modify | `mcp/src/handlers/compile-handler.ts` (add modelIdOverride, resolve order)                                       |
| Modify | `mcp/src/server.ts` (destructure modelId, pass to createCompileHandler)                                          |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (pass modelIdOverride, add override test)                   |

## Interface / Signature

No new interface. createCompileHandler signature gains one parameter:

```typescript
export function createCompileHandler(
  runner: CompilationRunner,
  telemetryDeps: TelemetryDeps,
  sessionId: SessionId,
  getEditorId: () => EditorId,
  getModelId: (editorId: EditorId) => string | null,
  modelIdOverride: string | null,
): (args: { ... }, _extra: unknown) => Promise<CallToolResult>;
```

Handler body: `resolvedModelId = args.modelId ?? modelIdOverride ?? getModelId(resolvedEditorId)`.

## Dependent Types

### Tier 2 — path-only

| Type                     | Path                                       | Note                                 |
| ------------------------ | ------------------------------------------ | ------------------------------------ |
| ResolvedConfig           | shared/src/core/types/resolved-config.js   | Add optional model?: { id?: string } |
| applyConfigResult return | shared/src/config/load-config-from-file.js | Add modelId: string \| null          |

## Config Changes

- **shared/package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add ResolvedConfig.model and Zod schema and buildResolvedConfig

In `shared/src/core/types/resolved-config.ts` add to ResolvedConfig interface: `readonly model?: { readonly id?: string }`. In defaultResolvedConfig do not add model (remain undefined). In `shared/src/config/load-config-from-file.ts` add to AicConfigSchema: `model: z.object({ id: z.string().optional() }).optional()`. In buildResolvedConfig add to return object: `model: parsed.model`. Keep existing contextBudget and heuristic.

**Verify:** ResolvedConfig type includes optional model; buildResolvedConfig passes parsed.model into config.

### Step 2: applyConfigResult return modelId

In `shared/src/config/load-config-from-file.ts` in applyConfigResult add to the return object: `modelId: result.config.model?.id ?? null`. Keep existing budgetConfig and heuristicConfig.

**Verify:** applyConfigResult return type includes modelId: string | null.

### Step 3: createCompileHandler modelIdOverride and resolve order

In `mcp/src/handlers/compile-handler.ts` add parameter to createCompileHandler: `modelIdOverride: string | null` (after getModelId). In the handler body set resolvedModelId to `args.modelId ?? modelIdOverride ?? getModelId(resolvedEditorId)`.

**Verify:** createCompileHandler has six parameters with modelIdOverride last; resolvedModelId uses that order.

### Step 4: MCP server destructure modelId and pass to createCompileHandler

In `mcp/src/server.ts` change the destructuring of applyConfigResult result to include modelId: `const { budgetConfig, heuristicConfig, modelId: configModelId } = applyConfigResult(...)`. Pass configModelId to createCompileHandler as the sixth argument (modelIdOverride).

**Verify:** createCompileHandler is called with configModelId as the sixth argument.

### Step 5: Update compile-handler test for modelIdOverride

In `mcp/src/handlers/__tests__/compile-handler.test.ts` add the sixth argument to createCompileHandler: `null` (modelIdOverride). So the call is createCompileHandler(mockRunner, telemetryDeps, sessionId, () => EDITOR_ID.GENERIC, () => null, null). Add a test config_model_override_in_handler: create a handler with modelIdOverride "config-model", call it with args.modelId null, assert the runner receives a request with modelId "config-model". The resolution order args.modelId ?? modelIdOverride ?? getModelId ensures config_override_takes_precedence_over_detector.

**Verify:** Test file calls createCompileHandler with six arguments; config_model_override_in_handler and existing test pass.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`  
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                      | Description                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| config_model_override_in_handler               | Handler with modelIdOverride "config-model", args.modelId null; request.modelId is "config-model" |
| config_override_takes_precedence_over_detector | modelIdOverride used before getModelId in resolution order                                        |

## Acceptance Criteria

- [ ] All file modifications per Files table
- [ ] createCompileHandler signature has six parameters
- [ ] All test cases pass
- [ ] pnpm lint — zero errors, zero warnings
- [ ] pnpm typecheck — clean
- [ ] pnpm knip — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No Date.now(), new Date(), Math.random() outside allowed files
- [ ] No let in production code (const only; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. Stop immediately — do not guess or improvise
2. Append a ## Blocked section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
