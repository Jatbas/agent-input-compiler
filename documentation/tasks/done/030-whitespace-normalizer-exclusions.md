# Task 030: WhitespaceNormalizer exclusions

> **Status:** Done
> **Phase:** 0.5 Phase I — Live Wiring & Bug Fixes
> **Layer:** pipeline
> **Depends on:** WhitespaceNormalizer, ContentTransformerPipeline, createPipelineDeps

## Goal

Add an exclusion list to WhitespaceNormalizer so files whose extension is in the list are left unchanged, avoiding semantic breakage for Markdown, Python, and YAML where whitespace or blank lines are significant.

## Architecture Notes

- Pipeline step receives data only (readonly FileExtension[]); no new interface. Extension derived via string slice (lastIndexOf + slice) so pipeline stays free of node:path.
- Default excluded extensions wired at composition root: .md, .mdx, .py, .yml, .yaml. No config schema change in this task.
- Constructor default excludedExtensions = [] so existing call sites (new WhitespaceNormalizer()) remain valid.

## Files

| Action | Path                                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------- |
| Modify | `shared/src/pipeline/whitespace-normalizer.ts` (add excludedExtensions param and early return in transform) |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (pass default excluded extensions to WhitespaceNormalizer)   |
| Create | `shared/src/pipeline/__tests__/whitespace-normalizer.test.ts`                                               |

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
export class WhitespaceNormalizer implements ContentTransformer {
  readonly id = "whitespace-normalizer";
  readonly fileExtensions: readonly FileExtension[] = [];

  constructor(private readonly excludedExtensions: readonly FileExtension[] = []) {}

  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string {
    // If filePath extension (case-insensitive) is in excludedExtensions, return content unchanged.
    // Otherwise: collapse ≥3 newlines to 2, normalize indent to 2-space, trim trailing, return new string.
  }
}
```

## Dependent Types

### Tier 0 — verbatim

(ContentTransformer and FileExtension/RelativePath from core — component implements interface and uses path string for extension only; no inline type construction beyond existing transform signature.)

### Tier 1 — signature + path

| Type                 | Path                                                          | Members                       | Purpose              |
| -------------------- | ------------------------------------------------------------- | ----------------------------- | -------------------- |
| `ContentTransformer` | `shared/src/core/interfaces/content-transformer.interface.ts` | id, fileExtensions, transform | Contract implemented |

### Tier 2 — path-only

| Type            | Path                             | Factory                |
| --------------- | -------------------------------- | ---------------------- |
| `FileExtension` | `shared/src/core/types/paths.js` | `toFileExtension(raw)` |
| `RelativePath`  | `shared/src/core/types/paths.js` | `toRelativePath(raw)`  |
| `InclusionTier` | `shared/src/core/types/enums.js` | INCLUSION_TIER         |

## Config Changes

- **package.json:** None.
- **eslint.config.mjs:** None.

## Steps

### Step 1: Add excludedExtensions and early return in WhitespaceNormalizer

In `shared/src/pipeline/whitespace-normalizer.ts`: add constructor parameter `excludedExtensions: readonly FileExtension[] = []` and store it in a private readonly property. At the start of `transform`, derive the file extension from `filePath` using only string methods: `const idx = filePath.lastIndexOf("."); const ext = idx >= 0 ? filePath.slice(idx).toLowerCase() : ""`. If `excludedExtensions.some((e) => e.toLowerCase() === ext)` is true, return `content` unchanged. Otherwise keep the existing normalization logic (collapse ≥3 newlines to 2, normalize indent to 2-space, trim trailing) and return the new string. Do not import node:path.

**Verify:** Run `pnpm typecheck` from repo root; no errors.

### Step 2: Wire default excluded extensions in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`: import `toFileExtension` from `#core/types/paths.js`. Define a constant `WHITESPACE_EXCLUDED_EXTENSIONS: readonly FileExtension[]` with `[toFileExtension(".md"), toFileExtension(".mdx"), toFileExtension(".py"), toFileExtension(".yml"), toFileExtension(".yaml")]`. Where `WhitespaceNormalizer` is constructed, pass this constant: `new WhitespaceNormalizer(WHITESPACE_EXCLUDED_EXTENSIONS)`.

**Verify:** Run `pnpm typecheck`; no errors.

### Step 3: Add whitespace-normalizer tests

Create `shared/src/pipeline/__tests__/whitespace-normalizer.test.ts`. Import `WhitespaceNormalizer`, `toRelativePath`, `toFileExtension`, and `INCLUSION_TIER` from the appropriate modules. Test: `excluded_extension_returns_content_unchanged` — instantiate with `excludedExtensions: [toFileExtension(".md")]`, call `transform("  a  \n\n\n  b  ", INCLUSION_TIER.L0, toRelativePath("x.md"))`, assert result equals `"  a  \n\n\n  b  "`. Test: `non_excluded_extension_normalized` — same content and path `x.ts`, excludedExtensions `[toFileExtension(".md")]`, assert result is normalized (blank lines collapsed, leading and trailing trimmed). Test: `empty_excluded_list_normalizes_all` — excludedExtensions `[]`, path `x.md`, assert result is normalized. Test: `extension_comparison_case_insensitive` — path `x.MD`, excludedExtensions `[toFileExtension(".md")]`, assert result unchanged.

**Verify:** Run `pnpm test -- shared/src/pipeline/__tests__/whitespace-normalizer.test.ts`; all tests pass.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                    | Description                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| excluded_extension_returns_content_unchanged | When filePath has excluded extension, transform returns content unchanged |
| non_excluded_extension_normalized            | When filePath has non-excluded extension, transform normalizes content    |
| empty_excluded_list_normalizes_all           | When excludedExtensions is [], all files are normalized                   |
| extension_comparison_case_insensitive        | Extension match is case-insensitive (.MD matches .md in list)             |

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
