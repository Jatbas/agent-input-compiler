# Task 064: CssVariableSummarizer

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** DocstringTrimmer

## Goal

Implement a ContentTransformer that summarizes CSS and SCSS content by keeping the full `:root` variable block (compacted to one line) and replacing all other rule bodies with a placeholder giving the declaration count, reducing tokens while preserving selector names and structure.

## Architecture Notes

- Implements existing ContentTransformer interface (core/interfaces). No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package, pure string/line-based logic. Format-specific: fileExtensions = [".css", ".scss"].
- Chosen approach: brace-counting scan to find block boundaries; :root blocks kept and compacted; non-:root blocks get body replaced with " [N declarations] "; no CSS/SCSS parser library (pipeline must not import adapters).

## Files

| Action | Path                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/css-variable-summarizer.ts`                                                                              |
| Create | `shared/src/pipeline/__tests__/css-variable-summarizer.test.ts`                                                               |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate CssVariableSummarizer, add to transformers after lockFileSkipper) |

## Interface / Signature

```typescript
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: readonly FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

```typescript
export class CssVariableSummarizer implements ContentTransformer {
  readonly id = "css-variable-summarizer";
  readonly fileExtensions: readonly FileExtension[] = [
    toFileExtension(".css"),
    toFileExtension(".scss"),
  ];

  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

## Dependent Types

### Tier 0 — verbatim

Interface and parameter types are defined by ContentTransformer above (RelativePath, InclusionTier, FileExtension from core).

### Tier 2 — path-only

| Type            | Path                             | Factory                                         |
| --------------- | -------------------------------- | ----------------------------------------------- |
| `FileExtension` | `shared/src/core/types/paths.js` | `toFileExtension(raw)`                          |
| `RelativePath`  | `shared/src/core/types/paths.js` | `toRelativePath(raw)`                           |
| `InclusionTier` | `shared/src/core/types/enums.js` | Use `INCLUSION_TIER.L0` (and other tier values) |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Implement CssVariableSummarizer

Create `shared/src/pipeline/css-variable-summarizer.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath`, `toFileExtension` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Module constant: `CSS_EXTENSIONS: readonly FileExtension[] = [toFileExtension(".css"), toFileExtension(".scss")]`.
- In `transform`: if `content.length === 0` return `content`. Otherwise, scan the string for rule blocks using brace counting: find each `{` and its matching `}`; for the substring before the first `{`, trim and test if it ends with `:root` (with optional whitespace). For each block: (1) If the block is a :root block (selector before `{` is `:root`), keep the full block and collapse newlines to a single space. (2) For every other block, keep the selector (and any at-rule header including `@media (...)`) up to and including the opening `{`, then replace the body (between `{` and `}`) with a single space, the literal text `[`, the number N of semicolon-terminated declarations in the body (split body by `;`, trim, filter out empty strings; that length is N), the literal text ` declarations]`, and the closing `}`. Concatenate all processed segments and any text between blocks (whitespace, comments) in order. Return the resulting string. Export class `CssVariableSummarizer` with `readonly id = "css-variable-summarizer"`, `readonly fileExtensions = CSS_EXTENSIONS`, and `transform(content: string, tier: InclusionTier, filePath: RelativePath): string` with explicit return type `string`.

**Verify:** `pnpm typecheck` passes. File exists and exports `CssVariableSummarizer`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `CssVariableSummarizer` from `#pipeline/css-variable-summarizer.js`.
- After the line that creates `lockFileSkipper`, add: `const cssVariableSummarizer = new CssVariableSummarizer();`
- In the `transformers` array, append `cssVariableSummarizer` after `lockFileSkipper`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `whitespaceNormalizer`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`, `cssVariableSummarizer`.

**Verify:** `pnpm typecheck` passes. Grep for `cssVariableSummarizer` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/css-variable-summarizer.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `CssVariableSummarizer` from `../css-variable-summarizer.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Constant: `pathCss = toRelativePath("src/styles.css")`, `pathScss = toRelativePath("src/styles.scss")`.
- Tests:
  - **root_block_kept_compacted:** Content is `:root { --a: 1; --b: 2; }`. After transform, output contains the same variables and values on one line (newlines collapsed to space).
  - **root_plus_rules_summarized:** Content is `:root { }\n.cls { prop: val; }`. After transform, output has the :root block and `.cls { [1 declarations] }`.
  - **multiple_rules_summarized:** Content is `.a { x: 1; }\n.b { y: 2; z: 3; }`. After transform, each block becomes `selector { [N declarations] }` with correct N.
  - **empty_content_returns_unchanged:** Content is `""`. Result is `""`.
  - **no_blocks_unchanged:** Content has no `{` (plain text or only comments). Result equals content.
  - **safety_css_structure_preserved:** Content is valid CSS with multiple rules. After transform, output contains the same selector names and balanced braces; no structural corruption.
  - **safety_scss_structure_preserved:** Content is valid SCSS (nested rules or `$var`). After transform, output preserves selector structure and placeholder counts; no structural corruption.

**Verify:** `pnpm test shared/src/pipeline/__tests__/css-variable-summarizer.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

The benchmark test auto-ratchets `test/benchmarks/baseline.json`: if the actual token count is lower than the stored baseline, the test writes the new values to disk automatically. No manual editing of `baseline.json` is needed.

Read the test output and note whether the baseline was ratcheted (look for "baseline ratcheted" in stdout) or unchanged. If ratcheted, the updated `baseline.json` will appear in the git diff and should be committed with the task.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                       | Description                                                  |
| ------------------------------- | ------------------------------------------------------------ |
| root_block_kept_compacted       | :root block kept and compacted to one line                   |
| root_plus_rules_summarized      | :root kept; other rule becomes selector { [N declarations] } |
| multiple_rules_summarized       | Multiple selector blocks each summarized with correct N      |
| empty_content_returns_unchanged | Empty string returned unchanged                              |
| no_blocks_unchanged             | Content with no { returned unchanged                         |
| safety_css_structure_preserved  | Valid CSS: selector names and braces preserved               |
| safety_scss_structure_preserved | Valid SCSS: structure and placeholder counts preserved       |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] Interface matches signature exactly
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
