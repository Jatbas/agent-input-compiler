# Task 005: Phase C — ContentTransformerPipeline, SummarisationLadder, PromptAssembler

> **Status:** Pending
> **Phase:** C (Pipeline Steps 1–8)
> **Layer:** pipeline
> **Depends on:** Phase B (all Done), Task 002 (core pipeline types)

## Goal

Implement the final three pipeline steps: content transformation (pipeline + MVP transformers), tiered summarisation, and prompt assembly — completing the full Phase C pipeline.

## Architecture Notes

- Pipeline layer may import from `#core/` only — no adapters, storage, Node, or external packages
- Constructor injection: TransformerPipeline receives ContentTransformer[]; Ladder receives LanguageProvider[] + tokenCounter function
- No `Date.now()`, `Math.random()`, or mutating array methods; return new objects
- Content transformers run after Guard and before Ladder (spec §4 Step 5.5)

## Files

| Action | Path                                                       |
| ------ | ---------------------------------------------------------- |
| Create | `shared/src/pipeline/whitespace-normalizer.ts`             |
| Create | `shared/src/pipeline/comment-stripper.ts`                  |
| Create | `shared/src/pipeline/json-compactor.ts`                    |
| Create | `shared/src/pipeline/lock-file-skipper.ts`                 |
| Create | `shared/src/pipeline/content-transformer-pipeline.ts`      |
| Create | `shared/src/pipeline/content-transformer-pipeline.test.ts` |
| Create | `shared/src/pipeline/summarisation-ladder.ts`              |
| Create | `shared/src/pipeline/summarisation-ladder.test.ts`         |
| Create | `shared/src/pipeline/prompt-assembler.ts`                  |
| Create | `shared/src/pipeline/prompt-assembler.test.ts`             |

## Interface / Signature

