# Task 080: Transformer Safety Tests

> **Status:** Done
> **Phase:** Phase L (Quality Release — Phase 0.5)
> **Layer:** pipeline (test-only — no production code changes)
> **Depends on:** WhitespaceNormalizer (Done), CommentStripper (Done), JsonCompactor (Done), LockFileSkipper (Done)

## Goal

Add safety tests and backfill functional tests for the 4 ContentTransformer implementations that predate the Phase L safety test convention, ensuring every transformer has verified semantic safety for the file types it handles.

## Architecture Notes

- Test-backfill task: zero production code changes. All files are test files.
- Safety test naming convention: `safety_[filetype]_[what_is_preserved]` (established by Phase L transformers).
- Non-format-specific transformers (`fileExtensions = []`): one safety test per sensitive file type (Python, YAML, JSX).
- Format-specific transformers: one safety test per listed extension.
- `WhitespaceNormalizer` uses `excludedExtensions` in the pipeline (`[.md, .mdx, .py, .yml, .yaml]`) to protect whitespace-sensitive formats. Safety tests verify this exclusion mechanism.
- Test files follow the sibling pattern from `license-header-stripper.test.ts`: import vitest, transformer class, `toRelativePath`, `INCLUSION_TIER`; module-level `const path`; each test constructs the transformer and calls `.transform()`.

## Files

| Action | Path                                                              |
| ------ | ----------------------------------------------------------------- |
| Modify | `shared/src/pipeline/__tests__/whitespace-normalizer.test.ts` (add 3 safety tests) |
| Create | `shared/src/pipeline/__tests__/comment-stripper.test.ts`          |
| Create | `shared/src/pipeline/__tests__/json-compactor.test.ts`            |
| Create | `shared/src/pipeline/__tests__/lock-file-skipper.test.ts`         |

## Interface / Signature

All transformers implement the same interface — no new signatures:

```typescript
// Source: shared/src/core/interfaces/content-transformer.interface.ts
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: readonly FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

Transformer constructors (verified from source):

```typescript
// WhitespaceNormalizer — shared/src/pipeline/whitespace-normalizer.ts
class WhitespaceNormalizer implements ContentTransformer {
  constructor(private readonly excludedExtensions: readonly FileExtension[] = [])
  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string
}

// CommentStripper — shared/src/pipeline/comment-stripper.ts
class CommentStripper implements ContentTransformer {
  constructor()
  transform(content: string, tier: InclusionTier, _filePath: RelativePath): string
}

// JsonCompactor — shared/src/pipeline/json-compactor.ts
class JsonCompactor implements ContentTransformer {
  constructor()
  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string
}

