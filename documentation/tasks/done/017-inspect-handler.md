# Task 017: Inspect Handler (Phase F)

> **Status:** Done
> **Phase:** F (MCP Server)
> **Layer:** pipeline (shared) + mcp (handler)
> **Depends on:** Server composition root (Done), Phase C pipeline, Phase D adapters, Phase E storage

## Goal

Implement the `aic_inspect` MCP tool by adding InspectRunner in shared (runs pipeline Steps 1–8 without writing to compilation cache) and the MCP handler that validates arguments, calls the runner, and returns a structured PipelineTrace. The server wires a stub RepoMapSupplier until RepoMapBuilder exists.

## Architecture Notes

- ADR-009: Zod validates at MCP boundary only; InspectRequestSchema in mcp/src/schemas/. Core receives branded types.
- InspectRunner does not receive FileContentReader; pipeline steps (ContentTransformerPipeline, SummarisationLadder, PromptAssembler) already have it. InspectRunner orchestrates via their interfaces only.
- InspectRunner receives TokenCounter (interface); call tokenCounter.countTokens(text). Server wires TiktokenAdapter directly.
- ContextGuard.scan(files) returns { result: GuardResult, safeFiles: readonly SelectedFile[] }. Use safeFiles for the next step (ContentTransformerPipeline.transform); use result for trace.guard.
- rulePacks in PipelineTrace: build as ["built-in:default", `built-in:${taskClass}`] plus project pack name when RulePackResolver’s provider returns a project pack. This duplicates resolution knowledge; documented as tech debt for MVP.
- PipelineTrace uses readonly for all array and collection fields (immutability rules).
- Task spans shared and mcp; single task keeps one handoff for the feature.

## Files

| Action | Path                                                                                         |
| ------ | -------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/types/inspect-types.ts`                                                     |
| Create | `shared/src/core/interfaces/repo-map-supplier.interface.ts`                                  |
| Create | `shared/src/core/interfaces/inspect-runner.interface.ts`                                     |
| Create | `shared/src/pipeline/inspect-runner.ts`                                                      |
| Create | `shared/src/pipeline/__tests__/inspect-runner.test.ts`                                       |
| Create | `mcp/src/schemas/inspect-request.schema.ts`                                                  |
| Create | `mcp/src/handlers/inspect-handler.ts`                                                        |
| Modify | `mcp/src/server.ts` (wire InspectRunner, replace aic_inspect stub with handler)              |
| Modify | `mcp/src/__tests__/server.test.ts` (add aic_inspect invalid-params and error-response tests) |

## Interface / Signature

**InspectRunner interface (shared):**

```typescript
import type { InspectRequest } from "#core/types/inspect-types.js";
import type { PipelineTrace } from "#core/types/inspect-types.js";

export interface InspectRunner {
  inspect(request: InspectRequest): Promise<PipelineTrace>;
}
```

**RepoMapSupplier interface (shared):**

```typescript
import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap } from "#core/types/repo-map.js";

export interface RepoMapSupplier {
  getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap>;
}
```

**InspectRunner class (constructor and method):**

```typescript
export class InspectRunner implements InspectRunner {
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
  ) {}

  async inspect(request: InspectRequest): Promise<PipelineTrace> {
    // Steps 1–8; destructure contextGuard.scan() as { result, safeFiles }; use safeFiles for transform; use tokenCounter.countTokens(text) for prompt total
  }
}
```

## Dependent Types

### Tier 0 — verbatim

**InspectRequest and PipelineTrace (inspect-types.ts):**

```typescript
import type { AbsolutePath, FilePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
import type { Percentage } from "#core/types/scores.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardResult } from "#core/types/guard-types.js";
import type { TransformMetadata } from "#core/types/transform-types.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface InspectRequest {
  readonly intent: string;
  readonly projectRoot: AbsolutePath;
  readonly configPath: FilePath | null;
  readonly dbPath: FilePath;
}

