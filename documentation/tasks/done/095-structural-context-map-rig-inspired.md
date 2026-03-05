# Task 095: Structural context map (RIG-inspired)

> **Status:** Done
> **Phase:** P (Context Quality & Token Efficiency)
> **Layer:** pipeline (+ core interface, runner, bootstrap)
> **Depends on:** —

## Goal

Produce a compact, deterministic project structure summary from the RepoMap and inject it into the compiled prompt as a "## Project structure" section before "## Context", so the model receives an architectural overview before code (RIG 2026–inspired; 57.8% efficiency gain from deterministic maps).

## Architecture Notes

- OCP: New interface StructuralMapBuilder + pipeline implementation; PromptAssembler gains optional 7th parameter; runner calls builder and passes result to assemble. No modification of existing pipeline step logic beyond assembler signature.
- ADR-010: branded types; immutability (no mutation of RepoMap or inputs). Core and pipeline only — no storage, no adapter.
- First of its kind: no shared utility extraction; build(repoMap) logic is specific to this component.

## Files

| Action | Path                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/structural-map-builder.interface.ts`                                                  |
| Create | `shared/src/pipeline/structural-map-builder.ts`                                                                   |
| Create | `shared/src/pipeline/__tests__/structural-map-builder.test.ts`                                                    |
| Modify | `shared/src/core/interfaces/prompt-assembler.interface.ts` (add optional 7th param structuralMap)                 |
| Modify | `shared/src/pipeline/prompt-assembler.ts` (inject ## Project structure when structuralMap present and non-empty)  |
| Modify | `shared/src/core/run-pipeline-steps.ts` (add structuralMapBuilder to deps; call build(repoMap); pass to assemble) |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate StructuralMapBuilder, add to returned deps)           |
| Modify | `shared/src/pipeline/__tests__/prompt-assembler.test.ts` (tests for structural map section)                       |

## Interface / Signature

```typescript
// StructuralMapBuilder — new interface
import type { RepoMap } from "#core/types/repo-map.js";

export interface StructuralMapBuilder {
  build(repoMap: RepoMap): string;
}
```

```typescript
// StructuralMapBuilder class — no constructor params (stateless)
// In pipeline file: import type { StructuralMapBuilder as IStructuralMapBuilder } from "#core/interfaces/structural-map-builder.interface.js"
export class StructuralMapBuilder implements IStructuralMapBuilder {
  constructor() {}

  build(repoMap: RepoMap): string {
    // Derive directory tree from repoMap.files[].path to max depth 4;
    // one line per directory: "path/ (n files)", sorted alphabetically;
    // empty repo returns "".
  }
}
```

PromptAssembler change — interface and class gain optional 7th parameter:

```typescript
// PromptAssembler.assemble signature (add structuralMap?)
assemble(
  task: TaskClassification,
  files: readonly SelectedFile[],
  constraints: readonly string[],
  format: OutputFormat,
  specFiles?: readonly SelectedFile[],
  sessionContextSummary?: string,
  structuralMap?: string,
): Promise<string>;
```

When `structuralMap !== undefined && structuralMap !== ""`, insert before "## Context": `["## Project structure", "", structuralMap, ""]`. Otherwise omit the section.

## Dependent Types

### Tier 0 — verbatim

```typescript
// RepoMap + FileEntry — StructuralMapBuilder reads repoMap.files and file.path
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";
import type { Bytes, TokenCount } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface FileEntry {
  readonly path: RelativePath;
  readonly language: string;
  readonly sizeBytes: Bytes;
  readonly estimatedTokens: TokenCount;
  readonly lastModified: ISOTimestamp;
}

export interface RepoMap {
  readonly root: AbsolutePath;
  readonly files: readonly FileEntry[];
  readonly totalFiles: number;
  readonly totalTokens: TokenCount;
}
```

### Tier 1 — signature + path

Not applicable for StructuralMapBuilder.

### Tier 2 — path-only

| Type           | Path                                   | Factory               |
| -------------- | -------------------------------------- | --------------------- |
| `RelativePath` | `shared/src/core/types/paths.js`       | `toRelativePath(raw)` |
| `AbsolutePath` | `shared/src/core/types/paths.js`       | `toAbsolutePath(raw)` |
| `TokenCount`   | `shared/src/core/types/units.js`       | —                     |
| `ISOTimestamp` | `shared/src/core/types/identifiers.js` | —                     |

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Create StructuralMapBuilder interface

In `shared/src/core/interfaces/structural-map-builder.interface.ts`, add the interface with import of `RepoMap` from `#core/types/repo-map.js` and method `build(repoMap: RepoMap): string`.

**Verify:** File exists; interface exported; no lint errors.

