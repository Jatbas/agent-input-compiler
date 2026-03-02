# Task 060: Base64InlineDataStripper

> **Status:** Done
> **Phase:** Phase L — Transformers & Guard
> **Layer:** pipeline
> **Depends on:** ContentTransformerPipeline, createFullPipelineDeps, token reduction benchmark (task 058), LicenseHeaderStripper (task 059)

## Goal

Add a non-format-specific content transformer that replaces data URLs with base64 payloads (`data:<mime>;base64,<payload>`) with a short placeholder to reduce prompt tokens without changing code structure.

## Architecture Notes

- Implements `ContentTransformer` from core. Pipeline layer: no Node/adapters/storage imports; pure string/regex.
- Non-format-specific: `fileExtensions = []` so it runs on all files. Data URLs appear in HTML, CSS, JS, SVG, etc.
- Wired second in the `transformers` array in `create-pipeline-deps.ts` (after LicenseHeaderStripper, before WhitespaceNormalizer).
- Stateless; no constructor parameters. Match only RFC 2397–style data URLs; do not match raw base64 strings in code.

## Files

| Action | Path                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/base64-inline-data-stripper.ts`                                                                        |
| Create | `shared/src/pipeline/__tests__/base64-inline-data-stripper.test.ts`                                                         |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (import, instantiate, add to transformers array after licenseHeaderStripper) |

## Interface / Signature

```typescript
// Interface: shared/src/core/interfaces/content-transformer.interface.ts
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: readonly FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

```typescript
// Class: Base64InlineDataStripper
export class Base64InlineDataStripper implements ContentTransformer {
  readonly id = "base64-inline-data-stripper";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    // Replace every data:...;base64,<payload> with "[base64 inline data stripped]"; return content unchanged when no match.
  }
}
```

## Dependent Types

### Tier 0 — verbatim

None. Component only implements the interface; it does not construct other domain types.

### Tier 2 — path-only

| Type            | Path                             | Factory                |
| --------------- | -------------------------------- | ---------------------- |
| `FileExtension` | `shared/src/core/types/paths.js` | `toFileExtension(raw)` |
| `RelativePath`  | `shared/src/core/types/paths.js` | `toRelativePath(raw)`  |
| `InclusionTier` | `shared/src/core/types/enums.js` | `INCLUSION_TIER` const |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Create Base64InlineDataStripper

Create `shared/src/pipeline/base64-inline-data-stripper.ts`.

- Implement `ContentTransformer`: `readonly id = "base64-inline-data-stripper"`, `readonly fileExtensions = []`.
- In `transform(content, _tier, _filePath)`: if `content.length === 0`, return `content`. Otherwise replace every match of the regex `data:[^;]+;base64,[A-Za-z0-9+/=]+` with the string `"[base64 inline data stripped]"` using `content.replace()` with the regex in global mode. Return the result.
- Use only immutable patterns; no mutating methods.
- Imports: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`, `FileExtension`, `RelativePath` from `#core/types/paths.js`, `InclusionTier` from `#core/types/enums.js`.

**Verify:** `pnpm typecheck` passes. File exists at `shared/src/pipeline/base64-inline-data-stripper.ts`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`: add `import { Base64InlineDataStripper } from "#pipeline/base64-inline-data-stripper.js";`. After the line that creates `licenseHeaderStripper`, add `const base64InlineDataStripper = new Base64InlineDataStripper();`. Change the `transformers` array to `[ licenseHeaderStripper, base64InlineDataStripper, whitespaceNormalizer, commentStripper, jsonCompactor, lockFileSkipper ]`.

**Verify:** `pnpm typecheck` passes.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/base64-inline-data-stripper.test.ts`.

- Imports: `describe`, `it`, `expect` from `vitest`; `Base64InlineDataStripper` from `../base64-inline-data-stripper.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Use a constant for the path: `const path = toRelativePath("src/foo.ts");`.
- Instantiate `new Base64InlineDataStripper()` per test or in a describe block.
- Test cases:
  - **strips_data_url_base64:** Content is `'const url = "data:image/png;base64,iVBORw0KGgo=";'`. Call `transform` with tier `INCLUSION_TIER.L0` and `path`. Assert result contains `"[base64 inline data stripped]"` and does not contain `iVBORw0KGgo=`.
  - **no_data_url_returns_unchanged:** Content is `"const x = 1;"`. Assert result equals content.
  - **empty_content_returns_unchanged:** Content is `""`. Assert result is `""`.
  - **multiple_data_urls_replaced:** Content is `"a data:image/png;base64,AB= b data:image/png;base64,CD= c"`. Assert result contains two occurrences of `"[base64 inline data stripped]"`.
  - **safety_python_indentation_preserved:** Content is `"def f():\\n    pass"` (no data URL). Assert result equals content.
  - **safety_yaml_structure_unchanged:** Content is `"key: value"` (no data URL). Assert result equals content.
  - **safety_jsx_structure_unchanged:** Content is `"<Component />"` (no data URL). Assert result equals content.

**Verify:** `pnpm test shared/src/pipeline/__tests__/base64-inline-data-stripper.test.ts` passes.

### Step 4: Benchmark verification

Run: `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts`

Read the test output and note the actual `tokensCompiled` value. Read `test/benchmarks/baseline.json` and compare against the current `token_count` for entry `"1"`.

- If actual tokensCompiled is less than baseline `token_count`: update `test/benchmarks/baseline.json` entry `"1"` with `{ "token_count": <actual>, "duration_ms": <actual> }` to lock in the improvement. Re-run the benchmark test to confirm it passes with the new baseline.
- If actual tokensCompiled is greater than or equal to baseline `token_count`: do not change the baseline. The benchmark test must still pass.

**Verify:** `pnpm test shared/src/integration/__tests__/token-reduction-benchmark.test.ts` passes. Baseline reflects current pipeline output.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                           | Description                                                         |
| ----------------------------------- | ------------------------------------------------------------------- |
| strips_data_url_base64              | Data URL in content is replaced by placeholder; raw payload removed |
| no_data_url_returns_unchanged       | Content with no data URL is returned unchanged                      |
| empty_content_returns_unchanged     | Empty string is returned unchanged                                  |
| multiple_data_urls_replaced         | Two data URLs are both replaced by the placeholder                  |
| safety_python_indentation_preserved | Python code with no data URL is unchanged                           |
| safety_yaml_structure_unchanged     | YAML with no data URL is unchanged                                  |
| safety_jsx_structure_unchanged      | JSX with no data URL is unchanged                                   |

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
