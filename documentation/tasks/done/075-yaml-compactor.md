# Task 075: YamlCompactor

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** (none — Phase L transformers are independent)

## Goal

Implement a ContentTransformer that compacts YAML content for .yaml/.yml files: remove whole-line comment lines, normalize indentation to 2 spaces, and collapse single-key blocks to one line, reducing tokens while preserving valid YAML structure.

## Architecture Notes

- Implements existing ContentTransformer interface. No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package, pure string/regex/line-based logic. Format-specific: fileExtensions = [".yaml", ".yml"]. No js-yaml or other YAML library — zero new dependencies.
- Wiring: Insert YamlCompactor after htmlToMarkdownTransformer, before cssVariableSummarizer in the transformers array.

## Files

| Action | Path                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create | `shared/src/pipeline/yaml-compactor.ts`                                                                                                          |
| Create | `shared/src/pipeline/__tests__/yaml-compactor.test.ts`                                                                                           |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate YamlCompactor and add after htmlToMarkdownTransformer, before cssVariableSummarizer) |

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
export class YamlCompactor implements ContentTransformer {
  readonly id = "yaml-compactor";
  readonly fileExtensions: readonly FileExtension[] = YAML_EXTENSIONS;

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

### Step 1: Implement YamlCompactor

Create `shared/src/pipeline/yaml-compactor.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath`, `toFileExtension` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Module constant: `YAML_EXTENSIONS: readonly FileExtension[]` with `toFileExtension(".yaml")` and `toFileExtension(".yml")`.
- In `transform`: if `content.length === 0` return `content`. Otherwise: (1) remove lines that match `/^\s*#/` (whole line is comment or comment-only after leading whitespace); (2) normalize indentation so each line’s leading spaces are converted to 2-space-per-level (detect indent step from first non-empty line, then normalize to 2 spaces per level); (3) where a line is a key followed by exactly one child line of the form two-space-indented `key: value`, collapse to one line as `key: { key: value }` (flow-style map). Preserve relative nesting and structure so output remains valid YAML. If any step would corrupt structure or content is not recognizable YAML, return content unchanged. Never throw. Use pure string/regex/line-based logic; no external library. Export class `YamlCompactor` with `readonly id = "yaml-compactor"`, `readonly fileExtensions = YAML_EXTENSIONS`, and `transform(content: string, tier: InclusionTier, filePath: RelativePath): string` with explicit return type `string`. Max 60 lines per function; extract helpers as needed.

**Verify:** `pnpm typecheck` passes. File exists and exports `YamlCompactor`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `YamlCompactor` from `#pipeline/yaml-compactor.js`.
- After the line that creates `htmlToMarkdownTransformer`, add: `const yamlCompactor = new YamlCompactor();`
- In the `transformers` array, insert `yamlCompactor` after `htmlToMarkdownTransformer` and before `cssVariableSummarizer`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `importDeduplicator`, `whitespaceNormalizer`, `testStructureExtractor`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`, `htmlToMarkdownTransformer`, `yamlCompactor`, `cssVariableSummarizer`, `typeDeclarationCompactor`.

**Verify:** `pnpm typecheck` passes. Grep for `yamlCompactor` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/yaml-compactor.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `YamlCompactor` from `../yaml-compactor.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Constants: `pathYaml = toRelativePath("src/config.yaml")`, `pathYml = toRelativePath("src/config.yml")`.
- Tests:
  - **comment_lines_removed:** Content has whole-line comments (lines matching `/^\s*#/`) and key/value lines. After transform with pathYaml, output does not contain any line that is only comment or comment-after-whitespace; key/value lines are preserved.
  - **indent_normalized:** Content uses 4-space or mixed indent. After transform with pathYaml, output uses consistent 2-space indent per level.
  - **single_value_map_collapsed:** Content has a key with exactly one child line (two-space-indented `subkey: value`). After transform with pathYaml, output contains the single-line flow form for that single-key block.
  - **empty_content_returns_unchanged:** Content `""`. After transform with pathYaml, result is `""`.
  - **no_yaml_pattern_unchanged:** Content is minimal valid YAML with no comment lines, already 2-space indent, no single-key block to collapse. After transform with pathYaml, result equals content or is structurally equivalent.
  - **safety_yaml_structure_preserved:** Content is valid YAML (key: value, list items). After transform with pathYaml, output is valid YAML and structure (keys, values, list) is preserved.
  - **safety_yml_extension_same_behavior:** Same content as used in comment_lines_removed. After transform with pathYml, output equals the result when using pathYaml.

**Verify:** `pnpm test shared/src/pipeline/__tests__/yaml-compactor.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

The benchmark test auto-ratchets `test/benchmarks/baseline.json`: if the actual token count is lower than the stored baseline, the test writes the new values to disk automatically. No manual editing of `baseline.json` is needed. Read the test output and note whether the baseline was ratcheted or unchanged.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                          | Description                                              |
| ---------------------------------- | -------------------------------------------------------- |
| comment_lines_removed              | Whole-line # comments removed, key/value lines preserved |
| indent_normalized                  | Indent normalized to 2 spaces per level                  |
| single_value_map_collapsed         | Single-key block collapsed to one line                   |
| empty_content_returns_unchanged    | Empty string in, empty string out                        |
| no_yaml_pattern_unchanged          | Minimal YAML unchanged when no transformations apply     |
| safety_yaml_structure_preserved    | Output is valid YAML, structure preserved                |
| safety_yml_extension_same_behavior | .yml path gets same result as .yaml                      |

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
