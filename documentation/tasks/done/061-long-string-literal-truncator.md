# Task 061: LongStringLiteralTruncator

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** LicenseHeaderStripper, Base64InlineDataStripper

## Goal

Implement a ContentTransformer that replaces double-quoted and single-quoted string literals longer than 200 characters with a placeholder that preserves quote type and reports the original length, reducing tokens while preserving semantic structure.

## Architecture Notes

- Implements existing ContentTransformer interface (core/interfaces). No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package, pure string/RegExp. Same pattern as Base64InlineDataStripper and LicenseHeaderStripper.
- Non-format-specific: fileExtensions = []. Wired third in transformers array (after base64InlineDataStripper, before whitespaceNormalizer).
- Chosen approach: regex-based replace with callback; no AST or new dependency.

## Files

| Action | Path                                                                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create | `shared/src/pipeline/long-string-literal-truncator.ts`                                                                                                 |
| Create | `shared/src/pipeline/__tests__/long-string-literal-truncator.test.ts`                                                                                  |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate LongStringLiteralTruncator, insert into transformers array after base64InlineDataStripper) |

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
export class LongStringLiteralTruncator implements ContentTransformer {
  readonly id = "long-string-literal-truncator";
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

### Step 1: Implement LongStringLiteralTruncator

Create `shared/src/pipeline/long-string-literal-truncator.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Module constant: `MAX_STRING_LITERAL_LENGTH = 200`.
- Regex for double-quoted strings (respecting backslash escapes): match `"(?:[^"\\]|\\.)*"`. Regex for single-quoted: `'(?:[^'\\]|\\.)*'`.
- In `transform`: if `content.length === 0` return `content`. Otherwise run `content.replace(doubleQuotedRegex, replaceFn)` then `.replace(singleQuotedRegex, replaceFn)`. Replace function: for each match, extract inner content (between quotes). If inner length > MAX_STRING_LITERAL_LENGTH, return opening quote + `[string literal truncated: ` + inner.length + ` chars]` + closing quote; else return the full match. Use the same quote character as the matched literal for the placeholder.
- Export class `LongStringLiteralTruncator` with `readonly id = "long-string-literal-truncator"`, `readonly fileExtensions: readonly FileExtension[] = []`, and `transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string` with explicit return type `string`.

**Verify:** `pnpm typecheck` passes. File exists and exports `LongStringLiteralTruncator`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `LongStringLiteralTruncator` from `#pipeline/long-string-literal-truncator.js`.
- After the line that creates `base64InlineDataStripper`, add: `const longStringLiteralTruncator = new LongStringLiteralTruncator();`
- In the `transformers` array, insert `longStringLiteralTruncator` after `base64InlineDataStripper` and before `whitespaceNormalizer`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `whitespaceNormalizer`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`.

**Verify:** `pnpm typecheck` passes. Grep for `longStringLiteralTruncator` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/long-string-literal-truncator.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `LongStringLiteralTruncator` from `../long-string-literal-truncator.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Constant: `path = toRelativePath("src/foo.ts")`.
- Tests:
  - **long_double_quoted_truncated:** Content is a double-quoted string with inner length > 200: opening double quote, 201 copies of the character "a", closing double quote. After transform, result contains `[string literal truncated: 201 chars]` and does not contain the 201 "a"s.
  - **long_single_quoted_truncated:** Content is a single-quoted string with inner length > 200. After transform, result contains the placeholder with single quotes and correct N.
  - **short_literal_unchanged:** Content is `const x = "short";`. Result equals content.
  - **empty_content_returns_unchanged:** Content is `""`. Result is `""`.
  - **escaped_quotes_inside_preserved:** Content is one double-quoted string containing `\"` and length > 200. Replace treats it as one literal and replaces with placeholder (no broken parsing).
  - **multiple_long_literals_both_replaced:** Content has two long string literals. Result contains two placeholders.
  - **safety_python_indentation_preserved:** Content is `def f():\n    pass`. Result equals content.
  - **safety_yaml_structure_unchanged:** Content is `key: value`. Result equals content.
  - **safety_jsx_structure_unchanged:** Content is `<Component />`. Result equals content.

**Verify:** `pnpm test shared/src/pipeline/__tests__/long-string-literal-truncator.test.ts` passes.

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

| Test case                            | Description                                                             |
| ------------------------------------ | ----------------------------------------------------------------------- |
| long_double_quoted_truncated         | Double-quoted string > 200 chars replaced by placeholder with correct N |
| long_single_quoted_truncated         | Single-quoted string > 200 chars replaced by placeholder with correct N |
| short_literal_unchanged              | Short string literal left unchanged                                     |
| empty_content_returns_unchanged      | Empty content returned unchanged                                        |
| escaped_quotes_inside_preserved      | Long literal with escaped quotes replaced as one unit                   |
| multiple_long_literals_both_replaced | Two long literals yield two placeholders                                |
| safety_python_indentation_preserved  | Python-style content unchanged                                          |
| safety_yaml_structure_unchanged      | YAML content unchanged                                                  |
| safety_jsx_structure_unchanged       | JSX content unchanged                                                   |

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
