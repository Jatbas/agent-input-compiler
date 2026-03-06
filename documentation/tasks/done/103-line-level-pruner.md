# Task 103: Line-level pruner within matched chunks (SWE-Pruner)

> **Status:** Done
> **Phase:** Q (Research-Backed Quality & Security)
> **Layer:** pipeline
> **Depends on:** Chunk-level file inclusion (Phase P)

## Goal

Score lines within L0 files against intent subject tokens and remove irrelevant lines while keeping syntax-only lines, structural keywords, and a ±1 context window around matches. Runs after the summarisation ladder when subject tokens are present. For L0 files with `resolvedContent` (from chunk-level processing), prunes the resolved content. For L0 files without `resolvedContent` (e.g. tier-demoted files that stayed at L0), reads content from disk via `FileContentReader` before pruning. Non-L0 files (L1/L2/L3) are already summarised and pass through unchanged.

## Architecture Notes

- New pipeline step (OCP): LineLevelPruner runs after SummarisationLadder when `task.subjectTokens.length > 0`; output is passed to PromptAssembler. No change to ladder or assembler contracts.
- Async interface: `prune` returns `Promise<readonly SelectedFile[]>` because it may read from disk for L0 files lacking `resolvedContent`.
- Deterministic, heuristic line scoring — a line is kept if any of: (a) any line within a ±1 window contains a subject token (case-insensitive), (b) it is syntax-only (whitespace and structural characters `{}[]();,`), (c) it starts with a structural keyword (`return`, `break`, `continue`, `else`, `case`, `default`, `throw`). No external library; pure string logic.
- ADR-010: no new branded types; uses existing SelectedFile, TokenCount, TokenCounter, FileContentReader, InclusionTier.
- Pipeline step: one interface, one impl, one public method; constructor receives `TokenCounter` and `FileContentReader`.
- `PipelineStepsResult` gains a new field `prunedFiles` to preserve `ladderFiles` as the true ladder output. The assembler receives `prunedFiles`.

## Files

| Action | Path                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/core/interfaces/line-level-pruner.interface.ts`                                                         |
| Create | `shared/src/pipeline/line-level-pruner.ts`                                                                          |
| Create | `shared/src/pipeline/__tests__/line-level-pruner.test.ts`                                                           |
| Modify | `shared/src/core/run-pipeline-steps.ts` (add lineLevelPruner to deps, add prunedFiles to result, call after ladder) |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate and add lineLevelPruner)                                |
| Modify | `shared/src/pipeline/__tests__/inspect-runner.test.ts` (add lineLevelPruner to deps)                                |
| Modify | `shared/src/pipeline/__tests__/compilation-runner.test.ts` (add lineLevelPruner to deps)                            |
| Modify | `shared/src/integration/__tests__/full-pipeline.test.ts` (add lineLevelPruner to deps)                              |
| Modify | `shared/src/integration/__tests__/golden-snapshot.test.ts` (add lineLevelPruner to deps)                            |
| Modify | `shared/src/pipeline/inspect-runner.ts` (use prunedFiles for afterPrune in tokenSummary)                            |
| Modify | `shared/src/core/types/inspect-types.ts` (add afterPrune to PipelineTrace.tokenSummary)                             |
| Modify | `shared/src/pipeline/compilation-runner.ts` (use prunedFiles for filesSelected and tiers)                           |

## Interface / Signature

```typescript
// shared/src/core/interfaces/line-level-pruner.interface.ts
import type { SelectedFile } from "#core/types/selected-file.js";

export interface LineLevelPruner {
  prune(
    files: readonly SelectedFile[],
    subjectTokens: readonly string[],
  ): Promise<readonly SelectedFile[]>;
}
```

```typescript
// Class: LineLevelPruner (shared/src/pipeline/line-level-pruner.ts)
import type { LineLevelPruner as ILineLevelPruner } from "#core/interfaces/line-level-pruner.interface.js";
import type { TokenCounter } from "#core/interfaces/token-counter.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const SYNTAX_ONLY_LINE = /^\s*[\s{}\[\]();,]*\s*$/;
const STRUCTURAL_LINE = /^\s*(return|break|continue|else|case|default|throw)\b/;

function lineMatchesToken(line: string, subjectTokens: readonly string[]): boolean {
  const lower = line.toLowerCase();
  return subjectTokens.some((t) => lower.includes(t.toLowerCase()));
}

