# Task 066: TestStructureExtractor

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** TypeDeclarationCompactor (Done)

## Goal

Implement a ContentTransformer that reduces test file tokens by keeping describe/it/test names and stripping callback bodies for files whose path contains ".test." or ".spec.", so the pipeline preserves test structure without full body content.

## Architecture Notes

- Implements existing ContentTransformer interface (core/interfaces). No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package, pure string/brace-counting logic. Format-specific: fileExtensions list all extensions that test files use (.ts, .js, .tsx, .jsx, .mjs, .cjs, .py, .go, .rs, .java, .rb, .php, .swift, .kt, .dart). Path gate in transform: return content unchanged when filePath does not contain ".test." or ".spec.".
- Wiring: Insert TestStructureExtractor before commentStripper so it is the first format-specific transformer for .ts/.js; non-test paths pass through unchanged in transform.

## Files

| Action | Path                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/test-structure-extractor.ts`                                                                                        |
| Create | `shared/src/pipeline/__tests__/test-structure-extractor.test.ts`                                                                         |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate and add TestStructureExtractor before commentStripper in transformers array) |

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
export class TestStructureExtractor implements ContentTransformer {
  readonly id = "test-structure-extractor";
  readonly fileExtensions = TEST_SPEC_EXTENSIONS;

  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

## Dependent Types

### Tier 0 — verbatim

Interface and parameter types are defined by ContentTransformer above (RelativePath, InclusionTier, FileExtension from core).

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

### Step 1: Implement TestStructureExtractor

Create `shared/src/pipeline/test-structure-extractor.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath`, `toFileExtension` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Module constant: `TEST_SPEC_EXTENSIONS: readonly FileExtension[]` with `toFileExtension(".ts")`, `toFileExtension(".js")`, `toFileExtension(".tsx")`, `toFileExtension(".jsx")`, `toFileExtension(".mjs")`, `toFileExtension(".cjs")`, `toFileExtension(".py")`, `toFileExtension(".go")`, `toFileExtension(".rs")`, `toFileExtension(".java")`, `toFileExtension(".rb")`, `toFileExtension(".php")`, `toFileExtension(".swift")`, `toFileExtension(".kt")`, `toFileExtension(".dart")`.
- Helper: `isTestOrSpecPath(path: string): boolean` — return true when path includes ".test." or ".spec.".
- In `transform`: if `content.length === 0` return `content`. If `!isTestOrSpecPath(filePath)` return `content` unchanged. Otherwise, scan content for `describe(`, `it(`, or `test(` call sites: for each, keep the call and first string argument; use brace-counting to find the callback body (from the `{` after the arrow or `function` to the matching `}`) and replace that body with `{}`. Return the concatenated result. Export class `TestStructureExtractor` with `readonly id = "test-structure-extractor"`, `readonly fileExtensions = TEST_SPEC_EXTENSIONS`, and `transform(content: string, tier: InclusionTier, filePath: RelativePath): string` with explicit return type `string`. Max 60 lines per function; extract helpers as needed.

**Verify:** `pnpm typecheck` passes. File exists and exports `TestStructureExtractor`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `TestStructureExtractor` from `#pipeline/test-structure-extractor.js`.
- After the line that creates `whitespaceNormalizer`, add: `const testStructureExtractor = new TestStructureExtractor();`
- In the `transformers` array, insert `testStructureExtractor` after `whitespaceNormalizer` and before `commentStripper`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `whitespaceNormalizer`, `testStructureExtractor`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`, `cssVariableSummarizer`, `typeDeclarationCompactor`.

**Verify:** `pnpm typecheck` passes. Grep for `testStructureExtractor` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/test-structure-extractor.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `TestStructureExtractor` from `../test-structure-extractor.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Constant: `pathTest = toRelativePath("src/foo.test.ts")`, `pathSpec = toRelativePath("src/bar.spec.js")`, `pathPlain = toRelativePath("src/impl.ts")`.
- Tests:
  - **describe_it_names_kept_bodies_stripped:** Content is `describe("Suite", () => { const x = 1; }); it("case", () => { expect(1).toBe(1); });`. After transform with pathTest, output contains "Suite" and "case" and callback bodies are replaced with `{}`.
  - **non_test_path_unchanged:** Transform with pathPlain and content `describe("X", () => { });` returns content unchanged.
  - **test_path_describe_it_preserved:** Transform with pathTest and content containing describe/it; assert output has same describe/it names and balanced braces.
  - **empty_content_returns_unchanged:** Content `""` with pathTest; result is `""`.
  - **safety_ts_test_structure_preserved:** Content is valid .test.ts with describe/it blocks; after transform, output has balanced braces and same describe/it names.
  - **safety_spec_js_structure_preserved:** Content is valid .spec.js with describe/it; after transform, output has balanced braces and same describe/it names.

**Verify:** `pnpm test shared/src/pipeline/__tests__/test-structure-extractor.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

The benchmark test auto-ratchets `test/benchmarks/baseline.json`: if the actual token count is lower than the stored baseline, the test writes the new values to disk automatically. No manual editing of `baseline.json` is needed. Read the test output and note whether the baseline was ratcheted or unchanged.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                              | Description                                                |
| -------------------------------------- | ---------------------------------------------------------- |
| describe_it_names_kept_bodies_stripped | describe/it names kept, callback bodies replaced with {}   |
| non_test_path_unchanged                | Path without .test./.spec. returns content unchanged       |
| test_path_describe_it_preserved        | Test path: describe/it names and balanced braces preserved |
| empty_content_returns_unchanged        | Empty string returned unchanged                            |
| safety_ts_test_structure_preserved     | .test.ts output has balanced braces and describe/it names  |
| safety_spec_js_structure_preserved     | .spec.js output has balanced braces and describe/it names  |

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
