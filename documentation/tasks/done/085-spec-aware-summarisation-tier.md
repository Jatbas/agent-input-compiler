# Task 085: Spec-aware summarisation tier

> **Status:** In Progress
> **Phase:** N (Specification Compiler)
> **Layer:** adapter
> **Depends on:** Spec file discovery and scoring (084)

## Goal

Implement a LanguageProvider for Markdown (`.md`, `.mdc`) so that when spec files from SpecFileDiscoverer are passed through the existing SummarisationLadder they receive meaningful L1/L2/L3 compression (headings+first paragraph, headings only, path+heading titles) instead of falling through to generic regex.

## Architecture Notes

- Reuse existing SummarisationLadder and LanguageProvider interface (OCP). No new pipeline class. The "tier" is the capability provided by registering a MarkdownProvider so the ladder is spec-aware for .md/.mdc.
- Task 084 returns ContextResult; a future task will merge spec context with code and run the ladder. This task only adds the provider and wires it in createPipelineDeps.
- ADR-010: use branded types (RelativePath, FileExtension, TokenCount, LineNumber) and SYMBOL_TYPE/SYMBOL_KIND from core/types.
- Immutability: no .push() or mutation; use spread/reduce for collections.

## Files

| Action | Path                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ |
| Create | `shared/src/adapters/markdown-provider.ts`                                                 |
| Create | `shared/src/adapters/__tests__/markdown-provider.test.ts`                                  |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (add MarkdownProvider to languageProviders) |

## Interface / Signature

```typescript
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";

export interface LanguageProvider {
  readonly id: string;
  readonly extensions: readonly FileExtension[];
  parseImports(fileContent: string, filePath: RelativePath): readonly ImportRef[];
  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[];
  extractSignaturesOnly(fileContent: string): readonly CodeChunk[];
  extractNames(fileContent: string): readonly ExportedSymbol[];
}
```

```typescript
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toFileExtension, toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";

const EMPTY_PATH = toRelativePath("");

export class MarkdownProvider implements LanguageProvider {
  readonly id = "markdown";
  readonly extensions: readonly FileExtension[] = [
    toFileExtension(".md"),
    toFileExtension(".mdc"),
  ];

  parseImports(_fileContent: string, _filePath: RelativePath): readonly ImportRef[] {
    return [];
  }

  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[] {
    // Split by ATX headings; each chunk = heading line(s) + first paragraph until next heading or end.
  }

  extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
    // One CodeChunk per ATX heading line; content = that line only; symbolName = heading text after #.
  }

  extractNames(fileContent: string): readonly ExportedSymbol[] {
    // One ExportedSymbol per ATX heading: name = heading title (trimmed), kind = SYMBOL_KIND.CONST.
  }
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount, LineNumber } from "#core/types/units.js";
import type { SymbolType } from "#core/types/enums.js";

export interface CodeChunk {
  readonly filePath: RelativePath;
  readonly symbolName: string;
  readonly symbolType: SymbolType;
  readonly startLine: LineNumber;
  readonly endLine: LineNumber;
  readonly content: string;
  readonly tokenCount: TokenCount;
}
```

```typescript
import type { SymbolKind } from "#core/types/enums.js";

export interface ExportedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
}
```

```typescript
export interface ImportRef {
  readonly source: string;
  readonly symbols: readonly string[];
  readonly isRelative: boolean;
}
```

### Tier 2 — path-only

| Type            | Path                   | Factory                |
| --------------- | ---------------------- | ---------------------- |
| `RelativePath`  | `#core/types/paths.js` | `toRelativePath(raw)`  |
| `FileExtension` | `#core/types/paths.js` | `toFileExtension(ext)` |
| `LineNumber`    | `#core/types/units.js` | `toLineNumber(n)`      |
| `TokenCount`    | `#core/types/units.js` | `toTokenCount(n)`      |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change.

## Steps

### Step 1: MarkdownProvider implementation