export interface PipelineTrace {
  readonly intent: string;
  readonly taskClass: TaskClassification;
  readonly rulePacks: readonly string[];
  readonly budget: TokenCount;
  readonly selectedFiles: readonly SelectedFile[];
  readonly guard: GuardResult | null;
  readonly transforms: readonly TransformMetadata[];
  readonly summarisationTiers: Readonly<Record<InclusionTier, number>>;
  readonly constraints: readonly string[];
  readonly tokenSummary: {
    readonly raw: TokenCount;
    readonly selected: TokenCount;
    readonly afterGuard: TokenCount;
    readonly afterTransforms: TokenCount;
    readonly afterLadder: TokenCount;
    readonly promptTotal: TokenCount;
    readonly reductionPct: Percentage;
  };
  readonly compiledAt: ISOTimestamp;
}
```

### Tier 1 — signature + path

| Type                         | Path                                                                 | Members | Purpose                                     |
| ---------------------------- | -------------------------------------------------------------------- | ------- | ------------------------------------------- |
| `IntentClassifier`           | shared/src/core/interfaces/intent-classifier.interface.ts            | 1       | classify(intent)                            |
| `RulePackResolver`           | shared/src/core/interfaces/rule-pack-resolver.interface.ts           | 1       | resolve(task, projectRoot)                  |
| `BudgetAllocator`            | shared/src/core/interfaces/budget-allocator.interface.ts             | 1       | allocate(rulePack, taskClass)               |
| `ContextSelector`            | shared/src/core/interfaces/context-selector.interface.ts             | 1       | selectContext(task, repo, budget, rulePack) |
| `ContextGuard`               | shared/src/core/interfaces/context-guard.interface.ts                | 1       | scan(files) → { result, safeFiles }         |
| `ContentTransformerPipeline` | shared/src/core/interfaces/content-transformer-pipeline.interface.ts | 1       | transform(files, context)                   |
| `SummarisationLadder`        | shared/src/core/interfaces/summarisation-ladder.interface.ts         | 1       | compress(files, budget)                     |
| `PromptAssembler`            | shared/src/core/interfaces/prompt-assembler.interface.ts             | 1       | assemble(task, files, constraints, format)  |
| `RepoMapSupplier`            | shared/src/core/interfaces/repo-map-supplier.interface.ts            | 1       | getRepoMap(projectRoot)                     |
| `Clock`                      | shared/src/core/interfaces/clock.interface.ts                        | 1       | now()                                       |
| `TokenCounter`               | shared/src/core/interfaces/token-counter.interface.ts                | 1       | countTokens(text)                           |

### Tier 2 — path-only

| Type            | Path                                 | Factory                    |
| --------------- | ------------------------------------ | -------------------------- |
| `AbsolutePath`  | shared/src/core/types/paths.ts       | toAbsolutePath(raw)        |
| `FilePath`      | shared/src/core/types/paths.ts       | toFilePath(raw)            |
| `TokenCount`    | shared/src/core/types/units.ts       | toTokenCount(n)            |
| `Percentage`    | shared/src/core/types/scores.ts      | toPercentage(n)            |
| `ISOTimestamp`  | shared/src/core/types/identifiers.ts | Clock.now()                |
| `InclusionTier` | shared/src/core/types/enums.ts       | INCLUSION_TIER             |
| `OutputFormat`  | shared/src/core/types/enums.ts       | OUTPUT_FORMAT.UNIFIED_DIFF |

## Config Changes

- **package.json:** no change
- **eslint.config.mjs:** no change

## Steps

### Step 1: InspectRequest and PipelineTrace types

Create `shared/src/core/types/inspect-types.ts`. Define InspectRequest and PipelineTrace with readonly array/record fields as in Dependent Types Tier 0. Export both. Add barrel export in `shared/src/core/types/index.ts` for InspectRequest and PipelineTrace.

**Verify:** `pnpm typecheck` from repo root passes; Grep for `inspect-types` in core/types/index.ts shows export.

### Step 2: RepoMapSupplier interface

Create `shared/src/core/interfaces/repo-map-supplier.interface.ts`. Declare interface RepoMapSupplier with getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap>. Use imports from #core/types/paths.js and #core/types/repo-map.js.

**Verify:** `pnpm typecheck` passes; file exists and exports RepoMapSupplier.

### Step 3: InspectRunner interface

Create `shared/src/core/interfaces/inspect-runner.interface.ts`. Declare interface InspectRunner with inspect(request: InspectRequest): Promise<PipelineTrace>. Import InspectRequest and PipelineTrace from #core/types/inspect-types.js.

**Verify:** `pnpm typecheck` passes; file exports InspectRunner.

### Step 4: InspectRunner implementation

Create `shared/src/pipeline/inspect-runner.ts`. Implement InspectRunner: constructor with intentClassifier, rulePackResolver, budgetAllocator, contextSelector, contextGuard, contentTransformerPipeline, summarisationLadder, promptAssembler, repoMapSupplier, clock, tokenCounter (all interfaces; no FileContentReader). Implement inspect(request): run Step 1 intentClassifier.classify(request.intent); Step 2 rulePackResolver.resolve(task, request.projectRoot) for rulePack; Step 3 budgetAllocator.allocate(rulePack, task.taskClass); Step 4 await repoMapSupplier.getRepoMap(request.projectRoot), then contextSelector.selectContext(task, repoMap, budget, rulePack); Step 5 contextGuard.scan(selectedFiles), destructure { result, safeFiles }, use safeFiles for next step and result for trace.guard; Step 5.5 contentTransformerPipeline.transform(safeFiles, { directTargetPaths: [], rawMode: false }); Step 6 summarisationLadder.compress(transformed.files, budget); Step 8 promptAssembler.assemble(task, ladderFiles, rulePack.constraints, OUTPUT_FORMAT.UNIFIED_DIFF). Build rulePacks as ["built-in:default", `built-in:${task.taskClass}`] (MVP; project pack name omitted — tech debt). Compute tokenSummary: raw from repoMap.totalTokens, selected from contextResult.totalTokens, afterGuard sum of safeFiles tokens, afterTransforms from transformResult.metadata, afterLadder sum of ladder output, promptTotal = tokenCounter.countTokens(assembledPrompt), reductionPct from (raw - promptTotal)/raw with toPercentage. Set compiledAt = clock.now(). Return PipelineTrace with all readonly fields. Do not write to cache or call Step 9.

**Verify:** `pnpm typecheck` passes; no imports of FileContentReader or CacheStore in inspect-runner.ts.

### Step 5: InspectRunner unit tests

Create `shared/src/pipeline/__tests__/inspect-runner.test.ts`. Implement: (1) inspect_runner_returns_trace: mock RepoMapSupplier and pipeline steps to return known TaskClassification, RulePack, TokenCount, ContextResult, { result, safeFiles }, TransformResult, and ladder output; construct InspectRunner with mocks and Clock; call inspect(request); assert PipelineTrace has correct taskClass, rulePacks length, selectedFiles length, guard equal to mock result, tokenSummary.reductionPct defined, compiledAt defined. (2) inspect_runner_no_file_content_reader: assert InspectRunner constructor has no fileContentReader parameter. (3) inspect_runner_repo_map_reject: when RepoMapSupplier.getRepoMap rejects, assert inspect() propagates the error.

**Verify:** `pnpm test shared/src/pipeline/__tests__/inspect-runner.test.ts` passes.

### Step 6: InspectRequestSchema (Zod)

Create `mcp/src/schemas/inspect-request.schema.ts`. Define InspectRequestSchema with z.object({ intent: z.string().min(1).max(10_000), projectRoot: z.string().min(1), configPath: z.string().nullable().default(null) }). Export the schema. No branded types in the schema; handler will call toAbsolutePath and toFilePath after parse.

**Verify:** `pnpm typecheck` in mcp passes; schema file exists.

### Step 7: Inspect handler

Create `mcp/src/handlers/inspect-handler.ts`. Export a function that accepts (args: unknown, inspectRunner: InspectRunner) and returns Promise<{ content: Array<{ type: "text"; text: string }> }>. Parse args with InspectRequestSchema.safeParse(args). On failure return content with single text part describing invalid params (MCP -32602 semantics; do not throw). Build InspectRequest: intent from parsed.intent, projectRoot = toAbsolutePath(parsed.projectRoot), configPath = parsed.configPath !== null ? toFilePath(parsed.configPath) : null, dbPath = toFilePath(path.join(projectRoot as string, ".aic", "aic.sqlite")). Call await inspectRunner.inspect(request). Serialize result to JSON and return content: [{ type: "text", text: JSON.stringify({ trace: result }) }]. In a try/catch, on AicError call sanitizeError from @aic/shared and return content with sanitized message and indicate internal error; on other errors return content with generic internal error message. Use path from node:path only in this handler for dbPath derivation.

**Verify:** `pnpm typecheck` and `pnpm lint` pass; handler does not import zod into shared.

### Step 8: Wire InspectRunner and aic_inspect in server

In `mcp/src/server.ts`: Import InspectRunner from @aic/shared/pipeline/inspect-runner.js, inspect handler from ./handlers/inspect-handler.js, InspectRequestSchema from ./schemas/inspect-request.schema.js. After creating pipeline steps and projectScope, create a stub RepoMapSupplier that returns Promise.reject(new Error("RepoMap not available; RepoMapBuilder not implemented")). Instantiate InspectRunner with intentClassifier, rulePackResolver, budgetAllocator, heuristicSelector (as contextSelector), contextGuard, contentTransformerPipeline, summarisationLadder, promptAssembler, stubRepoMapSupplier, clock, tiktokenAdapter (pass TiktokenAdapter instance as tokenCounter; it implements TokenCounter). Replace server.tool("aic_inspect", async () => ({ content: [...] })) with server.tool("aic_inspect", (args) => handleInspect(args, inspectRunner)) using the handler from Step 7. Ensure createMcpServer still receives projectRoot and creates projectScope before building the server.

**Verify:** `pnpm typecheck` and `pnpm lint` pass; server.tool("aic_inspect", ...) calls handler with inspectRunner.

### Step 9: MCP tests for aic_inspect

In `mcp/src/__tests__/server.test.ts`: Add test aic_inspect_invalid_params: call client.callTool({ name: "aic_inspect", arguments: {} }); assert response content indicates invalid params (missing intent or projectRoot). Add test aic_inspect_stub_error: call client.callTool({ name: "aic_inspect", arguments: { intent: "refactor auth", projectRoot: tmpDir } }); assert response content includes error message (stub RepoMapSupplier rejects).

**Verify:** `pnpm test mcp/src/__tests__/server.test.ts` passes; both new tests run.

### Step 10: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`

Expected: all pass, zero warnings.

## Tests

| Test case                             | Description                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| inspect_runner_returns_trace          | Mock RepoMapSupplier and steps; inspect(request) returns PipelineTrace with correct shape and readonly fields |
| inspect_runner_no_file_content_reader | InspectRunner constructor has no fileContentReader parameter                                                  |
| inspect_runner_repo_map_reject        | When RepoMapSupplier.getRepoMap rejects, inspect() propagates error                                           |
| aic_inspect_invalid_params            | callTool aic_inspect with empty arguments returns content indicating invalid params                           |
| aic_inspect_stub_error                | callTool aic_inspect with valid args returns content with error (RepoMap stub rejects)                        |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] InspectRunner interface matches class signature exactly; no fileContentReader in constructor
- [ ] ContextGuard.scan result destructured to { result, safeFiles }; safeFiles used for transform step
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] No imports violating layer boundaries (zod only in mcp/schemas and handler)
- [ ] No `new Date()`, `Date.now()`, `Math.random()` outside allowed files
- [ ] Single-line comments only, explain why not what
- [ ] PipelineTrace and InspectRequest use readonly for all array/collection fields

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance
