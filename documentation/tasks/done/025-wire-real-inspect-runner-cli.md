# Task 025: Wire real InspectRunner (CLI)

> **Status:** In Progress
> **Phase:** 0.5 (Phase I — Live Wiring & Bug Fixes)
> **Layer:** cli
> **Depends on:** FileSystemRepoMapSupplier, createFullPipelineDeps, Wire real RepoMap in MCP/CLI

## Goal

Replace the stub InspectRunner in the CLI with the real InspectRunner so that `aic inspect <intent>` runs the full pipeline and outputs a real pipeline trace.

## Architecture Notes

- Composition root: main.ts wires dependencies; no business logic. Same pattern as compile (createCompilationRunner) and MCP server (createMcpServer).
- DIP: InspectRunner is instantiated only in main.ts via a factory createInspectRunner(projectRoot). inspectCommand receives the runner by injection; tests inject stub/mock.
- Chosen approach: Add createInspectRunner in main.ts mirroring createCompilationRunner; return new InspectRunner(deps, scope.clock). No shared helper extraction — duplication acceptable.

## Files

| Action | Path                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------ |
| Modify | `cli/src/main.ts` (add createInspectRunner, wire real runner, remove stub and stub-only imports) |

## Interface / Signature

InspectRunner interface (consumed by inspectCommand):

```typescript
import type { InspectRequest } from "#core/types/inspect-types.js";
import type { PipelineTrace } from "#core/types/inspect-types.js";

export interface InspectRunner {
  inspect(request: InspectRequest): Promise<PipelineTrace>;
}
```

Source: shared/src/core/interfaces/inspect-runner.interface.ts

Concrete class to instantiate:

```typescript
export class InspectRunner implements IInspectRunner {
  constructor(
    public readonly deps: PipelineStepsDeps,
    private readonly clock: Clock,
  ) {}

  async inspect(request: InspectRequest): Promise<PipelineTrace> { ... }
}
```

Source: shared/src/pipeline/inspect-runner.ts

Helper to add in main.ts:

```typescript
function createInspectRunner(projectRoot: string): InspectRunner {
  const scope = createProjectScope(toAbsolutePath(projectRoot));
  const fileContentReader: FileContentReader = {
    getContent(pathRel: RelativePath): string {
      return fs.readFileSync(path.join(projectRoot, pathRel), "utf8");
    },
  };
  const rulePackProvider = createRulePackProvider(projectRoot);
  const budgetConfig = createDefaultBudgetConfig();
  const deps = createFullPipelineDeps(fileContentReader, rulePackProvider, budgetConfig);
  return new InspectRunner(deps, scope.clock);
}
```

## Dependent Types

### Tier 1 — signature + path

| Type                | Path                                                        | Members | Purpose                                                              |
| ------------------- | ----------------------------------------------------------- | ------- | -------------------------------------------------------------------- |
| `PipelineStepsDeps` | shared/src/core/run-pipeline-steps.ts                       | 10      | Return type of createFullPipelineDeps; passed to InspectRunner       |
| `Clock`             | shared/src/core/interfaces/clock.interface.ts               | 1       | scope.clock from createProjectScope                                  |
| `FileContentReader` | shared/src/core/interfaces/file-content-reader.interface.ts | 1       | getContent(RelativePath): string — inline in createInspectRunner     |
| `RulePackProvider`  | shared/src/core/interfaces/rule-pack-provider.interface.ts  | 2       | getBuiltInPack, getProjectPack — createRulePackProvider(projectRoot) |
| `BudgetConfig`      | shared/src/core/interfaces/budget-config.interface.ts       | 2       | getMaxTokens, getBudgetForTaskClass — createDefaultBudgetConfig()    |

### Tier 2 — path-only

| Type           | Path                           | Factory                       |
| -------------- | ------------------------------ | ----------------------------- |
| `AbsolutePath` | shared/src/core/types/paths.js | `toAbsolutePath(projectRoot)` |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add createInspectRunner and InspectRunner import

In `cli/src/main.ts`: Add import for the concrete class: `import { InspectRunner } from "@aic/shared/pipeline/inspect-runner.js";`. Remove the type-only import `import type { InspectRunner } from "@aic/shared/core/interfaces/inspect-runner.interface.js";` (the class satisfies the interface). Add function `createInspectRunner(projectRoot: string): InspectRunner` with body: call `createProjectScope(toAbsolutePath(projectRoot))` and assign to `scope`; define `fileContentReader` as an object with method `getContent(pathRel: RelativePath): string` that returns `fs.readFileSync(path.join(projectRoot, pathRel), "utf8")`; set `rulePackProvider = createRulePackProvider(projectRoot)`; set `budgetConfig = createDefaultBudgetConfig()`; set `deps = createFullPipelineDeps(fileContentReader, rulePackProvider, budgetConfig)`; return `new InspectRunner(deps, scope.clock)`.

**Verify:** Run `pnpm typecheck` from repo root. Expected: clean.

### Step 2: Wire real runner and remove stub

In `cli/src/main.ts`: Change the inspect command action from `inspectCommand(args, inspectStubRunner)` to `inspectCommand(args, createInspectRunner(args.projectRoot))`. Delete the `stubTrace` constant and the `inspectStubRunner` constant. Remove these imports (used only by stubTrace): `PipelineTrace`, `toPercentage`, `toConfidence`, `toISOTimestamp`, `INCLUSION_TIER`. Do not remove `toTokenCount` or `TASK_CLASS` (used by createDefaultBudgetConfig and createRulePackProvider).

**Verify:** Run `pnpm lint` and `pnpm typecheck`. Expected: zero errors, zero warnings.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case               | Description                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| valid_args_stdout_stub  | inspectCommand with injected stub runner writes JSON with trace to stdout; intent and taskClass present |
| invalid_args_throws     | inspectCommand with invalid args (empty intent) rejects                                                 |
| runner_throws_aic_error | inspectCommand with runner that throws ConfigError rejects and stderr contains message                  |

Existing tests in `cli/src/commands/__tests__/inspect.test.ts` inject the runner; they remain unchanged and must pass after wiring.

## Acceptance Criteria

- [ ] createInspectRunner added in main.ts; inspect action calls inspectCommand(args, createInspectRunner(args.projectRoot))
- [ ] inspectStubRunner and stubTrace removed; stub-only imports removed
- [ ] All test cases in Tests table pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Running `aic inspect "fix bug"` from a project with source files produces stdout JSON with trace containing real pipeline data (non-stub taskClass, selectedFiles, tokenSummary) when the pipeline runs

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.

---

## Post-completion: Conditional dependency loading refactor

`createScopeAndDeps`, `createCompilationRunner`, and `createInspectRunner` were refactored back to sync functions. They now accept `additionalProviders?: readonly LanguageProvider[]`. Each CLI action handler calls `initLanguageProviders(projectRoot)` which scans for file extensions and only creates providers for languages present in the project, then passes the result to the sync bootstrap functions.