Create `shared/src/adapters/markdown-provider.ts`. Implement `LanguageProvider`: `readonly id = "markdown"`, `readonly extensions = [toFileExtension(".md"), toFileExtension(".mdc")]`. `parseImports`: return `[]`. For ATX headings use regex `/^#{1,6}\s+.+$/gm` to match lines that start with one to six `#` followed by space and content. `extractSignaturesWithDocs`: split content into sections by ATX headings; for each section build one `CodeChunk` with `filePath: EMPTY_PATH` (toRelativePath("")), `symbolName` = heading title (text after `#` symbols, trimmed), `symbolType: SYMBOL_TYPE.FUNCTION`, `startLine`/`endLine` from 1-based line numbers, `content` = heading line(s) plus the first paragraph (text until next ATX heading or end of file), `tokenCount: toTokenCount(0)`. `extractSignaturesOnly`: one `CodeChunk` per ATX heading line; `content` = that line only; `symbolName` = heading text after `#`; same `filePath`, `symbolType`, `startLine`/`endLine`/`tokenCount`. `extractNames`: return array of `{ name: headingTitle, kind: SYMBOL_KIND.CONST }` for each ATX heading. Use immutable patterns (no .push(); use spread or reduce). Max 60 lines per function; extract helpers if needed.

**Verify:** `pnpm typecheck` passes.

### Step 2: MarkdownProvider tests

Create `shared/src/adapters/__tests__/markdown-provider.test.ts`. Tests: `parseImports_returns_empty` — call `parseImports` with any markdown string and `toRelativePath("doc.md")`, assert result length 0. `extractSignaturesWithDocs_includes_heading_and_first_paragraph` — content `"## Section\n\nFirst paragraph.\n\nMore."`, assert one chunk, `symbolName` "Section", `content` includes "## Section" and "First paragraph." `extractSignaturesOnly_returns_heading_lines_only` — content with `## A` and `## B` and body text, assert two chunks, each `content` is only the `##` line. `extractNames_returns_heading_titles` — same content, assert two symbols with `name` "A" and "B", `kind` SYMBOL_KIND.CONST. `empty_content_returns_empty_arrays` — empty string, assert all methods return empty arrays. `no_mutation_of_input` — call each method twice with same string, assert identical outputs.

**Verify:** `pnpm test -- markdown-provider` passes.

### Step 3: Wire MarkdownProvider in create-pipeline-deps

In `shared/src/bootstrap/create-pipeline-deps.ts`, import `MarkdownProvider` from `#adapters/markdown-provider.js`. In `createPipelineDeps`, after `const typeScriptProvider = new TypeScriptProvider()`, add `const markdownProvider = new MarkdownProvider()`. In the `languageProviders` array, insert `markdownProvider` after `typeScriptProvider` and before `...(additionalProviders ?? [])` so that `.md` and `.mdc` match MarkdownProvider before genericProvider.

**Verify:** `pnpm typecheck` passes; `pnpm test` passes.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`

Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                                      | Description                                       |
| -------------------------------------------------------------- | ------------------------------------------------- |
| parseImports_returns_empty                                     | parseImports returns empty array for any input    |
| extractSignaturesWithDocs_includes_heading_and_first_paragraph | Section heading + first paragraph in one chunk    |
| extractSignaturesOnly_returns_heading_lines_only               | One chunk per ATX heading line only               |
| extractNames_returns_heading_titles                            | One symbol per heading, name = title, kind CONST  |
| empty_content_returns_empty_arrays                             | Empty string yields empty arrays from all methods |
| no_mutation_of_input                                           | Same input twice yields identical outputs         |

## Acceptance Criteria

- [ ] All files created per Files table
- [ ] MarkdownProvider implements LanguageProvider exactly
- [ ] All test cases pass
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies
- [ ] No imports violating layer boundaries
- [ ] No `new Date()`, `Date.now()`, `Math.random()` in adapter
- [ ] No `let` in production code; single-line comments only

## Blocked?

If during execution you encounter something unexpected:

1. **Stop immediately** — do not guess or improvise
2. Append a `## Blocked` section with what you tried, what went wrong, what decision you need
3. Report to the user and wait for guidance

**Circuit breaker:** If you find yourself making 3+ workarounds or adaptations to make something work (type casts, extra plumbing, output patching), stop. The approach is likely wrong. List the adaptations, report to the user, and re-evaluate before continuing.
