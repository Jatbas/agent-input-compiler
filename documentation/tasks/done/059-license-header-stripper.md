# Task 059: LicenseHeaderStripper

> **Status:** Done
> **Phase:** Phase L — Transformers & Guard
> **Layer:** pipeline
> **Depends on:** ContentTransformerPipeline, createFullPipelineDeps, token reduction benchmark (task 058)

## Goal

Add a non-format-specific content transformer that strips leading comment blocks containing license keywords (License, Copyright, Permission, SPDX) to reduce prompt tokens without changing code semantics.

## Architecture Notes

- Implements `ContentTransformer` from core. Pipeline layer: no Node/adapters/storage imports; pure string/regex.
- Non-format-specific: `fileExtensions = []` so it runs on all files. License headers appear in .ts, .js, .py, .go, .html, etc.
- Wired first in the `transformers` array in `create-pipeline-deps.ts` so the license block is removed before WhitespaceNormalizer and CommentStripper.
- No constructor parameters (stateless). Keyword set: case-insensitive match for License, Copyright, Permission, SPDX.

## Files

| Action | Path                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/license-header-stripper.ts`                                                                                       |
| Create | `shared/src/pipeline/__tests__/license-header-stripper.test.ts`                                                                        |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (import LicenseHeaderStripper, instantiate, add as first element of transformers array) |

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
// Class: LicenseHeaderStripper
export class LicenseHeaderStripper implements ContentTransformer {
  readonly id = "license-header-stripper";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    // From start of content, collect consecutive comment lines (blank, //, #, or inside /* */).
    // Stop at first non-comment line. If block contains License|Copyright|Permission|SPDX (case-insensitive), remove block and one trailing blank line; else return content unchanged.
  }
}
```

## Dependent Types

### Tier 0 — verbatim

Only the component implements the interface; it does not construct other domain types. The interface is above.

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

### Step 1: Create LicenseHeaderStripper

Create `shared/src/pipeline/license-header-stripper.ts`.

- Implement `ContentTransformer`: `readonly id = "license-header-stripper"`, `readonly fileExtensions = []`.
- In `transform(content, _tier, _filePath)`: split content by `"\n"`, then from the start collect lines that form a comment block. A line is part of the block if: trimmed is empty; or trimmed starts with `//` or `#`; or trimmed is `<!--` or `-->`; or we are inside a `/* */` block (track with a boolean: line contains `/*` start, line contains `*/` end). Stop at the first line that is not blank and not a comment. Join the collected lines into one string; if that string matches (case-insensitive) `/License|Copyright|Permission|SPDX/`, remove the block from content (from start through the last collected line). If the character immediately after the removed block is a newline, remove one leading newline from the remainder. Return the remainder; otherwise return content unchanged.
- Use immutable patterns only: no `.push()`, no `.splice()`; use spread and reduce. No `let` except one boolean for tracking inside-block-comment state.
- Import: `ContentTransformer` from `#core/interfaces/content-transformer.interface.js`, `FileExtension`, `RelativePath` from `#core/types/paths.js`, `InclusionTier` from `#core/types/enums.js`.

**Verify:** `pnpm typecheck` passes. File exists at `shared/src/pipeline/license-header-stripper.ts`.

### Step 2: Wire transformer in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`: add `import { LicenseHeaderStripper } from "#pipeline/license-header-stripper.js";`. After the line that creates `lockFileSkipper`, add `const licenseHeaderStripper = new LicenseHeaderStripper();`. Change the `transformers` array to `[ licenseHeaderStripper, whitespaceNormalizer, commentStripper, jsonCompactor, lockFileSkipper ]` (licenseHeaderStripper first).

**Verify:** `pnpm typecheck` passes.

### Step 3: Add tests

Create `shared/src/pipeline/__tests__/license-header-stripper.test.ts`.

- Import: `describe`, `it`, `expect` from `vitest`; `LicenseHeaderStripper` from `../license-header-stripper.js`; `toRelativePath` from `#core/types/paths.js`; `INCLUSION_TIER` from `#core/types/enums.js`.
- Instantiate `new LicenseHeaderStripper()` once per test or in a describe block.
- Implement these test cases:
  - **strips_leading_license_block_c_style:** Content is `"// MIT License\n// Copyright (c) 2024\n\n// Next comment\nimport x;"`. Call `transform` with tier `INCLUSION_TIER.L0` and any RelativePath. Assert result starts with `"// Next comment"` (license block and blank line removed).
  - **strips_leading_license_block_hash:** Content is `"# MIT License\n# Copyright\n\n# Next\ncode"`. Assert result starts with `"# Next"`.
  - **no_license_keyword_returns_unchanged:** Content is `"// Some other header\n\nimport x;"`. Assert result equals content (no License/Copyright/Permission/SPDX).
  - **empty_content_returns_unchanged:** Content is `""`. Assert result is `""`.
  - **license_in_body_not_stripped:** Content is `"const x = 1;\n// License here"`. Assert result equals content (only leading block is considered).
  - **safety_python_indentation_preserved:** Content is `"# License\n# Copyright\n\ndef f():\n    pass"`. Assert result is `"def f():\n    pass"` (4-space indent on `def` and `pass` unchanged).
  - **safety_yaml_structure_unchanged:** Content is `"# License\n\nkey: value"`. Assert result is `"key: value"` (YAML key: value preserved).
  - **safety_jsx_structure_unchanged:** Content is `"// License\n\n<Component />"`. Assert result is `"<Component />"` (JSX preserved).

**Verify:** `pnpm test shared/src/pipeline/__tests__/license-header-stripper.test.ts` passes.

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

| Test case                            | Description                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| strips_leading_license_block_c_style | Leading // license block and blank line removed; next // comment and code remain   |
| strips_leading_license_block_hash    | Leading # license block removed; next # and code remain                            |
| no_license_keyword_returns_unchanged | Leading comment without License/Copyright/Permission/SPDX leaves content unchanged |
| empty_content_returns_unchanged      | Empty string returns empty string                                                  |
| license_in_body_not_stripped         | License keyword only in body; content unchanged (only leading block considered)    |
| safety_python_indentation_preserved  | # license block stripped; Python def/indent unchanged                              |
| safety_yaml_structure_unchanged      | # license block stripped; key: value preserved                                     |
| safety_jsx_structure_unchanged       | // license block stripped; JSX preserved                                           |

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
- [ ] Token reduction benchmark passes; baseline updated if tokens decreased

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