function computeKeepSet(
  lines: readonly string[],
  subjectTokens: readonly string[],
): ReadonlySet<number> {
  // Build set of matching line indices, then expand by ±1 for context window
  const matchIndices = lines.reduce<readonly number[]>(
    (acc, line, i) => (lineMatchesToken(line, subjectTokens) ? [...acc, i] : acc),
    [],
  );
  const expanded = matchIndices.flatMap((i) => [i - 1, i, i + 1]);
  return new Set(expanded.filter((i) => i >= 0 && i < lines.length));
}

function keepLine(
  lineIndex: number,
  lines: readonly string[],
  keepSet: ReadonlySet<number>,
): boolean {
  if (keepSet.has(lineIndex)) return true;
  const line = lines[lineIndex] ?? "";
  if (SYNTAX_ONLY_LINE.test(line)) return true;
  return STRUCTURAL_LINE.test(line);
}

export class LineLevelPruner implements ILineLevelPruner {
  constructor(
    private readonly tokenCounter: TokenCounter,
    private readonly fileContentReader: FileContentReader,
  ) {}

  async prune(
    files: readonly SelectedFile[],
    subjectTokens: readonly string[],
  ): Promise<readonly SelectedFile[]> {
    if (subjectTokens.length === 0) return files;
    return Promise.all(
      files.map(async (f): Promise<SelectedFile> => {
        if (f.tier !== INCLUSION_TIER.L0) return f;
        const content =
          f.resolvedContent ?? (await this.fileContentReader.getContent(f.path));
        const lines = content.split("\n");
        const keepSet = computeKeepSet(lines, subjectTokens);
        const kept = lines.filter((_, i) => keepLine(i, lines, keepSet));
        const prunedContent = kept.join("\n");
        const estimatedTokens = this.tokenCounter.countTokens(prunedContent);
        return { ...f, resolvedContent: prunedContent, estimatedTokens };
      }),
    );
  }
}
```

## Dependent Types

### Tier 0 — verbatim

SelectedFile (path, language, estimatedTokens, relevanceScore, tier, previouslyShownAtStep?, resolvedContent?) — shared/src/core/types/selected-file.ts. Implementation reads and writes resolvedContent and estimatedTokens. Uses tier to guard against pruning non-L0 files.

### Tier 1 — signature + path

| Type              | Path                                                        | Members     | Purpose                                             |
| ----------------- | ----------------------------------------------------------- | ----------- | --------------------------------------------------- |
| TokenCounter      | shared/src/core/interfaces/token-counter.interface.ts       | countTokens | Recompute tokens after prune                        |
| FileContentReader | shared/src/core/interfaces/file-content-reader.interface.ts | getContent  | Read from disk for L0 files without resolvedContent |

### Tier 2 — path-only

| Type          | Path                           | Factory / Value |
| ------------- | ------------------------------ | --------------- |
| TokenCount    | shared/src/core/types/units.ts | toTokenCount    |
| InclusionTier | shared/src/core/types/enums.ts | INCLUSION_TIER  |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create LineLevelPruner interface

Create `shared/src/core/interfaces/line-level-pruner.interface.ts` with the interface block above: single method `prune(files: readonly SelectedFile[], subjectTokens: readonly string[]) => Promise<readonly SelectedFile[]>`.

**Verify:** `pnpm typecheck` passes.

### Step 2: Implement LineLevelPruner

Create `shared/src/pipeline/line-level-pruner.ts`. Constructor accepts `tokenCounter: TokenCounter` and `fileContentReader: FileContentReader`.

Implement `prune`:

1. If `subjectTokens.length === 0`, return `files` unchanged.
2. Return `Promise.all(files.map(async (f) => ...))`:
   - If `f.tier !== INCLUSION_TIER.L0`, return `f` unchanged (L1/L2/L3 are already summarised).
   - Resolve content: `f.resolvedContent ?? await this.fileContentReader.getContent(f.path)`.
   - Split content by `"\n"` into `lines`.
   - Build a `keepSet: ReadonlySet<number>` — find indices of lines matching any subject token (case-insensitive), then expand each index by ±1 (context window) and clamp to `[0, lines.length)`.
   - Filter lines: keep a line at index `i` if (a) `keepSet.has(i)`, (b) the line matches `SYNTAX_ONLY_LINE` regex `^\s*[\s{}\[\]();,]*\s*$`, or (c) the line matches `STRUCTURAL_LINE` regex `^\s*(return|break|continue|else|case|default|throw)\b`.
   - Rejoin kept lines with `"\n"` → `prunedContent`.
   - Set `resolvedContent: prunedContent` and `estimatedTokens: this.tokenCounter.countTokens(prunedContent)`.
   - Return new object via spread; do not mutate.

**Verify:** `pnpm typecheck` passes.

### Step 3a: Wire LineLevelPruner in run-pipeline-steps

In `shared/src/core/run-pipeline-steps.ts`:

1. Add `import type { LineLevelPruner } from "#core/interfaces/line-level-pruner.interface.js";`.
2. Add `readonly lineLevelPruner: LineLevelPruner;` to `PipelineStepsDeps`.
3. Add `readonly prunedFiles: readonly SelectedFile[];` to `PipelineStepsResult`.
4. After `const ladderFiles = await deps.summarisationLadder.compress(...)`, add:
   ```
   const prunedFiles = task.subjectTokens.length > 0
     ? await deps.lineLevelPruner.prune(ladderFiles, task.subjectTokens)
     : ladderFiles;
   ```
5. Pass `prunedFiles` (not `ladderFiles`) to `deps.promptAssembler.assemble(...)`.
6. In the return object, keep `ladderFiles` as the raw ladder output and add `prunedFiles`.

**Verify:** `pnpm typecheck` passes.

### Step 3b: Instantiate LineLevelPruner in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`: import `LineLevelPruner` from `#pipeline/line-level-pruner.js`; instantiate `const lineLevelPruner = new LineLevelPruner(tiktokenAdapter, fileContentReader);`; add `lineLevelPruner` to the returned deps object.

