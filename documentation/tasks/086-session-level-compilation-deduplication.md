# Task 086: Session-level compilation deduplication

> **Status:** Pending
> **Phase:** O (Agentic Session Tracking)
> **Layer:** pipeline + core (compound)
> **Depends on:** —

## Goal

When a compilation request includes a session ID and optional step index/intent, use an optional agentic session state provider to mark files that were already shown in a previous step (and not modified since) so the prompt assembler emits a short placeholder instead of re-including full content, and record the current step for future deduplication. When the provider is absent or session ID is absent, behavior is unchanged (no dedup, no recording).

## Architecture Notes

- Project plan §2.7: Session layer sits above the pipeline; deduplication uses getPreviouslyShownFiles and recordStep. Core pipeline unchanged; session enriches input and output handling.
- New interface AgenticSessionState (core) keeps agentic session state separate from existing SessionTracker (server lifecycle). Session tracking storage (migration) will implement this interface in a later task; this task wires an optional provider (null for now).
- ADR-010: use branded types (SessionId, StepIndex, RelativePath, InclusionTier, TokenCount, ISOTimestamp). Immutability: no mutation; use spread/reduce.
- Cache key extends to include sessionId and stepIndex when both present (per §2.7) so different steps do not share cache entries.

## Files

| Action | Path                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/types/session-dedup-types.ts`                                                                                                  |
| Create | `shared/src/core/interfaces/agentic-session-state.interface.ts`                                                                                 |
| Modify | `shared/src/core/types/selected-file.ts` (add optional previouslyShownAtStep)                                                                   |
| Modify | `shared/src/core/run-pipeline-steps.ts` (optional sessionId/agenticSessionState; mark previously shown)                                         |
| Modify | `shared/src/pipeline/prompt-assembler.ts` (emit placeholder for previously shown files)                                                         |
| Modify | `shared/src/pipeline/compilation-runner.ts` (optional agenticSessionState; cache key; recordStep)                                               |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (recordStep, cache key, and prompt contains placeholder when previous file returned) |
| Modify | `shared/src/pipeline/__tests__/prompt-assembler.test.ts` (previously shown placeholder test)                                                    |
| Modify | `mcp/src/server.ts` (pass agenticSessionState: null to CompilationRunner)                                                                       |

## Interface / Signature

```typescript
// AgenticSessionState — Source: core/interfaces/agentic-session-state.interface.ts
import type { SessionId } from "#core/types/identifiers.js";
import type { PreviousFile } from "#core/types/session-dedup-types.js";
import type { SessionStep } from "#core/types/session-dedup-types.js";

export interface AgenticSessionState {
  getPreviouslyShownFiles(sessionId: SessionId): readonly PreviousFile[];
  recordStep(sessionId: SessionId, step: SessionStep): void;
}
```

```typescript
// No new class in this task. CompilationRunner gains one optional constructor parameter:
// agenticSessionState: AgenticSessionState | null
// runPipelineSteps receives PipelineStepsRequest with optional sessionId?, stepIndex?, stepIntent?
// and PipelineStepsDeps with optional agenticSessionState?.
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// session-dedup-types.ts
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount, StepIndex } from "#core/types/units.js";
import type { InclusionTier } from "#core/types/enums.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { ToolOutput } from "#core/types/compilation-types.js";

export interface PreviousFile {
  readonly path: RelativePath;
  readonly lastTier: InclusionTier;
  readonly lastStepIndex: StepIndex;
  readonly modifiedSince: boolean;
}

export interface SessionStep {
  readonly stepIndex: StepIndex;
  readonly stepIntent: string | null;
  readonly filesSelected: readonly RelativePath[];
  readonly tiers: Readonly<Record<string, InclusionTier>>;
  readonly tokensCompiled: TokenCount;
  readonly toolOutputs: readonly ToolOutput[];
  readonly completedAt: ISOTimestamp;
}
```

SelectedFile (add one optional field):

```typescript
// In selected-file.ts add to existing interface:
readonly previouslyShownAtStep?: StepIndex;
```

### Tier 2 — path-only

| Type      | Path                       | Factory        |
| --------- | -------------------------- | -------------- |
| StepIndex | #core/types/units.js       | toStepIndex(n) |
| SessionId | #core/types/identifiers.js | toSessionId(s) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Core types and interface

Create `shared/src/core/types/session-dedup-types.ts` with PreviousFile and SessionStep interfaces as in Dependent Types (Tier 0). Export both.

Create `shared/src/core/interfaces/agentic-session-state.interface.ts` with AgenticSessionState interface as in Interface / Signature. Import SessionId from identifiers, PreviousFile and SessionStep from session-dedup-types.

**Verify:** `pnpm typecheck` passes.

### Step 2: Extend SelectedFile and pipeline request/deps

In `shared/src/core/types/selected-file.ts`, add optional property `readonly previouslyShownAtStep?: StepIndex` to SelectedFile. Import StepIndex from units.

In `shared/src/core/run-pipeline-steps.ts`, extend PipelineStepsRequest with optional `readonly sessionId?: SessionId`, `readonly stepIndex?: StepIndex`, `readonly stepIntent?: string`. Extend PipelineStepsDeps with optional `readonly agenticSessionState?: AgenticSessionState | null`. Add SessionId to identifiers import; add AgenticSessionState import from agentic-session-state.interface.js; add StepIndex to units import when StepIndex is used in the new request fields.

**Verify:** `pnpm typecheck` passes.

### Step 3: Mark previously shown in runPipelineSteps

In `runPipelineSteps`, after computing `selectedFiles` from `contextResult.files`, if `request.sessionId` and `deps.agenticSessionState` are both present, call `deps.agenticSessionState.getPreviouslyShownFiles(request.sessionId)`. Build a map from previous path to PreviousFile (by path). For each selected file, if its path is in that map and the map entry has `modifiedSince === false`, set `previouslyShownAtStep` to that entry's `lastStepIndex` (produce a new SelectedFile object with spread and previouslyShownAtStep). Use immutable patterns (no mutation; new array with map). Assign the result back to a variable used for the rest of the steps (guard, transform, ladder, assemble). If sessionId or agenticSessionState is absent, leave selectedFiles unchanged.

**Verify:** `pnpm typecheck` passes.

### Step 4: PromptAssembler placeholder for previously shown

In `shared/src/pipeline/prompt-assembler.ts`, in `assemble`, when building context parts: for each file, if `file.previouslyShownAtStep !== undefined`, emit a single line `### ${file.path} [Tier: ${file.tier}] — Previously shown in step ${file.previouslyShownAtStep}` and do not call `this.fileContentReader.getContent(file.path)` for that file. For all other files, keep existing behavior (getContent and full block). Use immutable array building (flatMap or reduce).