```typescript
// shared/src/pipeline/whitespace-normalizer.ts
import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export class WhitespaceNormalizer implements ContentTransformer {
  readonly id = "whitespace-normalizer";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

Behavior (spec §4 Step 5.5): collapse >=3 blank lines to 1, normalize indent to 2-space, trim trailing whitespace. Non-format-specific (empty fileExtensions → applies to all files after format-specific transformers).

```typescript
// shared/src/pipeline/comment-stripper.ts
import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export class CommentStripper implements ContentTransformer {
  readonly id = "comment-stripper";
  readonly fileExtensions: readonly FileExtension[];

  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

Extensions: `.ts`, `.js`, `.py`, `.go`, `.java`, `.rs`, `.c`, `.cpp`. Non-format-specific (applies after format-specific). Remove line/block comments. Preserve JSDoc `@param`/`@returns` for L1 tier.

```typescript
// shared/src/pipeline/json-compactor.ts
import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export class JsonCompactor implements ContentTransformer {
  readonly id = "json-compactor";
  readonly fileExtensions: readonly FileExtension[];

  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

Extensions: `.json`. Format-specific. Collapse simple arrays/objects to single line; remove formatting whitespace; preserve readability for nested structures.

```typescript
// shared/src/pipeline/lock-file-skipper.ts
import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export class LockFileSkipper implements ContentTransformer {
  readonly id = "lock-file-skipper";
  readonly fileExtensions: readonly FileExtension[];

  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

Extensions: match `*-lock.*`, `*.lock`, `shrinkwrap.*` patterns. Format-specific. Replace content with `[Lock file: {name}, {bytes} bytes — skipped]`.

```typescript
// shared/src/pipeline/content-transformer-pipeline.ts
import type { ContentTransformerPipeline as IContentTransformerPipeline } from "#core/interfaces/content-transformer-pipeline.interface.js";
import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TransformContext, TransformResult } from "#core/types/transform-types.js";

export class ContentTransformerPipeline implements IContentTransformerPipeline {
  constructor(private readonly transformers: readonly ContentTransformer[]) {}

  transform(files: readonly SelectedFile[], context: TransformContext): TransformResult;
}
```

Execution order (spec §4 Step 5.5):

1. Format-specific transformers first (first match by extension wins — one per file max)
2. Non-format-specific (WhitespaceNormalizer, CommentStripper) run after
3. If `context.rawMode === true` → skip all transformers
4. If file path is in `context.directTargetPaths` → skip format-specific transformers only (non-format still run)

```typescript
// shared/src/pipeline/summarisation-ladder.ts
import type { SummarisationLadder as ISummarisationLadder } from "#core/interfaces/summarisation-ladder.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount } from "#core/types/units.js";

export class SummarisationLadder implements ISummarisationLadder {
  constructor(
    private readonly languageProviders: readonly LanguageProvider[],
    private readonly tokenCounter: (text: string) => TokenCount,
  ) {}

  compress(files: readonly SelectedFile[], budget: TokenCount): readonly SelectedFile[];
}
```

Algorithm (spec §4 Step 6):

1. If totalTokens <= budget → return files unchanged
2. Sort by relevanceScore ascending (lowest first). Tie-break: more tokens first; then alphabetical path
3. Compress lowest-scoring file to next tier (L0→L1→L2→L3)
4. L1/L2 use LanguageProvider when available; fallback regex for L2; L1 skipped if no provider
5. Recalculate total tokens
6. Repeat until fits or all files at L3
7. If still over at L3 → drop lowest-scoring files until fits; emit warning
8. Return new SelectedFile[] with updated tier fields — never mutate input

```typescript
// shared/src/pipeline/prompt-assembler.ts
import type { PromptAssembler as IPromptAssembler } from "#core/interfaces/prompt-assembler.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { OutputFormat } from "#core/types/enums.js";

export class PromptAssembler implements IPromptAssembler {
  assemble(
    task: TaskClassification,
    files: readonly SelectedFile[],
    constraints: readonly string[],
    format: OutputFormat,
  ): string;
}
```

Template (spec §4 Step 8):

```
## Task
{intent — from task.matchedKeywords context or passed separately}

## Task Classification
Type: {taskClass} (confidence: {confidence})

## Context
{for each file}
### {filePath} [Tier: {tier}]
{content at appropriate tier}
{end for}

## Constraints
{constraints — one per line, prefixed with "- "; omit section if empty}

## Output Format
{format description per spec table}
```

Output format descriptions:

- `unified-diff`: "Respond with a unified diff (--- a/ +++ b/ @@ ... @@). Do not include any text outside the diff blocks."
- `full-file`: "Respond with the complete contents of each modified file. Begin each file with a header comment: // FILE: {path}"
- `markdown`: "Respond in Markdown. Use headings, code blocks, and bullet lists as appropriate."
- `json`: "Respond with a single valid JSON object. Do not include any prose, markdown, or explanation outside the JSON."
- `plain`: "Respond in plain text."

## Steps

### Step 1: WhitespaceNormalizer and CommentStripper

Create `whitespace-normalizer.ts` and `comment-stripper.ts` implementing `ContentTransformer`.

**Verify:** `pnpm typecheck` passes.

### Step 2: JsonCompactor and LockFileSkipper

Create `json-compactor.ts` and `lock-file-skipper.ts` implementing `ContentTransformer`.

**Verify:** `pnpm typecheck` passes.

### Step 3: ContentTransformerPipeline implementation + test

Create `content-transformer-pipeline.ts`. Orchestrate format-specific then non-format transformers. Respect rawMode and directTargetPaths bypass. Create `content-transformer-pipeline.test.ts` with cases:

- Format-specific runs before non-format
- rawMode skips all transformers
- directTargetPaths skips format-specific only
- First extension match wins (one format-specific per file)
- TransformMetadata records correct before/after tokens

**Verify:** `pnpm test -- content-transformer-pipeline` passes.

### Step 4: SummarisationLadder implementation + test

Create `summarisation-ladder.ts`. Implement tiered compression algorithm. Create `summarisation-ladder.test.ts` with cases:

- Under-budget returns files unchanged
- Over-budget compresses lowest-scoring first
- Each tier reduces tokens (L0→L1→L2→L3)
- All-at-L3 and still over → drops lowest-scoring files
- Tie-breaking: more tokens first, then alphabetical
- Never mutates input array

**Verify:** `pnpm test -- summarisation-ladder` passes.

### Step 5: PromptAssembler implementation + test

Create `prompt-assembler.ts`. Render template per spec. Create `prompt-assembler.test.ts` with cases:

- Template rendered correctly for `unified-diff` format
- Constraints section omitted when empty
- Each output format uses correct description text
- Multiple files rendered in order

**Verify:** `pnpm test -- prompt-assembler` passes.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all pass, zero warnings.

## Tests

| Test case                               | Description                         |
| --------------------------------------- | ----------------------------------- |
| transformer-pipeline: execution order   | Format-specific before non-format   |
| transformer-pipeline: rawMode           | Skips all transformers              |
| transformer-pipeline: directTargetPaths | Skips format-specific only          |
| transformer-pipeline: metadata          | Records original/transformed tokens |
| summarisation-ladder: under-budget      | Returns unchanged                   |
| summarisation-ladder: compression       | Lowest-scoring compressed first     |
| summarisation-ladder: all-at-L3 drop    | Drops files when still over budget  |
| summarisation-ladder: immutability      | Input array not mutated             |
| prompt-assembler: template              | Correct structure for unified-diff  |
| prompt-assembler: empty constraints     | Constraints section omitted         |
| prompt-assembler: format descriptions   | Each OutputFormat maps correctly    |

## Acceptance Criteria

- [ ] All 10 files created per Files table
- [ ] ContentTransformerPipeline respects execution order and bypass rules from spec
- [ ] SummarisationLadder algorithm matches spec exactly (sort, tier, drop)
- [ ] PromptAssembler template matches spec §4 Step 8
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] No imports from adapters, storage, Node, or external packages

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section to this file with:
   - What you tried
   - What went wrong
   - What decision you need from the user
3. Report to the user and wait for guidance
