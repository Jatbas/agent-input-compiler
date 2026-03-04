# Task 087: Spec injection in prompt assembler

> **Status:** Done
> **Phase:** N (Specification Compiler)
> **Layer:** pipeline + core (compound)
> **Depends on:** Spec file discovery and scoring (084), Spec-aware summarisation tier (085)

## Goal

When the pipeline has spec files (documentation, ADRs, rules, skills), discover and compress them through the same guard/transform/ladder as code, and inject a "## Specification" section into the compiled prompt before "## Context" so the model receives task briefing and code context in one prompt.

## Architecture Notes

- Project plan §Specification Compiler: same budget → select → compress → assemble pattern for spec context; task briefing before code.
- Reuse SpecFileDiscoverer (084) and ContextResult/SelectedFile; no new interface. Spec RepoMap is built by filtering main repoMap by path prefix (documentation/, .cursor/rules/, .cursor/skills/, or path starting with "adr-").
- Spec files go through same ContextGuard, ContentTransformerPipeline, SummarisationLadder as code; spec budget is 20% of main budget, capped by spec totalTokens.
- ADR-010: use branded types; immutability (no mutation; spread/reduce). Pipeline step and core only — no storage, no new adapter.

## Files

| Action | Path                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify | `shared/src/core/interfaces/prompt-assembler.interface.ts` (add optional 5th param specFiles)                                                                             |
| Modify | `shared/src/pipeline/prompt-assembler.ts` (render ## Specification when specFiles present)                                                                                |
| Modify | `shared/src/core/run-pipeline-steps.ts` (add specFileDiscoverer to deps; filter spec RepoMap; run spec discover/guard/transform/ladder; pass specLadderFiles to assemble) |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate SpecFileDiscoverer, add to returned deps)                                                                     |
| Modify | `shared/src/pipeline/__tests__/prompt-assembler.test.ts` (tests for spec section)                                                                                         |

## Interface / Signature

```typescript
// PromptAssembler — Source: shared/src/core/interfaces/prompt-assembler.interface.ts (after change)
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
  ): Promise<string>;
}
```

```typescript
// PromptAssembler class — constructor unchanged; assemble gains optional 5th parameter
export class PromptAssembler implements IPromptAssembler {
  constructor(private readonly fileContentReader: FileContentReader) {}

  async assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    format: OutputFormat,
    specFiles?: readonly SelectedFile[],
  ): Promise<string> {
    // When (specFiles ?? []).length > 0: build ## Specification section (getContent per spec file), then ## Context, etc. Otherwise unchanged.
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// SelectedFile — already used by assembler
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
import type { RelevanceScore } from "#core/types/scores.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface SelectedFile {
  readonly path: RelativePath;
  readonly language: string;
  readonly estimatedTokens: TokenCount;
  readonly relevanceScore: RelevanceScore;
  readonly tier: InclusionTier;
}
```

### Tier 2 — path-only

| Type         | Path                 | Factory           |
| ------------ | -------------------- | ----------------- |
| TokenCount   | #core/types/units.js | toTokenCount(n)   |
| RelativePath | #core/types/paths.js | toRelativePath(s) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Extend PromptAssembler interface and PipelineStepsDeps

In `shared/src/core/interfaces/prompt-assembler.interface.ts`, add optional fifth parameter to `assemble`: `specFiles?: readonly SelectedFile[]`. Keep all existing parameters and return type.

In `shared/src/core/run-pipeline-steps.ts`, add to `PipelineStepsDeps`: `readonly specFileDiscoverer: SpecFileDiscoverer`. Add import for `SpecFileDiscoverer` from `#core/interfaces/spec-file-discoverer.interface.js`.

**Verify:** `pnpm typecheck` passes.

### Step 2: PromptAssembler — render ## Specification when specFiles present

In `shared/src/pipeline/prompt-assembler.ts`, add optional parameter `specFiles?: readonly SelectedFile[]` to `assemble`. When `(specFiles ?? []).length > 0`: (1) await Promise.all for getContent of each spec file path; (2) build specParts as immutable array of strings: "## Specification", "", then for each spec file "### {file.path} [Tier: {file.tier}]", content, ""; (3) insert specParts before the existing "## Context" and contextParts in the sections array. When specFiles is undefined or empty, do not add "## Specification" and keep current behavior. Use immutable array building (spread or flatMap); do not mutate sections in place.

