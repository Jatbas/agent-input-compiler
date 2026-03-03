# Task 067: ImportDeduplicator

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** (none — Phase L transformers are independent)

## Goal

Implement a ContentTransformer that deduplicates import statements within each file: group by module specifier and merge named bindings so duplicate imports from the same module become one line, reducing tokens without changing semantics.

## Architecture Notes

- Implements existing ContentTransformer interface. No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package, pure string/regex logic. Non-format-specific: fileExtensions = [] so it runs on every file; when content has no import-like lines, return unchanged.
- Within-file only: transform is per-file; "across multiple files" in the MVP spec means the transformer is applied to every file, not that state is shared across files.
- Wiring: Insert ImportDeduplicator after docstringTrimmer, before whitespaceNormalizer in the transformers array.

## Files

| Action | Path                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/import-deduplicator.ts`                                                                                                |
| Create | `shared/src/pipeline/__tests__/import-deduplicator.test.ts`                                                                                 |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate and add ImportDeduplicator after docstringTrimmer, before whitespaceNormalizer) |

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
export class ImportDeduplicator implements ContentTransformer {
  readonly id = "import-deduplicator";
  readonly fileExtensions: readonly FileExtension[] = [];

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

### Step 1: Implement ImportDeduplicator

Create `shared/src/pipeline/import-deduplicator.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- In `transform`: if `content.length === 0` return `content`. Otherwise, parse the content for ES/TS import and require() lines (`import ... from "..."`, `import "..."`, `const x = require("...")`). Group lines by module specifier (normalized string). For each specifier, merge named bindings into one import statement; preserve one line per specifier in order of first occurrence. Emit non-import lines unchanged in place. Return the resulting string. Use pure string/regex logic; no external library. Export class `ImportDeduplicator` with `readonly id = "import-deduplicator"`, `readonly fileExtensions: readonly FileExtension[] = []`, and `transform(content: string, tier: InclusionTier, filePath: RelativePath): string` with explicit return type `string`. Max 60 lines per function; extract helpers as needed.

**Verify:** `pnpm typecheck` passes. File exists and exports `ImportDeduplicator`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `ImportDeduplicator` from `#pipeline/import-deduplicator.js`.
- After the line that creates `docstringTrimmer`, add: `const importDeduplicator = new ImportDeduplicator();`
- In the `transformers` array, insert `importDeduplicator` after `docstringTrimmer` and before `whitespaceNormalizer`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `importDeduplicator`, `whitespaceNormalizer`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`, `cssVariableSummarizer`, `typeDeclarationCompactor`.

**Verify:** `pnpm typecheck` passes. Grep for `importDeduplicator` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/import-deduplicator.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `ImportDeduplicator` from `../import-deduplicator.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Constant: `pathTs = toRelativePath("src/foo.ts")`.
- Tests:
  - **duplicate_named_imports_same_specifier_merged:** Content has two import lines from the same module with different named bindings (`import { a } from "mod";` and `import { b } from "mod";`). After transform, output has one import line with both names merged for that specifier.
  - **duplicate_import_line_removed:** Content has the same import line twice. After transform, output has that line once.
  - **no_imports_unchanged:** Content has no import-like lines (plain code). After transform, output equals content.
  - **empty_content_returns_unchanged:** Content is `""`. After transform, result is `""`.
  - **safety_python_indentation_preserved:** Content is Python (`def f():\n    pass`) with no import syntax. After transform, output equals content.
  - **safety_yaml_structure_unchanged:** Content is YAML (`key: value`). After transform, output equals content.
  - **safety_jsx_structure_unchanged:** Content is JSX (`<Component />`) or JS with imports; after transform, structure is preserved (balanced tags or valid import output).

**Verify:** `pnpm test shared/src/pipeline/__tests__/import-deduplicator.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

The benchmark test auto-ratchets `test/benchmarks/baseline.json`: if the actual token count is lower than the stored baseline, the test writes the new values to disk automatically. No manual editing of `baseline.json` is needed. Read the test output and note whether the baseline was ratcheted or unchanged.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                     | Description                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| duplicate_named_imports_same_specifier_merged | Two import lines from same module with different names merged into one line |
| duplicate_import_line_removed                 | Identical import line appears twice; output has it once                     |
| no_imports_unchanged                          | Content with no import-like lines is unchanged                              |
| empty_content_returns_unchanged               | Empty string returns unchanged                                              |
| safety_python_indentation_preserved           | Python content without import syntax unchanged                              |
| safety_yaml_structure_unchanged               | YAML content unchanged                                                      |
| safety_jsx_structure_unchanged                | JSX/content structure preserved after transform                             |

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