**Verify:** `pnpm typecheck` passes.

### Step 5: CompilationRunner optional agenticSessionState, cache key, recordStep

In `shared/src/pipeline/compilation-runner.ts`, add optional 10th constructor parameter `private readonly agenticSessionState: AgenticSessionState | null`. In `buildCacheKey` (or where cache key is built), when `request.sessionId` and `request.stepIndex` are both present, include both in the inputs to the hasher (append to the joined string before hashing, or pass a longer array to hasher.hash) so the cache key differs per step. When calling runPipelineSteps from the runner, pass the request as `{ intent: request.intent, projectRoot: request.projectRoot, sessionId: request.sessionId, stepIndex: request.stepIndex, stepIntent: request.stepIntent }` and pass deps as `{ ...this.deps, agenticSessionState: this.agenticSessionState ?? undefined }` so the pipeline can mark previously shown files and the runner has session state for recordStep.

In `runFreshPath` (or the path that calls runPipelineSteps and then records), after a successful run, if `request.sessionId` and `this.agenticSessionState` are both non-null, build a SessionStep: stepIndex from request.stepIndex (or toStepIndex(0) if absent), stepIntent from request.stepIntent ?? null, filesSelected from the result's ladderFiles mapped to path, tiers from ladderFiles reduced to a Record<string, InclusionTier> (path -> tier), tokensCompiled from result promptTotal, toolOutputs from request.toolOutputs ?? [], completedAt from clock.now(). Call `this.agenticSessionState.recordStep(request.sessionId, step)`. Use immutable construction for tiers (reduce with spread). Ensure runPipelineSteps is called with request that includes sessionId, stepIndex, stepIntent, and with deps that include agenticSessionState (spread this.deps and add agenticSessionState: this.agenticSessionState when calling runPipelineSteps).

**Verify:** `pnpm typecheck` passes.

### Step 6: Wire agenticSessionState in MCP server

In `mcp/src/server.ts`, when constructing `CompilationRunnerImpl`, add a 10th argument `null` for agenticSessionState (so the runner receives no session state until the Session tracking storage task provides an implementation).

**Verify:** `pnpm typecheck` passes.

### Step 7: Tests

Add or extend tests as follows.

- **compilation-runner:** Add test that mocks AgenticSessionState.recordStep; run the runner with a request that has sessionId and stepIndex and agenticSessionState the mock; assert recordStep was called with the same sessionId and a step whose filesSelected length matches the result. Add test that two runs with same intent and projectRoot but different sessionId and stepIndex produce different cache keys (second run is cache miss when first run cached). Add test that when agenticSessionState.getPreviouslyShownFiles returns one PreviousFile (path that will be selected, modifiedSince: false) and request has sessionId, the compiled prompt string contains "Previously shown in step".

- **prompt-assembler:** Add test that calls assemble with one SelectedFile that has previouslyShownAtStep set; mock fileContentReader.getContent to track calls; assert the assembled string contains "Previously shown in step" and that getContent was not called for that file's path.

**Verify:** `pnpm test` passes for the touched test files.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                             | Description                                                                                                                                                           |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| compilation_runner_record_step_called                                 | With sessionId and agenticSessionState mock, recordStep called with sessionId and step data after fresh run                                                           |
| compilation_runner_cache_key_includes_session_and_step                | Different sessionId+stepIndex yield different cache keys (no hit across steps)                                                                                        |
| compilation_runner_prompt_contains_placeholder_when_previous_returned | When agenticSessionState returns one PreviousFile (path selected, modifiedSince false) and request has sessionId, compiled prompt contains "Previously shown in step" |
| prompt_assembler_previously_shown_emits_placeholder                   | File with previouslyShownAtStep produces "Previously shown in step" and no getContent for that path                                                                   |

## Acceptance Criteria

- [ ] All files created/modified per Files table
- [ ] AgenticSessionState interface and PreviousFile/SessionStep types match spec
- [ ] When sessionId and agenticSessionState present, previously shown files get placeholder in prompt and step is recorded
- [ ] When either is absent, behavior unchanged (no dedup, no recordStep)
- [ ] Cache key includes sessionId and stepIndex when both present
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in new code
- [ ] No `let` in production code; single-line comments only

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