**Verify:** `pnpm typecheck` passes.

### Step 3: run-pipeline-steps — spec RepoMap filter, discover, guard, transform, ladder, assemble

In `shared/src/core/run-pipeline-steps.ts`, add a helper that returns true when a path is a spec path: `path.startsWith("documentation/") || path.startsWith(".cursor/rules/") || path.startsWith(".cursor/skills/") || path.startsWith("adr-")`. Build specRepoMap from repoMap: filter `repoMap.files` by this predicate; compute totalTokens from filtered entries; construct `{ root: repoMap.root, files: specFiles, totalFiles: specFiles.length, totalTokens: toTokenCount(total) }`.

After computing `contextResult` and before calling `contextGuard.scan(selectedFiles)`, call `deps.specFileDiscoverer.discover(specRepoMap, task, rulePack)` to get `specContextResult`. If `specContextResult.files.length === 0`, set `specLadderFiles = []`. Otherwise: call `deps.contextGuard.scan(specContextResult.files)` and use `safeFiles` as specSafeFiles; call `deps.contentTransformerPipeline.transform(specSafeFiles, TRANSFORM_CONTEXT)` to get specTransformResult; set specBudget = `toTokenCount(Math.min(specContextResult.totalTokens, Math.floor(budget * 0.2)))`; call `deps.summarisationLadder.compress(specTransformResult.files, specBudget)` to get specLadderFiles.

Pass `specLadderFiles` to `deps.promptAssembler.assemble(task, ladderFiles, rulePack.constraints, OUTPUT_FORMAT.UNIFIED_DIFF, specLadderFiles)`. Assign the result to `assembledPrompt` as today.

**Verify:** `pnpm typecheck` passes.

### Step 4: create-pipeline-deps — add SpecFileDiscoverer to deps

In `shared/src/bootstrap/create-pipeline-deps.ts`, import `SpecFileDiscoverer` from `#pipeline/spec-file-discoverer.js`. Instantiate `const specFileDiscoverer = new SpecFileDiscoverer()`. Add `specFileDiscoverer` to the returned object in both `createPipelineDeps` and (via spread from partial) `createFullPipelineDeps`. Ensure the return type includes `specFileDiscoverer` (PipelineStepsDeps already extended in Step 1).

**Verify:** `pnpm typecheck` passes.

### Step 5: Tests

In `shared/src/pipeline/__tests__/prompt-assembler.test.ts`:

- Add test: with one code file and one spec file (path "documentation/readme.md"), mock fileContentReader.getContent to return distinct content per path; call assemble with files and specFiles; assert result includes "## Specification", "### documentation/readme.md", the spec content string, and "## Context" after the Specification section; assert code file content is present.
- Add test: call assemble with specFiles omitted or specFiles: []; assert result does not contain "## Specification"; assert result matches current behavior (Task, Task Classification, Context, Output Format).
- Add test: call assemble with specFiles containing one file; spy or mock getContent; assert getContent was called for that spec file path.

**Verify:** `pnpm test shared/src/pipeline/__tests__/prompt-assembler.test.ts` passes.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                               | Description                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| prompt_assembler_spec_section_emitted   | With code file + spec file, result contains ## Specification, spec path header, spec content, and ## Context after it |
| prompt_assembler_no_spec_when_empty     | With specFiles omitted or [], no ## Specification section; existing behavior preserved                                |
| prompt_assembler_spec_getContent_called | With specFiles containing one path, getContent called for that path                                                   |

## Acceptance Criteria

- [ ] PromptAssembler.assemble accepts optional specFiles and renders "## Specification" before "## Context" when specFiles has length > 0
- [ ] run-pipeline-steps builds spec RepoMap from main repoMap by path filter, runs SpecFileDiscoverer, guard, transform, ladder for spec, passes specLadderFiles to assemble
- [ ] PipelineStepsDeps includes specFileDiscoverer; create-pipeline-deps and createFullPipelineDeps provide it
- [ ] When no spec files exist, behavior unchanged (no Specification section)
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
