# Task 074: MinifiedCodeSkipper

> **Status:** Done
> **Phase:** L (Transformers & Guard)
> **Layer:** pipeline
> **Depends on:** (none — Phase L transformers are independent)

## Goal

Implement a ContentTransformer that replaces minified or build-output file content with a short placeholder `[Minified: {name}, {bytes} bytes — skipped]` when the path indicates minified code (.min.js, .min.css) or output directories (dist/, build/), reducing tokens by roughly 99% for those files.

## Architecture Notes

- Implements existing ContentTransformer interface. No new interface.
- ADR-010: use branded types (RelativePath, FileExtension, InclusionTier) from core/types.
- Pipeline transformer: no constructor params, no external package; pure string logic. Non-format-specific (fileExtensions = []) so path-based detection runs in transform; avoids changing content-transformer-pipeline getExtension for .min.js/.min.css.
- Wiring: Insert MinifiedCodeSkipper after lockFileSkipper, before htmlToMarkdownTransformer in the transformers array.

## Files

| Action | Path |
| ------ | ---- |
| Create | `shared/src/pipeline/minified-code-skipper.ts` |
| Create | `shared/src/pipeline/__tests__/minified-code-skipper.test.ts` |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate MinifiedCodeSkipper and add after lockFileSkipper, before htmlToMarkdownTransformer) |

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
export class MinifiedCodeSkipper implements ContentTransformer {
  readonly id = "minified-code-skipper";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string;
}
```

## Dependent Types

### Tier 0 — verbatim

Interface and parameter types are defined by ContentTransformer (RelativePath, InclusionTier, FileExtension from core).

### Tier 2 — path-only

| Type | Path | Factory |
| ---- | ---- | ------- |
| `FileExtension` | `shared/src/core/types/paths.js` | `toFileExtension(raw)` |
| `RelativePath` | `shared/src/core/types/paths.js` | `toRelativePath(raw)` |
| `InclusionTier` | `shared/src/core/types/enums.js` | Use `INCLUSION_TIER.L0` etc. |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Implement MinifiedCodeSkipper

Create `shared/src/pipeline/minified-code-skipper.ts`.

- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`; `FileExtension`, `RelativePath` from `#core/types/paths.js`; `InclusionTier` from `#core/types/enums.js`.
- Helper: `isMinifiedPath(path: string): boolean` — lower = path.toLowerCase(); return true if lower.endsWith(".min.js") or lower.endsWith(".min.css") or path.startsWith("dist/") or path.includes("/dist/") or path === "dist" or path.startsWith("build/") or path.includes("/build/") or path === "build".
- Class: `MinifiedCodeSkipper` with `readonly id = "minified-code-skipper"`, `readonly fileExtensions: readonly FileExtension[] = []`.
- In `transform(content, _tier, filePath)`: if content.length === 0 return content. If !isMinifiedPath(filePath) return content. Otherwise: const segments = filePath.split("/"); const name = segments.length > 0 ? (segments[segments.length - 1] ?? filePath) : filePath; const bytes = new TextEncoder().encode(content).length; return exactly `[Minified: ${name}, ${bytes} bytes — skipped]`. Explicit return type `string`. Max 60 lines per function; extract helper as needed.

**Verify:** `pnpm typecheck` passes. File exists and exports `MinifiedCodeSkipper`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`:

- Add named import: `MinifiedCodeSkipper` from `#pipeline/minified-code-skipper.js`.
- After the line that creates `lockFileSkipper`, add: `const minifiedCodeSkipper = new MinifiedCodeSkipper();`
- In the `transformers` array, insert `minifiedCodeSkipper` after `lockFileSkipper` and before `htmlToMarkdownTransformer`. Resulting order: `licenseHeaderStripper`, `base64InlineDataStripper`, `longStringLiteralTruncator`, `docstringTrimmer`, `importDeduplicator`, `whitespaceNormalizer`, `testStructureExtractor`, `commentStripper`, `jsonCompactor`, `lockFileSkipper`, `minifiedCodeSkipper`, `htmlToMarkdownTransformer`, `cssVariableSummarizer`, `typeDeclarationCompactor`.

**Verify:** `pnpm typecheck` passes. Grep for `minifiedCodeSkipper` in create-pipeline-deps.ts shows one declaration and one use in the array.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/minified-code-skipper.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `MinifiedCodeSkipper` from `../minified-code-skipper.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Tests:
  - **min_js_path_returns_placeholder:** filePath = toRelativePath("lib/app.min.js"), content = "x". After transform, output matches `[Minified: app.min.js, 1 bytes — skipped]`.
  - **min_css_path_returns_placeholder:** filePath = toRelativePath("styles/bundle.min.css"), content = "a{b}". After transform, output contains `[Minified:` and `bytes — skipped]`.
  - **dist_segment_returns_placeholder:** filePath = toRelativePath("dist/bundle.js"), content = "code". After transform, output contains `[Minified: bundle.js, 4 bytes — skipped]`.
  - **build_segment_returns_placeholder:** filePath = toRelativePath("build/out.js"), content = "x". After transform, output contains `[Minified: out.js,` and `bytes — skipped]`.
  - **non_minified_path_returns_unchanged:** filePath = toRelativePath("src/index.js"), content = "const x = 1;". After transform, result is exactly content.
  - **empty_content_returns_unchanged:** filePath = toRelativePath("src/foo.js"), content = "". After transform, result is "".
  - **safety_python_indentation_preserved:** filePath = toRelativePath("src/main.py"), content = "def f():\n    pass". After transform, result is unchanged (not a minified path).
  - **safety_yaml_structure_unchanged:** filePath = toRelativePath("config.yml"), content = "key:\n  nested: 1". After transform, result is unchanged.
  - **safety_jsx_structure_unchanged:** filePath = toRelativePath("src/App.tsx"), content = "<div>x</div>". After transform, result is unchanged.

**Verify:** `pnpm test shared/src/pipeline/__tests__/minified-code-skipper.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

The benchmark test auto-ratchets `test/benchmarks/baseline.json`: if the actual token count is lower than the stored baseline, the test writes the new values to disk automatically. No manual editing of `baseline.json` is needed. Read the test output and note whether the baseline was ratcheted or unchanged.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case | Description |
| --------- | ----------- |
| min_js_path_returns_placeholder | Path ending .min.js yields [Minified: name, N bytes — skipped] |
| min_css_path_returns_placeholder | Path ending .min.css yields placeholder |
| dist_segment_returns_placeholder | Path dist/bundle.js yields placeholder |
| build_segment_returns_placeholder | Path build/out.js yields placeholder |
| non_minified_path_returns_unchanged | Path src/index.js leaves content unchanged |
| empty_content_returns_unchanged | Empty string in, empty string out |
| safety_python_indentation_preserved | Non-minified .py path leaves content unchanged |
| safety_yaml_structure_unchanged | Non-minified .yml path leaves content unchanged |
| safety_jsx_structure_unchanged | Non-minified .tsx path leaves content unchanged |

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
