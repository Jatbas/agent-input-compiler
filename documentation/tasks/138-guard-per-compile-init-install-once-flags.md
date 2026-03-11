# Task 138: Guard per-compile init/install behind once-flags

> **Status:** Pending
> **Phase:** X (Hot-Path I/O Elimination)
> **Layer:** mcp
> **Depends on:** —

## Goal

Run `ensureProjectInit`, `reconcileProjectId`, `installTriggerRule`, and `installCursorHooks` once per project per server lifetime in the compile handler, then skip them on subsequent compilations for the same project. Eliminates ~20 sync I/O calls per compilation after the first.

## Architecture Notes

- Handler modification only — no new interface or class. Guard is a `Set<string>` in the `createCompileHandler` closure; key is `scope.normaliser.normalise(projectRoot)` so it matches `ScopeRegistry` normalisation.
- Guard resets on server restart (closure created once at startup). No new parameters; callers unchanged.
- MCP layer may use `node:fs`/`node:path`; no ESLint changes.

## Files

| Action | Path |
| ------ | ---- |
| Modify | `mcp/src/handlers/compile-handler.ts` (add init-done Set and conditional around four init/install calls) |
| Modify | `mcp/src/handlers/__tests__/compile-handler.test.ts` (add tests: init once per project, init for each distinct project) |

## Interface / Signature

No new interface or class. The change is a closure variable and a conditional block inside `createCompileHandler`.

Add at the start of `createCompileHandler`, immediately after the closing `):` of the parameter list and before `return async`:

```typescript
  const initDoneForProject = new Set<string>();
  return async (args, _extra): Promise<CallToolResult> => {
```

Replace the current unconditional block (the four calls) with:

```typescript
      const key = scope.normaliser.normalise(projectRoot);
      if (!initDoneForProject.has(key)) {
        ensureProjectInit(projectRoot, scope.clock, scope.idGenerator);
        reconcileProjectId(
          projectRoot,
          scope.db,
          scope.clock,
          scope.idGenerator,
          scope.normaliser,
        );
        installTriggerRule(projectRoot);
        installCursorHooks(projectRoot);
        initDoneForProject.add(key);
      }
```

## Dependent Types

### Tier 0 — verbatim

None. The handler calls existing functions and uses `scope.normaliser.normalise(projectRoot)`.

### Tier 1 — signature + path

| Type | Path | Members | Purpose |
| ---- | ---- | ------- | ------- |
| `ProjectRootNormaliser` | `shared/src/core/interfaces/project-root-normaliser.interface.ts` | 1 | `normalise(raw: string): AbsolutePath` — derive guard key |

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `AbsolutePath` | `shared/src/core/types/paths.ts` | value used as Set key (branded string) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add init-done guard in compile-handler.ts

In `mcp/src/handlers/compile-handler.ts`, add `const initDoneForProject = new Set<string>();` at the start of `createCompileHandler` (after the parameter list, before `return async`). In the returned async handler, after the `SqliteToolInvocationLogStore` construction and before the four init/install calls, insert: `const key = scope.normaliser.normalise(projectRoot);` then wrap the four calls (`ensureProjectInit`, `reconcileProjectId`, `installTriggerRule`, `installCursorHooks`) in `if (!initDoneForProject.has(key)) { ... initDoneForProject.add(key); }`. Remove the now-redundant unconditional four calls so they appear only inside the conditional.

**Verify:** Grep for `initDoneForProject` in `compile-handler.ts` shows the Set declaration, the `has(key)` check, and `add(key)`. The four function calls appear only inside the conditional block.

### Step 2: Add tests for once-per-project init

In `mcp/src/handlers/__tests__/compile-handler.test.ts`, add two test cases:

1. **init_runs_once_per_project:** Build a handler with a single `getScope` that returns the same scope for the same project root. Call the handler twice with the same `projectRoot` (reuse one temp dir path for both calls). Spy on `ensureProjectInit` via `vi.spyOn` on the module that exports it. Assert `ensureProjectInit` was called once total (first compile only). Second compile must not invoke init/install again.

2. **init_runs_for_each_distinct_project:** Build a handler whose `getScope` returns a scope with a normaliser that distinguishes two different project roots. Call the handler once for project A (one temp dir), once for project B (second temp dir). Assert init runs for both: `ensureProjectInit` called twice, once per project.

Use the same `enabledConfigLoader` and success runner pattern as existing tests. Clean up temp dirs in `try`/`finally`.

**Verify:** `pnpm test mcp/src/handlers/__tests__/compile-handler.test.ts` passes and both new tests are listed in the output.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| init_runs_once_per_project | Same project root, two compiles — init/install run only on first |
| init_runs_for_each_distinct_project | Two different project roots — init/install run once per project |

## Acceptance Criteria

- [ ] All files modified per Files table
- [ ] Guard Set and conditional block implemented as specified
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] No `let` in production code (only `const`; control flags in imperative closures are the sole exception)
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
