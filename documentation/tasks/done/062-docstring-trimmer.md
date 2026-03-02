# Task 062: DocstringTrimmer

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** LicenseHeaderStripper, Base64InlineDataStripper, LongStringLiteralTruncator

## Goal

Implement a ContentTransformer that replaces docstring bodies (Python """...""", '''...''', and JSDoc /\*_ ... _/) longer than 200 characters with a placeholder that preserves the delimiter and reports the original length, reducing tokens while preserving structure.

## Architecture Notes

- Implements existing ContentTransformer interface (core/interfaces). No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package, pure string/RegExp. Same pattern as LongStringLiteralTruncator and LicenseHeaderStripper.
- Non-format-specific: fileExtensions = []. Wired fourth in transformers array (after longStringLiteralTruncator, before whitespaceNormalizer).
- Chosen approach: regex-based replace with callback; no AST or new dependency.

## Files

| Action | Path                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/docstring-trimmer.ts`                                                                                               |
| Create | `shared/src/pipeline/__tests__/docstring-trimmer.test.ts`                                                                                |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate DocstringTrimmer, insert into transformers after longStringLiteralTruncator) |

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
export class DocstringTrimmer implements ContentTransformer {
  readonly id = "docstring-trimmer";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string;
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

### Step 1: Implement DocstringTrimmer

Create `shared/src/pipeline/docstring-trimmer.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Module constant: `MAX_DOCSTRING_LENGTH = 200`.
- Regex for Python double-triple-quoted docstring: `"""[\s\S]*?"""` (non-greedy). Regex for Python single-triple-quoted: `'''[\s\S]*?'''`. Regex for JSDoc block: `/\*\*[\s\S]*?\*\//g`.
- In `transform`: if `content.length === 0` return `content`. Otherwise run replace for each pattern in order (double-triple, single-triple, JSDoc). Replace function: for each match, extract inner content (for `"""..."""` use `match.slice(3, -3)`; for `'''...'''` use `match.slice(3, -3)`; for `/** ... */` use `match.slice(4, -2)`). If inner.length > MAX_DOCSTRING_LENGTH, return opening delimiter + `[docstring trimmed: ` + inner.length + ` chars]` + closing delimiter; else return the full match. For `"""` the opening is `"""` and closing is `"""`; for `'''` same; for JSDoc opening is `/**` and closing is `*/`.
- Export class `DocstringTrimmer` with `readonly id = "docstring-trimmer"`, `readonly fileExtensions: readonly FileExtension[] = []`, and `transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string` with explicit return type `string`.

**Verify:** `pnpm typecheck` passes. File exists and exports `DocstringTrimmer`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `DocstringTrimmer` from `#pipeline/docstring-trimmer.js`.
- After the line that creates `longStringLiteralTruncator`, add: `const docstringTrimmer = new DocstringTrimmer();`
- In the `transformers` array, insert `docstringTrimmer` after `longStringLiteralTruncator` and before `whitespaceNormalizer`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `whitespaceNormalizer`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`.

**Verify:** `pnpm typecheck` passes. Grep for `docstringTrimmer` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/docstring-trimmer.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `DocstringTrimmer` from `../docstring-trimmer.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Constant: `path = toRelativePath("src/foo.ts")`.
- Tests:
  - **long_python_double_docstring_trimmed:** Content is `"""` + 201 copies of "a" + `"""`. After transform, result contains `[docstring trimmed: 201 chars]` and does not contain the 201 "a"s.
  - **long_python_single_docstring_trimmed:** Content is `'''` + 201 copies of "b" + `'''`. After transform, result contains the placeholder with triple single-quote delimiters and correct N.
  - **long_jsdoc_block_trimmed:** Content is `/**` + 201 copies of "c" + `*/`. After transform, result contains `[docstring trimmed: 201 chars]` and the JSDoc delimiters.
  - **short_docstring_unchanged:** Content is `"""short"""`. Result equals content.
  - **empty_content_returns_unchanged:** Content is `""`. Result is `""`.
  - **no_docstring_pattern_unchanged:** Content is `const x = 1;`. Result equals content.
  - **safety_python_indentation_preserved:** Content is `def f():\n    pass`. Result equals content.
  - **safety_yaml_structure_unchanged:** Content is `key: value`. Result equals content.
  - **safety_jsx_structure_unchanged:** Content is `<Component />`. Result equals content.

**Verify:** `pnpm test shared/src/pipeline/__tests__/docstring-trimmer.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

Read the test output and note the actual `tokensCompiled` (or equivalent) value. Read `test/benchmarks/baseline.json` and compare against the current `token_count` for entry "1".

- If actual tokensCompiled is less than baseline token_count: update `test/benchmarks/baseline.json` entry "1" with `{ "token_count": <actual>, "duration_ms": <actual> }` to lock in the improvement. Re-run the benchmark test to confirm it passes with the new baseline.
- If actual tokensCompiled is greater than or equal to baseline token_count: no baseline update. The benchmark test must still pass.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                            | Description                                                         |
| ------------------------------------ | ------------------------------------------------------------------- |
| long_python_double_docstring_trimmed | Python """...""" > 200 chars replaced by placeholder with correct N |
| long_python_single_docstring_trimmed | Python '''...''' > 200 chars replaced by placeholder with correct N |
| long_jsdoc_block_trimmed             | JSDoc /\*_ ... _/ > 200 chars replaced by placeholder               |
| short_docstring_unchanged            | Short docstring left unchanged                                      |
| empty_content_returns_unchanged      | Empty content returned unchanged                                    |
| no_docstring_pattern_unchanged       | Code without docstring delimiters unchanged                         |
| safety_python_indentation_preserved  | Python-style content unchanged                                      |
| safety_yaml_structure_unchanged      | YAML content unchanged                                              |
| safety_jsx_structure_unchanged       | JSX content unchanged                                               |

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
