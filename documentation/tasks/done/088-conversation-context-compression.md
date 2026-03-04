# Task 088: Conversation context compression

> **Status:** Done
> **Phase:** O (Agentic Session Tracking)
> **Layer:** pipeline + core (compound)
> **Depends on:** Session-level compilation deduplication (086)

## Goal

Summarize previously recorded session steps into a short string and inject it into the compiled prompt as a "## Session context" block so the model sees prior steps without verbose replay. When sessionId and agenticSessionState are present, the pipeline calls getSteps, compresses with ConversationCompressor, and passes the summary to PromptAssembler; when absent, no section is emitted.

## Architecture Notes

- Project plan §2.7: Conversation Compressor runs before/at assembly; summary replaces verbose conversation replay. Session layer enriches input; core pipeline unchanged.
- New interface ConversationCompressor (core); implementation in pipeline. AgenticSessionState gains getSteps(sessionId) so the pipeline can read prior steps; Session tracking storage will implement it in a later task. MCP continues to pass agenticSessionState: null.
- ADR-010: use branded types (SessionId, StepIndex, TokenCount, etc.). Immutability: no mutation; use spread/reduce.
- ConversationCompressor is required in PipelineStepsDeps; when agenticSessionState is null, getSteps is never called and summary is "".

## Files

| Action | Path                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/conversation-compressor.interface.ts`                                                       |
| Create | `shared/src/pipeline/conversation-compressor.ts`                                                                        |
| Create | `shared/src/pipeline/__tests__/conversation-compressor.test.ts`                                                         |
| Modify | `shared/src/core/interfaces/agentic-session-state.interface.ts` (add getSteps)                                          |
| Modify | `shared/src/core/interfaces/prompt-assembler.interface.ts` (add sessionContextSummary param)                            |
| Modify | `shared/src/core/run-pipeline-steps.ts` (conversationCompressor in deps; getSteps + compress; pass summary to assemble) |
| Modify | `shared/src/pipeline/prompt-assembler.ts` (emit ## Session context when sessionContextSummary provided)                 |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate ConversationCompressor, add to deps)                        |
| Modify | `shared/src/pipeline/__tests__/prompt-assembler.test.ts` (session context section tests)                                |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (add getSteps to AgenticSessionState mocks)                  |

## Interface / Signature

```typescript
import type { SessionStep } from "#core/types/session-dedup-types.js";

export interface ConversationCompressor {
  compress(steps: readonly SessionStep[]): string;
}
```

```typescript
import type { ConversationCompressor } from "#core/interfaces/conversation-compressor.interface.js";
import type { SessionStep } from "#core/types/session-dedup-types.js";

export class ConversationCompressorImpl implements ConversationCompressor {
  constructor() {}

