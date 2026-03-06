# Task 102: Constraints preamble in prompt assembler (LitM)

> **Status:** Done
> **Phase:** Q (Research-Backed Quality & Security)
> **Layer:** pipeline
> **Depends on:** —

## Goal

Duplicate the top three constraints as a short preamble before the bulk context in the compiled prompt to mitigate "Lost in the Middle" (LitM) — models attend better to content near the start; the full ## Constraints section remains after context.

## Architecture Notes

- security.md: constraints section stays after context; preamble is additive.
- mvp-progress.md Phase Q: "Duplicate top-3 constraints as short preamble before bulk context to mitigate LitM."
- No interface or signature change; behavior change only inside PromptAssembler.assemble().
- Immutability: build preamble with constraints.slice(0, 3) and spread into sections; no mutation.

## Files

| Action | Path                                                                      |
| ------ | ------------------------------------------------------------------------- |
| Modify | `shared/src/pipeline/prompt-assembler.ts` (add constraints preamble)      |
| Modify | `shared/src/pipeline/__tests__/prompt-assembler.test.ts` (preamble tests) |

## Interface / Signature

```typescript
// Interface — unchanged (Source: shared/src/core/interfaces/prompt-assembler.interface.ts)
import type { TaskClassification } from "#core/types/task-classification.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { OutputFormat } from "#core/types/enums.js";

export interface PromptAssembler {
  assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    format: OutputFormat,
    specFiles?: readonly SelectedFile[],
    sessionContextSummary?: string,
    structuralMap?: string,
  ): Promise<string>;
}
```

```typescript
// Class — constructor unchanged; assemble() gains preamble logic, signature unchanged
export class PromptAssembler implements IPromptAssembler {
  constructor(private readonly fileContentReader: FileContentReader) {}

  async assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    format: OutputFormat,
    specFiles?: readonly SelectedFile[],
    sessionContextSummary?: string,
    structuralMap?: string,
  ): Promise<string> {
    // ... existing logic ...
    // When constraints.length > 0: build constraintsPreamble = ["## Constraints (key)", "", ...constraints.slice(0, 3).map((c) => `- ${c}`), ""]; insert ...constraintsPreamble after projectStructureBlock and before "## Context" in sections array. Full constraintSection unchanged (after context).
  }
}
```

## Dependent Types

No new types. Existing assemble() uses TaskClassification, SelectedFile, OutputFormat (all already in use). constraints is readonly string[]; use constraints.slice(0, 3) and .map((c) => `- ${c}`) only.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add constraints preamble in prompt-assembler.ts

In `shared/src/pipeline/prompt-assembler.ts`, inside `assemble()` after `projectStructureBlock` is defined and before building `sections`:

- Define `constraintsPreamble`: when `constraints.length > 0`, set to `["## Constraints (key)", "", ...constraints.slice(0, 3).map((c) => `- ${c}`), ""]`; otherwise set to `[]`.
- In the `sections` array, insert `...constraintsPreamble` after `...projectStructureBlock` and before `"## Context"`. Order becomes: Task, Task Classification, specParts, sessionContextBlock, projectStructureBlock, constraintsPreamble, "## Context", contextParts, constraintSection, "## Output Format", FORMAT_DESCRIPTIONS[format].
- Do not change the construction or position of `constraintSection` (full constraints after context).

**Verify:** `pnpm typecheck` passes. Run `pnpm test shared/src/pipeline/__tests__/prompt-assembler.test.ts`; existing tests still pass.

### Step 2: Add tests for constraints preamble

In `shared/src/pipeline/__tests__/prompt-assembler.test.ts` add four tests:

1. **prompt_assembler_constraints_preamble_emitted:** Call assemble with task, one file (makeFile("a.ts")), constraints `["C1", "C2", "C3"]`, OUTPUT_FORMAT.PLAIN. Assert the result contains `"## Constraints (key)"`, contains `"- C1"`, `"- C2"`, `"- C3"`, and that the first occurrence of `"## Context"` appears after the substring `"## Constraints (key)"` (preamble before context).

2. **prompt_assembler_constraints_preamble_top_three_only:** Call assemble with task, empty files, constraints `["A", "B", "C", "D", "E"]`, OUTPUT_FORMAT.PLAIN. Define the preamble as the substring of the result before the first occurrence of `"## Context"`. Assert the result contains `"## Constraints (key)"` and exactly the first three as bullets (`"- A"`, `"- B"`, `"- C"`) in the preamble, and that `"## Constraints"` (full section) contains all five (`"- A"` through `"- E"`).

3. **prompt_assembler_constraints_preamble_omitted_when_empty:** Call assemble with task, empty files, constraints `[]`, OUTPUT_FORMAT.PLAIN. Assert the result does not contain `"## Constraints (key)"`.

4. **prompt_assembler_constraints_preamble_one_or_two:** Call assemble once with constraints `["Only one"]` and once with constraints `["First", "Second"]`. Assert the first result contains `"## Constraints (key)"` and exactly one bullet `"- Only one"` before `"## Context"`; assert the second result contains two bullets `"- First"` and `"- Second"` before `"## Context"` (no extra empty bullets).

**Verify:** `pnpm test shared/src/pipeline/__tests__/prompt-assembler.test.ts` passes.

### Step 3: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                | Description                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| prompt_assembler_constraints_preamble_emitted            | Preamble section and first 3 constraints appear before ## Context     |
| prompt_assembler_constraints_preamble_top_three_only     | With 5 constraints, preamble has only first 3; full section has all 5 |
| prompt_assembler_constraints_preamble_omitted_when_empty | No preamble when constraints array is empty                           |
| prompt_assembler_constraints_preamble_one_or_two         | Preamble with 1 or 2 constraints shows that many bullets only         |

## Acceptance Criteria

- [ ] prompt-assembler.ts builds constraintsPreamble from constraints.slice(0, 3) and inserts it before "## Context"
- [ ] Full "## Constraints" section remains after "## Context" unchanged
- [ ] All four new test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] Single-line comments only, explain why not what

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