// LockFileSkipper — shared/src/pipeline/lock-file-skipper.ts
class LockFileSkipper implements ContentTransformer {
  constructor()
  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// Source: shared/src/core/interfaces/content-transformer.interface.ts
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: readonly FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
```

### Tier 2 — path-only

| Type             | Path                              | Factory               |
| ---------------- | --------------------------------- | --------------------- |
| `RelativePath`   | `shared/src/core/types/paths.ts`  | `toRelativePath(raw)` |
| `FileExtension`  | `shared/src/core/types/paths.ts`  | `toFileExtension(raw)` |
| `InclusionTier`  | `shared/src/core/types/enums.ts`  | `INCLUSION_TIER.L0`   |

## Config Changes

- **shared/package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: Add safety tests to whitespace-normalizer.test.ts

In `shared/src/pipeline/__tests__/whitespace-normalizer.test.ts`, add 3 new tests inside the existing `describe("WhitespaceNormalizer")` block. These tests verify the exclusion mechanism protects whitespace-sensitive formats:

**Test: `safety_python_indentation_preserved`**
Construct `new WhitespaceNormalizer([toFileExtension(".py")])`. Pass a Python file with significant indentation (a function with a nested `if` using 4-space indent). Call `.transform(content, INCLUSION_TIER.L0, toRelativePath("src/main.py"))`. Assert the result equals the original content exactly (exclusion mechanism returns unchanged).

**Test: `safety_yaml_structure_unchanged`**
Construct `new WhitespaceNormalizer([toFileExtension(".yml")])`. Pass a YAML file with nested keys using 2-space indent. Call `.transform(content, INCLUSION_TIER.L0, toRelativePath("config.yml"))`. Assert the result equals the original content exactly.

**Test: `safety_jsx_structure_unchanged`**
Construct `new WhitespaceNormalizer([])` (no exclusions — JSX is not excluded). Pass JSX content with nested `<div>` and `<span>` tags using 2-space indent. Call `.transform(content, INCLUSION_TIER.L0, toRelativePath("App.tsx"))`. Assert that all JSX opening/closing tags (`<div>`, `</div>`, `<span>`, `</span>`) are present in the result and the tag nesting is preserved.

**Verify:** `pnpm test shared/src/pipeline/__tests__/whitespace-normalizer.test.ts` passes. All 7 tests (4 existing + 3 new) pass.

### Step 2: Create comment-stripper.test.ts

Create `shared/src/pipeline/__tests__/comment-stripper.test.ts` following the sibling pattern:

```typescript
import { describe, it, expect } from "vitest";
import { CommentStripper } from "../comment-stripper.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const path = toRelativePath("src/foo.ts");
```

Add 6 functional tests inside `describe("CommentStripper")`:

**Test: `strips_single_line_comments`**
Content: `"// comment\nconst x = 1;\n// another\nconst y = 2;"`. Assert result contains `const x = 1;` and `const y = 2;` but does not contain `// comment`.

**Test: `strips_block_comments`**
Content: `"/* block\ncomment */\nconst x = 1;"`. Assert result contains `const x = 1;` but does not contain `block`.

**Test: `jsdoc_params_preserved_at_l1`**
Content: `"/** @param name - the name */\nfunction f() {}"`. Call with `INCLUSION_TIER.L1`. Assert result contains `@param`.

**Test: `inline_comment_stripped`**
Content: `"const x = 1; // inline comment"`. Assert result contains `const x = 1;` but does not contain `inline comment`.

**Test: `empty_content_returns_unchanged`**
Content: `""`. Assert result equals `""`.

**Test: `no_comments_returns_unchanged`**
Content: `"const x = 1;\nconst y = 2;"`. Assert result equals `"const x = 1;\nconst y = 2;"`.

Add 7 safety tests (one per extension):

**Test: `safety_ts_code_structure_preserved`**
TypeScript content with imports, class declaration, and inline comments. Path: `toRelativePath("src/service.ts")`. Assert all non-comment code lines are present in the result.

**Test: `safety_js_code_structure_preserved`**
JavaScript content with `require`, `module.exports`, and comments. Path: `toRelativePath("src/util.js")`. Assert all non-comment code lines are present.

**Test: `safety_go_code_structure_preserved`**
Go content with `package main`, `import "fmt"`, `func main()`, and comments. Path: `toRelativePath("main.go")`. Assert all non-comment code lines are present.

**Test: `safety_java_code_structure_preserved`**
Java content with `package`, `import`, `public class`, and comments. Path: `toRelativePath("App.java")`. Assert all non-comment code lines are present.

**Test: `safety_rs_code_structure_preserved`**
Rust content with `use std::io`, `fn main()`, `let`, and comments. Path: `toRelativePath("main.rs")`. Assert all non-comment code lines are present.

**Test: `safety_c_code_structure_preserved`**
C content with `#include`, `int main()`, and comments. Path: `toRelativePath("main.c")`. Assert `#include` preprocessor directives are preserved in the result.

**Test: `safety_cpp_code_structure_preserved`**
C++ content with `#include`, `namespace`, `class`, and comments. Path: `toRelativePath("main.cpp")`. Assert all non-comment code lines are present.

**Verify:** `pnpm test shared/src/pipeline/__tests__/comment-stripper.test.ts` passes. All 13 tests pass.

### Step 3: Create json-compactor.test.ts

Create `shared/src/pipeline/__tests__/json-compactor.test.ts` following the sibling pattern:

```typescript
import { describe, it, expect } from "vitest";
import { JsonCompactor } from "../json-compactor.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const path = toRelativePath("config.json");
```

Add 3 functional tests inside `describe("JsonCompactor")`:

**Test: `minifies_valid_json`**
Content: `'{\n  "a": 1,\n  "b": 2\n}'`. Assert result equals `'{"a":1,"b":2}'`.

**Test: `invalid_json_returns_unchanged`**
Content: `"not json {{"`. Assert result equals `"not json {{"`.

**Test: `empty_content_returns_unchanged`**
Content: `""`. Assert result equals `""`.

Add 1 safety test:

**Test: `safety_json_validity_preserved`**
Content: a multi-level nested JSON object with arrays (pretty-printed). Assert `JSON.parse(result)` does not throw, confirming the output is valid JSON.

**Verify:** `pnpm test shared/src/pipeline/__tests__/json-compactor.test.ts` passes. All 4 tests pass.

### Step 4: Create lock-file-skipper.test.ts

Create `shared/src/pipeline/__tests__/lock-file-skipper.test.ts` following the sibling pattern:

```typescript
import { describe, it, expect } from "vitest";
import { LockFileSkipper } from "../lock-file-skipper.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";
```

Add 5 functional tests inside `describe("LockFileSkipper")`:

**Test: `lock_file_returns_placeholder`**
Content: `"# yarn lockfile v1\nresolved..."` with path `toRelativePath("yarn.lock")`. Assert result starts with `[Lock file:` and contains `yarn.lock`.

**Test: `non_lock_path_returns_unchanged`**
Content: `"regular content"` with path `toRelativePath("src/app.ts")`. Assert result equals `"regular content"` (non-lock path passes through unchanged).

**Test: `package_lock_json_returns_placeholder`**
Content: `'{"lockfileVersion": 3}'` with path `toRelativePath("package-lock.json")`. Assert result starts with `[Lock file:` and contains `package-lock.json`.

**Test: `shrinkwrap_returns_placeholder`**
Content: `'{"name":"pkg"}'` with path `toRelativePath("npm-shrinkwrap.json")`. Assert result starts with `[Lock file:` and contains `npm-shrinkwrap.json`.

**Test: `empty_lock_file_returns_placeholder`**
Content: `""` with path `toRelativePath("yarn.lock")`. Assert result matches `[Lock file: yarn.lock, 0 bytes — skipped]`.

Add 1 safety test:

**Test: `safety_lock_placeholder_format`**
Content: `"content"` (7 bytes UTF-8) with path `toRelativePath("pnpm-lock.yaml")`. Assert result matches the exact pattern: `[Lock file: pnpm-lock.yaml, 7 bytes — skipped]`.

**Verify:** `pnpm test shared/src/pipeline/__tests__/lock-file-skipper.test.ts` passes. All 6 tests pass.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                | Description                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `safety_python_indentation_preserved`    | WhitespaceNormalizer with `.py` exclusion returns Python content unchanged |
| `safety_yaml_structure_unchanged`        | WhitespaceNormalizer with `.yml` exclusion returns YAML content unchanged  |
| `safety_jsx_structure_unchanged`         | WhitespaceNormalizer preserves JSX tag nesting after normalization         |
| `strips_single_line_comments`            | CommentStripper removes `//` lines, preserves code                        |
| `strips_block_comments`                  | CommentStripper removes `/* */` blocks, preserves code                    |
| `jsdoc_params_preserved_at_l1`           | CommentStripper at L1 tier keeps `@param`/`@returns` lines               |
| `inline_comment_stripped`                 | CommentStripper removes trailing `// ...` from code lines                 |
| `empty_content_returns_unchanged` (CS)   | CommentStripper returns empty string unchanged                            |
| `no_comments_returns_unchanged`          | CommentStripper returns comment-free code unchanged                       |
| `safety_ts_code_structure_preserved`     | TypeScript code lines intact after comment stripping                      |
| `safety_js_code_structure_preserved`     | JavaScript code lines intact after comment stripping                      |
| `safety_go_code_structure_preserved`     | Go code lines intact after comment stripping                              |
| `safety_java_code_structure_preserved`   | Java code lines intact after comment stripping                            |
| `safety_rs_code_structure_preserved`     | Rust code lines intact after comment stripping                            |
| `safety_c_code_structure_preserved`      | C preprocessor directives intact after comment stripping                  |
| `safety_cpp_code_structure_preserved`    | C++ code lines intact after comment stripping                             |
| `minifies_valid_json`                    | JsonCompactor minifies pretty-printed JSON to single line                 |
| `invalid_json_returns_unchanged`         | JsonCompactor returns invalid JSON content unchanged                      |
| `empty_content_returns_unchanged` (JC)   | JsonCompactor returns empty string unchanged                              |
| `safety_json_validity_preserved`         | JsonCompactor output is valid JSON (JSON.parse succeeds)                  |
| `lock_file_returns_placeholder`          | LockFileSkipper replaces yarn.lock content with placeholder               |
| `non_lock_path_returns_unchanged`        | LockFileSkipper returns non-lock path content unchanged                   |
| `package_lock_json_returns_placeholder`  | LockFileSkipper replaces package-lock.json with placeholder               |
| `shrinkwrap_returns_placeholder`         | LockFileSkipper replaces npm-shrinkwrap.json with placeholder             |
| `empty_lock_file_returns_placeholder`    | LockFileSkipper placeholder shows 0 bytes for empty content               |
| `safety_lock_placeholder_format`         | LockFileSkipper placeholder matches exact format pattern                  |

## Acceptance Criteria

- [ ] All files created/modified per Files table
- [ ] All 26 test cases pass
- [ ] Safety tests follow `safety_[filetype]_[what_is_preserved]` naming convention
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