  compress(steps: readonly SessionStep[]): string {
    if (steps.length === 0) return "";
    const header = "Steps completed:\n";
    const lines = steps.map((step, i) => {
      const label = step.stepIntent?.trim() ? step.stepIntent : `Step ${i + 1}`;
      return `${i + 1}) ${label} — ${step.filesSelected.length} files, ${step.tokensCompiled} tokens`;
    });
    return header + lines.join("\n");
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount, StepIndex } from "#core/types/units.js";
import type { InclusionTier } from "#core/types/enums.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { ToolOutput } from "#core/types/compilation-types.js";

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

### Tier 2 — path-only

| Type         | Path                 | Factory             |
| ------------ | -------------------- | ------------------- |
| StepIndex    | #core/types/units.js | toStepIndex(n)      |
| TokenCount   | #core/types/units.js | toTokenCount(n)     |
| RelativePath | #core/types/paths.js | toRelativePath(raw) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create ConversationCompressor interface

Create `shared/src/core/interfaces/conversation-compressor.interface.ts`. Export interface `ConversationCompressor` with single method `compress(steps: readonly SessionStep[]): string`. Import `SessionStep` from `#core/types/session-dedup-types.js`.

**Verify:** `pnpm typecheck` passes.

### Step 2: Add getSteps to AgenticSessionState

In `shared/src/core/interfaces/agentic-session-state.interface.ts`, add method `getSteps(sessionId: SessionId): readonly SessionStep[]` to the interface (between getPreviouslyShownFiles and recordStep). SessionStep is already imported.

**Verify:** `pnpm typecheck` passes.

### Step 3: Add sessionContextSummary to PromptAssembler

In `shared/src/core/interfaces/prompt-assembler.interface.ts`, add optional sixth parameter `sessionContextSummary?: string` to the `assemble` method signature (after `specFiles?: readonly SelectedFile[]`).

**Verify:** `pnpm typecheck` passes.

### Step 4: Implement ConversationCompressor

Create `shared/src/pipeline/conversation-compressor.ts`. Implement class that implements `ConversationCompressor`: constructor takes no parameters. `compress(steps)`: if `steps.length === 0` return `""`; otherwise return `"Steps completed:\n"` plus one line per step: `${i + 1}) ${step.stepIntent?.trim() ? step.stepIntent : `Step ${i + 1}`} — ${step.filesSelected.length} files, ${step.tokensCompiled} tokens` (use step index 1-based for label fallback). Join lines with `"\n"`. Use immutable patterns (no mutation; map to new array).

**Verify:** `pnpm typecheck` passes.

### Step 5: Wire session summary in run-pipeline-steps

In `shared/src/core/run-pipeline-steps.ts`, add `ConversationCompressor` and `SessionStep` to imports. Extend `PipelineStepsDeps` with required property `readonly conversationCompressor: ConversationCompressor`. Before the call to `deps.promptAssembler.assemble`, compute `sessionContextSummary`: when `request.sessionId` and `deps.agenticSessionState` are both present, set `const steps = deps.agenticSessionState.getSteps(request.sessionId)` and `const sessionContextSummary = deps.conversationCompressor.compress(steps)`; otherwise set `sessionContextSummary = ""`. Pass `sessionContextSummary` as the sixth argument to `assemble` (after `specLadderFiles`). When `sessionContextSummary` is empty string, the assembler will omit the section.

**Verify:** `pnpm typecheck` passes.

### Step 6: Emit Session context in PromptAssembler

In `shared/src/pipeline/prompt-assembler.ts`, add optional parameter `sessionContextSummary?: string` to `assemble` (after `specFiles`). When building `sections`, if `sessionContextSummary` is truthy (non-empty string), insert after `...specParts` and before `"## Context"` the block: `"## Session context"`, `""`, `sessionContextSummary`, `""`. Use the same array spread pattern as for specParts. When `sessionContextSummary` is undefined or empty, do not add the block.

**Verify:** `pnpm typecheck` passes.

### Step 7: Add ConversationCompressor to create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`, import `ConversationCompressorImpl` from `#pipeline/conversation-compressor.js`. In `createPipelineDeps`, instantiate `const conversationCompressor = new ConversationCompressorImpl()` and add `conversationCompressor` to the returned object so it is part of `PipelineStepsDeps`. Ensure the return type includes `conversationCompressor` (it is returned from createPipelineDeps and spread in createFullPipelineDeps).

**Verify:** `pnpm typecheck` passes.

### Step 8: ConversationCompressor tests

Create `shared/src/pipeline/__tests__/conversation-compressor.test.ts`. Tests: `conversation_compressor_empty_returns_empty_string` — call `compress([])`, assert result is `""`. `conversation_compressor_one_step_formats_line` — build one SessionStep with stepIntent `"refactor auth"`, filesSelected length 2, tokensCompiled from toTokenCount(100); call compress([step]); assert result contains `"1)"`, `"refactor auth"`, `"2 files"`, `"100 tokens"`. `conversation_compressor_multiple_steps_ordered` — two steps with different stepIntents; call compress(steps); assert result contains two numbered lines in order. `conversation_compressor_step_intent_fallback` — one step with stepIntent `null`; call compress([step]); assert the line contains `"Step 1"` (or the step index). `conversation_compressor_no_mutation` — call compress twice with the same steps array; assert return values are identical. Use branded types (toStepIndex, toTokenCount, toRelativePath, toISOTimestamp) and minimal SessionStep fixtures.

**Verify:** `pnpm test -- conversation-compressor` passes.

### Step 9: PromptAssembler session context tests

In `shared/src/pipeline/__tests__/prompt-assembler.test.ts`, add test `prompt_assembler_session_context_section_emitted`: call assemble with task, empty files, empty constraints, OUTPUT_FORMAT.PLAIN, undefined for specFiles, and `sessionContextSummary: "Steps completed:\n1) Done."`; assert the returned string contains `"## Session context"` and contains `"1) Done."`. Add test `prompt_assembler_session_context_omitted_when_empty`: call assemble with sessionContextSummary `""` and with sessionContextSummary `undefined` (two calls); assert neither result contains `"## Session context"`. Update any existing assemble call that passes five arguments to pass a sixth (undefined or "") so typecheck passes.

**Verify:** `pnpm test -- prompt-assembler` passes.

### Step 10: Add getSteps to compilation-runner mocks

In `shared/src/pipeline/__tests__/compilation-runner.test.ts`, find every mock or stub that implements or satisfies `AgenticSessionState` (objects that have getPreviouslyShownFiles and recordStep). Add `getSteps: () => []` to each so the interface is satisfied. Ensure no test breaks; if a test asserts on prompt content when session state is present, add getSteps that returns a non-empty array and assert the prompt contains the compressed summary.

**Verify:** `pnpm test -- compilation-runner` passes.

### Step 11: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                           | Description                                                   |
| --------------------------------------------------- | ------------------------------------------------------------- |
| conversation_compressor_empty_returns_empty_string  | compress([]) returns ""                                       |
| conversation_compressor_one_step_formats_line       | One step yields line with 1), intent, file count, token count |
| conversation_compressor_multiple_steps_ordered      | Two steps yield two numbered lines in order                   |
| conversation_compressor_step_intent_fallback        | stepIntent null yields "Step 1" (or index) in line            |
| conversation_compressor_no_mutation                 | Same steps twice yields identical string                      |
| prompt_assembler_session_context_section_emitted    | sessionContextSummary provided yields ## Session context      |
| prompt_assembler_session_context_omitted_when_empty | sessionContextSummary "" or undefined omits section           |

## Acceptance Criteria

- [ ] All files created/modified per Files table
- [ ] ConversationCompressor interface and implementation match signature
- [ ] AgenticSessionState has getSteps; PromptAssembler.assemble has sessionContextSummary
- [ ] When sessionId and agenticSessionState present, getSteps and compress run and summary passed to assemble
- [ ] When either absent, sessionContextSummary "" passed; no ## Session context when empty
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