### Step 2: Implement StructuralMapBuilder

In `shared/src/pipeline/structural-map-builder.ts`, implement the interface. Constructor takes no parameters. `build(repoMap)`:

- If `repoMap.files.length === 0`, return `""`.
- From `repoMap.files` collect directory prefixes of each `file.path` up to depth 4 (split by `/`, take segments 0..depth-1, rejoin). Count files per directory prefix. Sort directory strings alphabetically. Output one line per directory: `{dir}/ ({count} files)`. Join lines with `\n`. Return that string.

Use reduce/spread only; no mutation. Deterministic: same RepoMap always yields same string.

**Verify:** Implementation passes typecheck; no use of `let`, `.push()`, or `.sort()` mutating.

### Step 3: Wire builder in run-pipeline-steps

In `shared/src/core/run-pipeline-steps.ts`: import type `StructuralMapBuilder` from `#core/interfaces/structural-map-builder.interface.js`. Add `structuralMapBuilder: StructuralMapBuilder` to the `PipelineStepsDeps` interface. After `sessionContextSummary` is computed and before `assembledPrompt`, compute `const structuralMap = deps.structuralMapBuilder.build(repoMap);`. Pass `structuralMap` as the 7th argument to `deps.promptAssembler.assemble(...)`.

**Verify:** `runPipelineSteps` typechecks; assemble is called with 7 args (task, ladderFiles, constraints, format, specLadderFiles, sessionContextSummary, structuralMap).

### Step 4a: Add optional structuralMap to PromptAssembler interface

In `shared/src/core/interfaces/prompt-assembler.interface.ts`, add optional 7th parameter `structuralMap?: string` to `assemble`.

**Verify:** Interface matches intended signature.

### Step 4b: Inject ## Project structure in PromptAssembler

In `shared/src/pipeline/prompt-assembler.ts`, add 7th parameter `structuralMap?: string` to `assemble`. When `structuralMap !== undefined && structuralMap !== ""`, build a block `["## Project structure", "", structuralMap, ""]` and insert it after `sessionContextBlock` and before `"## Context"` in the `sections` array. When absent or empty, do not add the section.

**Verify:** Assemble with 7th arg non-empty includes "## Project structure" before "## Context"; without 7th arg or with "" prompt unchanged.

### Step 5: Wire StructuralMapBuilder in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`, import `StructuralMapBuilder` from the pipeline implementation, instantiate `new StructuralMapBuilder()`, and add it to the returned object as `structuralMapBuilder`. Ensure `PipelineStepsDeps` type in `run-pipeline-steps.ts` includes `structuralMapBuilder` (add to interface if not already present).

**Verify:** `createPipelineDeps` and `createFullPipelineDeps` return object includes `structuralMapBuilder`; typecheck passes.

### Step 6: Unit tests for StructuralMapBuilder

In `shared/src/pipeline/__tests__/structural-map-builder.test.ts`, add tests:

- `build_empty_repo`: RepoMap with `files: []` returns `""`.
- `build_single_file`: RepoMap with one file with path `src/index.ts` returns string containing the directory segment `src/`.
- `build_multiple_dirs`: RepoMap with paths in different directories returns lines for each top-level directory with correct file counts.
- `build_deterministic`: Same RepoMap passed twice to `build()` returns identical string.

Use `toRelativePath` and RepoMap shape from core types; no external I/O.

**Verify:** `pnpm test shared/src/pipeline/__tests__/structural-map-builder.test.ts` passes.

### Step 7: PromptAssembler tests for structural map section

In `shared/src/pipeline/__tests__/prompt-assembler.test.ts`:

- Add test `assemble_includes_project_structure_when_provided`: call `assemble` with 7th argument `"src/ (2 files)"`. Assert the returned string includes `"## Project structure"` and the content before `"## Context"`.
- Add test `assemble_omits_project_structure_when_empty`: call `assemble` with 6 args (no 7th) or 7th `""`. Assert the returned string does not contain `"## Project structure"`.

**Verify:** All prompt-assembler tests pass.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                         | Description                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| build_empty_repo                                  | RepoMap with files [] returns ""                                                |
| build_single_file                                 | RepoMap with one file returns string containing that path's directory           |
| build_multiple_dirs                               | RepoMap with paths in different dirs returns tree lines with file counts        |
| build_deterministic                               | Same RepoMap twice returns identical string                                     |
| assemble_includes_project_structure_when_provided | assemble with structuralMap set includes ## Project structure before ## Context |
| assemble_omits_project_structure_when_empty       | assemble without 7th param or with "" has no ## Project structure section       |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] StructuralMapBuilder interface and class match; assemble signature updated
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