**Verify:** `pnpm typecheck` passes.

### Step 4a: Add lineLevelPruner to inspect-runner.test.ts

In `shared/src/pipeline/__tests__/inspect-runner.test.ts`: add `lineLevelPruner` to every `deps` object. Use a mock: `{ prune: (files: readonly SelectedFile[]) => Promise.resolve([...files]) }` cast to `LineLevelPruner`.

**Verify:** `pnpm test shared/src/pipeline/__tests__/inspect-runner.test.ts` passes.

### Step 4b: Add lineLevelPruner to compilation-runner.test.ts

In `shared/src/pipeline/__tests__/compilation-runner.test.ts`: import `LineLevelPruner` from `#pipeline/line-level-pruner.js` and add `lineLevelPruner: new LineLevelPruner(tiktokenAdapter, mockFileContentReader)` to every `deps` object. Use the existing `tiktokenAdapter` and `mockFileContentReader` variables in scope in that file.

**Verify:** `pnpm test shared/src/pipeline/__tests__/compilation-runner.test.ts` passes.

### Step 4c: Add lineLevelPruner to full-pipeline.test.ts

In `shared/src/integration/__tests__/full-pipeline.test.ts`: import `LineLevelPruner` from `#pipeline/line-level-pruner.js` and add `lineLevelPruner: new LineLevelPruner(tiktokenAdapter, fileContentReader)` to the `deps` object (use the variables already in scope).

**Verify:** `pnpm test shared/src/integration/__tests__/full-pipeline.test.ts` passes.

### Step 4d: Add lineLevelPruner to golden-snapshot.test.ts

In `shared/src/integration/__tests__/golden-snapshot.test.ts`: import `LineLevelPruner` from `#pipeline/line-level-pruner.js` and add `lineLevelPruner: new LineLevelPruner(tokenCounter, fileContentReader)` to the `deps` object (use the variables already in scope).

**Verify:** `pnpm test shared/src/integration/__tests__/golden-snapshot.test.ts` passes.

### Step 5: Add unit tests for LineLevelPruner

Create `shared/src/pipeline/__tests__/line-level-pruner.test.ts`. Use a mock `FileContentReader`: `{ getContent: (path: RelativePath) => Promise.resolve(contentMap.get(path) ?? "") }`. Use a mock `TokenCounter`: `{ countTokens: (t: string) => toTokenCount(t.length) }`.

Tests:

