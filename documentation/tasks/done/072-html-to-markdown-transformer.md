# Task 072: HtmlToMarkdownTransformer

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** (none — Phase L transformers are independent)

## Goal

Implement a ContentTransformer that converts HTML content to Markdown: strip `<style>` and `<script>` blocks, convert HTML tags to Markdown equivalents (headings, links, lists, emphasis, code), reducing tokens for .html/.htm files while preserving semantic meaning.

## Architecture Notes

- Implements existing ContentTransformer interface. No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package, pure string/regex logic. Format-specific: fileExtensions = [".html", ".htm"].
- Wiring: Insert HtmlToMarkdownTransformer after lockFileSkipper, before cssVariableSummarizer in the transformers array.

## Files

| Action | Path                                                                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/html-to-markdown-transformer.ts`                                                                                              |
| Create | `shared/src/pipeline/__tests__/html-to-markdown-transformer.test.ts`                                                                               |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate HtmlToMarkdownTransformer and add after lockFileSkipper, before cssVariableSummarizer) |

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
export class HtmlToMarkdownTransformer implements ContentTransformer {
  readonly id = "html-to-markdown-transformer";
  readonly fileExtensions: readonly FileExtension[] = HTML_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string;
}
```

## Dependent Types

### Tier 0 — verbatim

Interface and parameter types are defined by ContentTransformer (RelativePath, InclusionTier, FileExtension from core).

### Tier 2 — path-only

| Type            | Path                             | Factory                      |
| --------------- | -------------------------------- | ---------------------------- |
| `FileExtension` | `shared/src/core/types/paths.js` | `toFileExtension(raw)`       |
| `RelativePath`  | `shared/src/core/types/paths.js` | `toRelativePath(raw)`        |
| `InclusionTier` | `shared/src/core/types/enums.js` | Use `INCLUSION_TIER.L0` etc. |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Implement HtmlToMarkdownTransformer

Create `shared/src/pipeline/html-to-markdown-transformer.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath`, `toFileExtension` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Module constant: `HTML_EXTENSIONS: readonly FileExtension[]` with `toFileExtension(".html")` and `toFileExtension(".htm")`.
- In `transform`: if `content.length === 0` return `content`. Otherwise: (1) strip `<script>...</script>` and `<style>...</style>` blocks (replace with empty string, case-insensitive tag names); (2) convert block tags to Markdown — `<h1>...</h1>` to `# ...`, `<h2>` to `## `, through `<h6>` to `###### `, `<p>...</p>` to paragraph (content + double newline), `<li>...</li>` to `- ...`, `<br>` to newline; (3) convert inline tags — `<a href="url">text</a>` to `[text](url)`, `<strong>...</strong>` and `<b>...</b>` to `**...**`, `<em>...</em>` and `<i>...</i>` to `*...*`, `<code>...</code>` to `` `...` ``; (4) strip any remaining HTML tags (remove tag delimiters, keep inner text); (5) normalize runs of whitespace to single space and trim. Use pure string/regex; no external library. Export class `HtmlToMarkdownTransformer` with `readonly id = "html-to-markdown-transformer"`, `readonly fileExtensions = HTML_EXTENSIONS`, and `transform(content: string, tier: InclusionTier, filePath: RelativePath): string` with explicit return type `string`. Max 60 lines per function; extract helpers as needed.

**Verify:** `pnpm typecheck` passes. File exists and exports `HtmlToMarkdownTransformer`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `HtmlToMarkdownTransformer` from `#pipeline/html-to-markdown-transformer.js`.
- After the line that creates `lockFileSkipper`, add: `const htmlToMarkdownTransformer = new HtmlToMarkdownTransformer();`
- In the `transformers` array, insert `htmlToMarkdownTransformer` after `lockFileSkipper` and before `cssVariableSummarizer`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `importDeduplicator`, `whitespaceNormalizer`, `testStructureExtractor`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`, `htmlToMarkdownTransformer`, `cssVariableSummarizer`, `typeDeclarationCompactor`.

**Verify:** `pnpm typecheck` passes. Grep for `htmlToMarkdownTransformer` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/html-to-markdown-transformer.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `HtmlToMarkdownTransformer` from `../html-to-markdown-transformer.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Constants: `pathHtml = toRelativePath("src/page.html")`, `pathHtm = toRelativePath("src/page.htm")`.
- Tests:
  - **html_heading_converted:** Content `<h1>Title</h1><h2>Sub</h2>`. After transform with pathHtml, output contains `# Title` and `## Sub`.
  - **html_link_converted:** Content `<a href="https://x.com">link</a>`. After transform with pathHtml, output contains `[link](https://x.com)`.
  - **script_block_stripped:** Content `<body><script>alert(1);</script>ok</body>`. After transform with pathHtml, output does not contain `alert(1)` and contains `ok`.
  - **style_block_stripped:** Content `<head><style>.x{}</style></head><p>text</p>`. After transform with pathHtml, output does not contain `.x{}` and contains `text`.
  - **empty_content_returns_unchanged:** Content `""`. After transform with pathHtml, result is `""`.
  - **safety_html_structure_markdown_valid:** Content is simple HTML with headings, one link, one list. After transform with pathHtml, output has well-formed Markdown (heading lines start with #, link in [text](url) form, list items start with -).
  - **safety_htm_extension_same_behavior:** Same content as html_heading_converted. After transform with pathHtm, output equals the result when using pathHtml.

**Verify:** `pnpm test shared/src/pipeline/__tests__/html-to-markdown-transformer.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

The benchmark test auto-ratchets `test/benchmarks/baseline.json`: if the actual token count is lower than the stored baseline, the test writes the new values to disk automatically. No manual editing of `baseline.json` is needed. Read the test output and note whether the baseline was ratcheted or unchanged.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                            | Description                             |
| ------------------------------------ | --------------------------------------- |
| html_heading_converted               | Output contains # and ## for h1/h2      |
| html_link_converted                  | Output contains [text](url) for anchor  |
| script_block_stripped                | Script body removed from output         |
| style_block_stripped                 | Style body removed from output          |
| empty_content_returns_unchanged      | Empty string in, empty string out       |
| safety_html_structure_markdown_valid | Output is well-formed Markdown          |
| safety_htm_extension_same_behavior   | .htm path gets same conversion as .html |

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
