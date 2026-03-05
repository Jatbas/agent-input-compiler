# Task 073: SvgDescriber

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** (none — Phase L transformers are independent)

## Goal

Implement a ContentTransformer that replaces full SVG file content with a short placeholder `[SVG: {viewBox}, {elementCount} elements, {bytes} bytes]`, reducing tokens for .svg files by roughly 95% while preserving summary metadata.

## Architecture Notes

- Implements existing ContentTransformer interface. No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package; pure string/regex. Format-specific: fileExtensions = [".svg"].
- Wiring: Insert SvgDescriber after htmlToMarkdownTransformer, before cssVariableSummarizer in the transformers array.

## Files

| Action | Path                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/svg-describer.ts`                                                                                                          |
| Create | `shared/src/pipeline/__tests__/svg-describer.test.ts`                                                                                           |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate SvgDescriber and add after htmlToMarkdownTransformer, before cssVariableSummarizer) |

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
export class SvgDescriber implements ContentTransformer {
  readonly id = "svg-describer";
  readonly fileExtensions: readonly FileExtension[] = SVG_EXTENSIONS;

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

### Step 1: Implement SvgDescriber

Create `shared/src/pipeline/svg-describer.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath`, `toFileExtension` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Module constant: `SVG_EXTENSIONS: readonly FileExtension[]` with `toFileExtension(".svg")`.
- In `transform`: if `content.length === 0` return `content`. Otherwise: (1) extract viewBox from the first root `<svg` element — match `viewBox=["']([^"']+)["']` (double- or single-quoted) in the content; if no match, use `"—"`; (2) count SVG elements by matching opening tags with `content.match(/<[a-zA-Z][a-zA-Z0-9:-]*/g)` and use the result length, or 0 if null; (3) bytes = `new TextEncoder().encode(content).length`. Return exactly the string `[SVG: ${viewBox}, ${elementCount} elements, ${bytes} bytes]`. Use pure string/regex; no external library. Export class `SvgDescriber` with `readonly id = "svg-describer"`, `readonly fileExtensions = SVG_EXTENSIONS`, and `transform(content: string, tier: InclusionTier, filePath: RelativePath): string` with explicit return type `string`. Max 60 lines per function; extract helpers as needed.

**Verify:** `pnpm typecheck` passes. File exists and exports `SvgDescriber`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `SvgDescriber` from `#pipeline/svg-describer.js`.
- After the line that creates `htmlToMarkdownTransformer`, add: `const svgDescriber = new SvgDescriber();`
- In the `transformers` array, insert `svgDescriber` after `htmlToMarkdownTransformer` and before `cssVariableSummarizer`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `importDeduplicator`, `whitespaceNormalizer`, `testStructureExtractor`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`, `htmlToMarkdownTransformer`, `svgDescriber`, `cssVariableSummarizer`, `typeDeclarationCompactor`.

**Verify:** `pnpm typecheck` passes. Grep for `svgDescriber` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/svg-describer.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `SvgDescriber` from `../svg-describer.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Constant: `pathSvg = toRelativePath("src/icon.svg")`.
- Tests:
  - **viewbox_and_elements_described:** Content `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/><path d="M0 0"/></svg>`. After transform with pathSvg, output matches pattern `[SVG: 0 0 100 100, N elements, M bytes]` with N ≥ 2 and M = byte length of content.
  - **no_viewbox_uses_placeholder:** Content `<svg><rect width="10" height="10"/></svg>`. After transform with pathSvg, output contains `[SVG: —,` and `elements,` and `bytes]`.
  - **empty_content_returns_unchanged:** Content `""`. After transform with pathSvg, result is `""`.
  - **single_element_count:** Content `<svg viewBox="0 0 1 1"><circle/></svg>`. After transform with pathSvg, output contains `elements` and `bytes`; element count is at least 1 (svg and circle).
  - **safety_svg_placeholder_format:** Content is valid SVG with viewBox and multiple elements. After transform with pathSvg, output is exactly of the form `[SVG: {viewBox}, {n} elements, {bytes} bytes]` with no extra text.
  - **safety_svg_extension_same_behavior:** Same content as viewbox_and_elements_described. After transform with pathSvg and with `toRelativePath("src/icon.svg")`, output format is identical (placeholder string).

**Verify:** `pnpm test shared/src/pipeline/__tests__/svg-describer.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

The benchmark test auto-ratchets `test/benchmarks/baseline.json`: if the actual token count is lower than the stored baseline, the test writes the new values to disk automatically. No manual editing of `baseline.json` is needed. Read the test output and note whether the baseline was ratcheted or unchanged.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                          | Description                                             |
| ---------------------------------- | ------------------------------------------------------- |
| viewbox_and_elements_described     | Output contains viewBox value, element count, and bytes |
| no_viewbox_uses_placeholder        | Missing viewBox yields "—" in placeholder               |
| empty_content_returns_unchanged    | Empty string in, empty string out                       |
| single_element_count               | Single child element reflected in count                 |
| safety_svg_placeholder_format      | Output matches [SVG: ...] format exactly                |
| safety_svg_extension_same_behavior | .svg path produces placeholder consistently             |

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