1. `prune_when_non_L0_tier_returns_unchanged` — pass L1/L2 files with resolvedContent, assert result is deep equal to input (pruner skips non-L0).
2. `prune_when_subjectTokens_empty_returns_unchanged` — pass L0 files with `resolvedContent` and `subjectTokens: []`, assert `resolvedContent` unchanged.
3. `prune_keeps_lines_matching_subject_token` — one L0 file with `resolvedContent` containing a line with "auth", `subjectTokens: ["auth"]`, assert that line appears in output.
4. `prune_removes_lines_matching_no_token` — content with a line that has no token, is not syntax-only, not structural, and not within ±1 of a match; assert that line not in output.
5. `prune_keeps_syntax_only_lines` — content with line `"  }  "` or `");"`, assert line kept.
6. `prune_keeps_structural_keyword_lines` — content with lines `"  return result;"`, `"  break;"`, `"  throw new Error('x');"` and no matching subject token; assert these lines are kept.
7. `prune_keeps_context_window` — content where line N matches a subject token; assert lines N-1 and N+1 are also kept even though they don't match any token.
8. `prune_reads_from_disk_when_no_resolvedContent` — pass an L0 file without `resolvedContent`; set up mock `FileContentReader` to return content for that path; assert pruner reads from disk and prunes correctly.
9. `prune_updates_estimatedTokens` — mock tokenCounter to return a fixed TokenCount, assert returned file has that estimatedTokens.
10. `prune_no_mutation` — call prune twice with same input, assert identical output arrays.

**Verify:** `pnpm test shared/src/pipeline/__tests__/line-level-pruner.test.ts` passes.

### Step 6a: Add afterPrune to inspect-types

In `shared/src/core/types/inspect-types.ts`: add `readonly afterPrune: TokenCount;` to the `tokenSummary` object type inside `PipelineTrace`.

**Verify:** `pnpm typecheck` passes.

### Step 6b: Update inspect-runner to use prunedFiles

In `shared/src/pipeline/inspect-runner.ts`: set `afterLadder: sumFileTokens(r.ladderFiles)` and `afterPrune: sumFileTokens(r.prunedFiles)` in `tokenSummary`. Keep `summarisationTiers: buildSummarisationTiers(r.ladderFiles)` (tier counts, not post-prune).

**Verify:** `pnpm typecheck` passes. `pnpm test shared/src/pipeline/__tests__/inspect-runner.test.ts` passes.

### Step 7: Update compilation-runner to use prunedFiles (buildFreshMeta and recordSessionStepIfNeeded)

In `shared/src/pipeline/compilation-runner.ts`:

1. In `buildFreshMeta`: set `filesSelected: r.prunedFiles.length` (count of files sent to assembler). Keep `summarisationTiers: buildSummarisationTiers(r.ladderFiles)` for tier counts.
2. In `recordSessionStepIfNeeded`: set `filesSelected: r.prunedFiles.map((f) => f.path)` and build `tiers` from `r.prunedFiles.reduce((acc, f) => ({ ...acc, [f.path]: f.tier }), {} as Record<string, InclusionTier>)`.

**Verify:** `pnpm typecheck` passes. `pnpm test shared/src/pipeline/__tests__/compilation-runner.test.ts` passes.

### Step 8: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                        | Description                                                     |
| ------------------------------------------------ | --------------------------------------------------------------- |
| prune_when_non_L0_tier_returns_unchanged         | L1/L2/L3 files pass through unchanged                           |
| prune_when_subjectTokens_empty_returns_unchanged | Files with resolvedContent but empty subjectTokens unchanged    |
| prune_keeps_lines_matching_subject_token         | Lines containing a subject token are kept                       |
| prune_removes_lines_matching_no_token            | Lines with no token and not syntax-only/structural are removed  |
| prune_keeps_syntax_only_lines                    | Lines that are only whitespace/braces/parens are kept           |
| prune_keeps_structural_keyword_lines             | Lines starting with return/break/continue/throw etc. are kept   |
| prune_keeps_context_window                       | Lines within ±1 of a matching line are kept                     |
| prune_reads_from_disk_when_no_resolvedContent    | L0 files without resolvedContent are read via FileContentReader |
| prune_updates_estimatedTokens                    | estimatedTokens is set from tokenCounter after prune            |
| prune_no_mutation                                | Calling prune twice yields identical results; no input mutation |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly (async return type)
- [ ] All test cases pass
- [ ] L0 files without resolvedContent are read from disk and pruned
- [ ] L1/L2/L3 files pass through unchanged (tier guard)
- [ ] Context window of ±1 line around subject token matches
- [ ] Structural keyword lines (`return`, `break`, `continue`, `else`, `case`, `default`, `throw`) preserved
- [ ] `PipelineStepsResult` has both `ladderFiles` (raw ladder output) and `prunedFiles` (after pruning)
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
