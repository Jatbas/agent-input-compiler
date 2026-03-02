# Task 063: TypeDeclarationCompactor

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** DocstringTrimmer

## Goal

Implement a ContentTransformer that collapses multi-line type declarations in .d.ts content to single-line form by replacing newlines within each declaration with a single space, reducing tokens while preserving valid declaration structure.

## Architecture Notes

- Implements existing ContentTransformer interface (core/interfaces). No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package, pure string/line-based logic. Format-specific: fileExtensions = [".d.ts"].
- getExtension in content-transformer-pipeline.ts must return ".d.ts" for paths ending in ".d.ts" so this transformer is the only format-specific match for declaration files.
- Chosen approach: line-based scan with brace counting for declaration boundaries; no TypeScript API (pipeline must not import adapters).

## Files

| Action | Path                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/type-declaration-compactor.ts`                                                                              |
| Create | `shared/src/pipeline/__tests__/type-declaration-compactor.test.ts`                                                               |
| Modify | `shared/src/pipeline/content-transformer-pipeline.ts` (getExtension returns ".d.ts" for paths ending in ".d.ts")                 |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate TypeDeclarationCompactor, add to transformers after lockFileSkipper) |

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
export class TypeDeclarationCompactor implements ContentTransformer {
  readonly id = "type-declaration-compactor";
  readonly fileExtensions: readonly FileExtension[] = [toFileExtension(".d.ts")];

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

### Step 1: Implement TypeDeclarationCompactor

Create `shared/src/pipeline/type-declaration-compactor.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath`, `toFileExtension` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Module constant: `DTS_EXTENSIONS: readonly FileExtension[] = [toFileExtension(".d.ts")]`.
- In `transform`: if `content.length === 0` return `content`. Otherwise, split content into lines using `content.split("\n")`. Use a line-based scan: iterate over lines and detect top-level declaration starts (a line that after trimming matches start of `type`, `interface`, `enum`, or `declare`, optionally preceded by `export`). From each declaration start, accumulate lines until the declaration end: for `type` alias, end at the first line containing `;`; for `interface` and `enum`, track brace depth and end when depth returns to 0 and the line contains `}` or `};`; for `declare`, end at the next line that is a new declaration start or at `;`. Collapse each accumulated block to one line by joining with a single space (replace newlines and surrounding whitespace with one space). Concatenate collapsed blocks and any non-declaration lines (blank lines or lines that are not part of a declaration) preserving their place. Return the resulting string. Export class `TypeDeclarationCompactor` with `readonly id = "type-declaration-compactor"`, `readonly fileExtensions = DTS_EXTENSIONS`, and `transform(content: string, tier: InclusionTier, filePath: RelativePath): string` with explicit return type `string`.

**Verify:** `pnpm typecheck` passes. File exists and exports `TypeDeclarationCompactor`.

### Step 2: getExtension support for .d.ts

In `shared/src/pipeline/content-transformer-pipeline.ts`, change `getExtension` so that paths ending in `.d.ts` yield the extension `.d.ts`. Replace the body of `getExtension(path: string)` with: if `path.endsWith(".d.ts")` return `".d.ts"`; otherwise return `path.slice(path.lastIndexOf("."))` when `path.lastIndexOf(".")` is >= 0, else `""`.

**Verify:** `pnpm typecheck` passes. A path `"src/types.d.ts"` passed to `getExtension` would return `".d.ts"` (verify by inspection or a quick test).

### Step 3: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `TypeDeclarationCompactor` from `#pipeline/type-declaration-compactor.js`.
- After the line that creates `lockFileSkipper`, add: `const typeDeclarationCompactor = new TypeDeclarationCompactor();`
- In the `transformers` array, append `typeDeclarationCompactor` after `lockFileSkipper`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `whitespaceNormalizer`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`, `typeDeclarationCompactor`.

**Verify:** `pnpm typecheck` passes. Grep for `typeDeclarationCompactor` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 4: Add tests

Create `shared/src/pipeline/__tests__/type-declaration-compactor.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `TypeDeclarationCompactor` from `../type-declaration-compactor.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Constant: `path = toRelativePath("src/types.d.ts")`.
- Tests:
  - **multi_line_type_collapsed:** Content is a multi-line `type X = ...` declaration (type over two or more lines). After transform, the declaration appears on one line (newlines replaced by space).
  - **multi_line_interface_collapsed:** Content is a multi-line `interface Y { ... }`. After transform, the interface body is on one line.
  - **multi_line_enum_collapsed:** Content is a multi-line `enum Z { A, B }`. After transform, the enum is on one line.
  - **declare_block_collapsed:** Content is a multi-line `declare module "x" { ... }` or `declare function f(): void;`. After transform, the declare block is on one line.
  - **single_line_unchanged:** Content is one or more declarations already on a single line each. Result equals content.
  - **empty_content_returns_unchanged:** Content is `""`. Result is `""`.
  - **no_declaration_content_unchanged:** Content has no type/interface/enum/declare (plain text). Result equals content.
  - **safety_d_ts_structure_preserved:** Content is valid .d.ts with multiple declarations. After transform, output contains the same declaration keywords and balanced braces; no structural corruption.

**Verify:** `pnpm test shared/src/pipeline/__tests__/type-declaration-compactor.test.ts` passes.

### Step 5: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

Read the test output and note the actual `tokensCompiled` value. Read `test/benchmarks/baseline.json` and compare against the current `token_count` for entry "1".

- If actual tokensCompiled is less than baseline token_count: update `test/benchmarks/baseline.json` entry "1" with `{ "token_count": <actual>, "duration_ms": <actual> }` to lock in the improvement. Re-run the benchmark test to confirm it passes with the new baseline.
- If actual tokensCompiled is greater than or equal to baseline token_count: no baseline update. The benchmark test must still pass.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                        | Description                                                         |
| -------------------------------- | ------------------------------------------------------------------- |
| multi_line_type_collapsed        | Multi-line type alias collapsed to one line                         |
| multi_line_interface_collapsed   | Multi-line interface collapsed to one line                          |
| multi_line_enum_collapsed        | Multi-line enum collapsed to one line                               |
| declare_block_collapsed          | Multi-line declare block collapsed to one line                      |
| single_line_unchanged            | Already single-line declarations left unchanged                     |
| empty_content_returns_unchanged  | Empty string returned unchanged                                     |
| no_declaration_content_unchanged | Content with no type/interface/enum/declare left unchanged          |
| safety_d_ts_structure_preserved  | Compacted output preserves declaration structure (keywords, braces) |

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
