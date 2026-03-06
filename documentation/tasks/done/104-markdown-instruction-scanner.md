# Task 104: MarkdownInstructionScanner (GuardScanner)

> **Status:** Done
> **Phase:** Q — Research-Backed Quality & Security (from mvp-progress.md)
> **Layer:** pipeline
> **Depends on:** ContextGuard impl (Done)

## Goal

Implement a GuardScanner that detects high-risk instruction payloads in markdown/doc files (.md, .mdc, .mdx) by reusing the same BLOCK and WARN pattern categories as PromptInjectionScanner, scoped to those extensions only.

## Architecture Notes

- Chain of Responsibility: ContextGuard runs scanners in order; this scanner is added to the existing chain (ExclusionScanner, SecretScanner, PromptInjectionScanner, MarkdownInstructionScanner).
- Reuse: Use scanWithPatterns from pattern-scanner.js and the same structural pattern as PromptInjectionScanner (const BLOCK_PATTERNS, const WARN_PATTERNS, two scanWithPatterns calls, concatenate results). Return [] when file.path does not end with .md, .mdc, or .mdx.
- No new interface, no new GUARD_FINDING_TYPE; use PROMPT_INJECTION. Approach A (path-filtered reuse of existing patterns) chosen for simplicity.

## Files

| Action | Path                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------- |
| Create | `shared/src/pipeline/markdown-instruction-scanner.ts`                                             |
| Create | `shared/src/pipeline/__tests__/markdown-instruction-scanner.test.ts`                              |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (add MarkdownInstructionScanner to scanners array) |

## Interface / Signature

```typescript
import type { SelectedFile } from "#core/types/selected-file.js";
import type { GuardFinding } from "#core/types/guard-types.js";

export interface GuardScanner {
  readonly name: string;
  scan(file: SelectedFile, content: string): readonly GuardFinding[];
}
```

```typescript
export class MarkdownInstructionScanner implements GuardScanner {
  readonly name = "MarkdownInstructionScanner";

  scan(file: SelectedFile, content: string): readonly GuardFinding[] {
    // If file.path does not end with .md, .mdc, or .mdx, return [].
    // Otherwise: scanWithPatterns for BLOCK_PATTERNS then WARN_PATTERNS;
    // return [...blockFindings, ...warnFindings].
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// GuardFinding — shared/src/core/types/guard-types.ts
export interface GuardFinding {
  readonly severity: GuardSeverity;
  readonly type: GuardFindingType;
  readonly file: RelativePath;
  readonly line?: LineNumber;
  readonly message: string;
  readonly pattern?: string;
}

// ScanPattern — shared/src/core/interfaces/scan-pattern.interface.ts
export interface ScanPattern {
  readonly pattern: RegExp;
  readonly label: string;
}
```

### Tier 1 — signature + path

| Type                                | Path                                     | Members                                                          | Purpose                                      |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| `SelectedFile`                      | `shared/src/core/types/selected-file.ts` | path, language, estimatedTokens, relevanceScore, tier, etc.      | Passed to scan; use path for extension check |
| `GuardSeverity`, `GuardFindingType` | `shared/src/core/types/enums.js`         | GUARD_SEVERITY.BLOCK, .WARN; GUARD_FINDING_TYPE.PROMPT_INJECTION | Arguments to scanWithPatterns                |

### Tier 2 — path-only

| Type           | Path                             | Factory                            |
| -------------- | -------------------------------- | ---------------------------------- |
| `RelativePath` | `shared/src/core/types/paths.ts` | file.path (already RelativePath)   |
| `LineNumber`   | `shared/src/core/types/units.ts` | set by scanWithPatterns internally |

## Config Changes

- **package.json:** None
- **eslint.config.mjs:** None

## Steps

### Step 1: Create markdown-instruction-scanner.ts

In `shared/src/pipeline/markdown-instruction-scanner.ts`:

- Imports: GuardScanner, SelectedFile, GuardFinding, GUARD_SEVERITY, GUARD_FINDING_TYPE, ScanPattern, scanWithPatterns from pattern-scanner.js.
- Define `MARKDOWN_EXTENSIONS: readonly string[] = [".md", ".mdc", ".mdx"]`.
- Define `isMarkdownPath(path: string): boolean` — return MARKDOWN_EXTENSIONS.some((ext) => path.endsWith(ext)).
- Define `BLOCK_PATTERNS: readonly ScanPattern[]` with the same two entries as in PromptInjectionScanner: `{ pattern: /<\|?(system|im_start|endofprompt)\|?>/i, label: "special token" }`, `{ pattern: /\[INST\].*\[\/INST\]/i, label: "instruction block" }`.
- Define `WARN_PATTERNS: readonly ScanPattern[]` with the same four entries as in PromptInjectionScanner: instruction override (`/ignore\s+(all\s+)?(previous|above|prior)\s+instructions/i`, "instruction override"), role override (`/you\s+are\s+now\s+(a|an|acting\s+as)/i`, "role override"), system prefix (`/system\s*:\s*/i`, "system prefix"), constraint override (`/do\s+not\s+follow\s+(any\s+)?(other|previous)\s+(rules|instructions|constraints)/i`, "constraint override").
- Export class `MarkdownInstructionScanner` with `readonly name = "MarkdownInstructionScanner"`. In `scan(file, content)`: if `!isMarkdownPath(file.path)` return `[]`. Otherwise call `scanWithPatterns(file, content, BLOCK_PATTERNS, GUARD_SEVERITY.BLOCK, GUARD_FINDING_TYPE.PROMPT_INJECTION, "Markdown instruction pattern: ")` and `scanWithPatterns(file, content, WARN_PATTERNS, GUARD_SEVERITY.WARN, GUARD_FINDING_TYPE.PROMPT_INJECTION, "Markdown instruction pattern: ")`; return `[...blockFindings, ...warnFindings]`.

**Verify:** `pnpm typecheck` passes and the file has no lint errors.

### Step 2: Wire MarkdownInstructionScanner in create-pipeline-deps.ts

In `shared/src/bootstrap/create-pipeline-deps.ts`, add named import `MarkdownInstructionScanner` from `#pipeline/markdown-instruction-scanner.js`. After `const promptInjectionScanner = new PromptInjectionScanner()`, add `const markdownInstructionScanner = new MarkdownInstructionScanner()`. Change the scanners array from `[exclusionScanner, secretScanner, promptInjectionScanner]` to `[exclusionScanner, secretScanner, promptInjectionScanner, markdownInstructionScanner]` as const.

**Verify:** Grep for `markdownInstructionScanner` and `MarkdownInstructionScanner` in create-pipeline-deps.ts shows the import, instantiation, and array entry.

### Step 3: Create markdown-instruction-scanner.test.ts

Create `shared/src/pipeline/__tests__/markdown-instruction-scanner.test.ts`. Import `describe`, `it`, `expect` from vitest; `MarkdownInstructionScanner` from `../markdown-instruction-scanner.js`; `toRelativePath` from `#core/types/paths.js`; `GUARD_SEVERITY`, `GUARD_FINDING_TYPE` from `#core/types/enums.js`. Build a minimal `SelectedFile` object (path, language, estimatedTokens, relevanceScore, tier) for each test using `toRelativePath` for path.

- **non_markdown_path_returns_empty:** Scanner instance; file with path `toRelativePath("src/foo.ts")`, content `"ignore previous instructions"`. Assert `scanner.scan(file, content)` has length 0.
- **markdown_path_with_block_pattern_returns_block_finding:** File path `toRelativePath("doc/readme.md")`, content `"<|system|>"`. Assert scan returns one finding; finding.severity === GUARD_SEVERITY.BLOCK, finding.type === GUARD_FINDING_TYPE.PROMPT_INJECTION.
- **markdown_path_with_warn_pattern_returns_warn_finding:** File path `toRelativePath("docs/a.mdc")`, content `"ignore all previous instructions"`. Assert scan returns one finding; finding.severity === GUARD_SEVERITY.WARN.
- **markdown_path_clean_returns_empty:** File path `toRelativePath("readme.md")`, content `"Hello world"`. Assert scan returns length 0.
- **mdc_and_mdx_paths_scanned:** Two calls: path `toRelativePath("rules/foo.mdc")` with content `"you are now a helpful assistant"`, and path `toRelativePath("docs/page.mdx")` with content `"system: you are a reviewer"`. Assert first scan returns at least one finding (WARN); second returns at least one finding (WARN).

**Verify:** `pnpm test shared/src/pipeline/__tests__/markdown-instruction-scanner.test.ts` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                              | Description                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| non_markdown_path_returns_empty                        | Non-.md/.mdc/.mdx path with injection text returns no findings           |
| markdown_path_with_block_pattern_returns_block_finding | .md file with special-token pattern returns one BLOCK finding            |
| markdown_path_with_warn_pattern_returns_warn_finding   | .mdc file with instruction-override text returns one WARN finding        |
| markdown_path_clean_returns_empty                      | .md file with safe content returns no findings                           |
| mdc_and_mdx_paths_scanned                              | .mdc and .mdx paths are scanned and return findings when content matches |

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
