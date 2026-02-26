# Task 010: GenericProvider

> **Status:** Done
> **Phase:** D (Adapters)
> **Layer:** adapter
> **Depends on:** Phase B (LanguageProvider interface Done), Task 009 (TypeScriptProvider optional for ordering only)

## Goal

Implement the LanguageProvider fallback that handles all other languages: import parsing skipped, L1 skipped (falls to L2), L2 best-effort regex, L3 file path + regex-extracted names. Must never throw (Null Object pattern).

## Architecture Notes

- GenericProvider is the catch-all; it must be registered last. It must return valid (possibly empty) results for all four methods and never throw (Project plan).
- No new interface; implement existing LanguageProvider. No external library required (regex only); no ESLint restriction for a third-party package.
- extensions: empty array so it never wins by extension match; returned only when no other provider matches.

## Files

| Action | Path                                                     |
| ------ | -------------------------------------------------------- |
| Create | `shared/src/adapters/generic-provider.ts`                |
| Create | `shared/src/adapters/__tests__/generic-provider.test.ts` |

## Interface / Signature

First code block: LanguageProvider interface from core. Second code block: class declaration and method signatures. Return types must match the interface exactly.

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
export class GenericProvider implements LanguageProvider {
  readonly id = "generic";
  readonly extensions: readonly FileExtension[];
  constructor() {
    this.extensions = [];
  }
  parseImports(fileContent: string, filePath: RelativePath): readonly ImportRef[];
  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[];
  extractSignaturesOnly(fileContent: string): readonly CodeChunk[];
  extractNames(fileContent: string): readonly ExportedSymbol[];
}
```

- parseImports(fileContent, filePath): ignore arguments and return [] (skipped).
- extractSignaturesWithDocs(fileContent): ignore argument and return [] (skipped).
- extractSignaturesOnly(fileContent): best-effort regex for lines starting with function/class/def/func/pub fn; return CodeChunk[] with all required fields: filePath (toRelativePath('')), symbolName, symbolType (SYMBOL_TYPE.FUNCTION or SYMBOL_TYPE.CLASS from regex context), startLine and endLine (toLineNumber(n)), content, tokenCount (toTokenCount(0)).
- extractNames(fileContent): regex-extract names that look like exports; return ExportedSymbol[] with kind SYMBOL_KIND.CONST or SYMBOL_KIND.FUNCTION as appropriate. Never throw: on any error return [].
- All methods must be safe to call with any string; never throw.

## Config Changes

None — no new dependencies or ESLint changes.

## Dependent Types

Full type definitions used by GenericProvider. Import from #core/types as shown.

```typescript
// import-ref.js
export interface ImportRef {
  readonly source: string;
  readonly symbols: readonly string[];
  readonly isRelative: boolean;
}
```

```typescript
// code-chunk.js
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
// exported-symbol.js
import type { SymbolKind } from "#core/types/enums.js";

export interface ExportedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
}
```

```typescript
// enums.js — SYMBOL_TYPE and SYMBOL_KIND (GenericProvider uses these)
export const SYMBOL_TYPE = {
  FUNCTION: "function",
  CLASS: "class",
  METHOD: "method",
  INTERFACE: "interface",
} as const;
export type SymbolType = (typeof SYMBOL_TYPE)[keyof typeof SYMBOL_TYPE];

export const SYMBOL_KIND = {
  CLASS: "class",
  FUNCTION: "function",
  INTERFACE: "interface",
  TYPE: "type",
  CONST: "const",
} as const;
export type SymbolKind = (typeof SYMBOL_KIND)[keyof typeof SYMBOL_KIND];
```

```typescript
// paths.js — toRelativePath; units.js — toTokenCount, toLineNumber
// Use toRelativePath(value: string): RelativePath
// Use toTokenCount(value: number): TokenCount
// Use toLineNumber(value: number): LineNumber
```

## Steps

### Step 1: Create file and implement constructor and parseImports

Create `shared/src/adapters/generic-provider.ts`. Implement constructor (id = "generic", extensions = []), and parseImports(fileContent: string, filePath: RelativePath) returning []. Ensure no method throws.

**Verify:** `pnpm typecheck` passes.

### Step 2: Implement extractSignaturesWithDocs

Implement extractSignaturesWithDocs(fileContent: string) returning []. Ensure it never throws.

**Verify:** `pnpm typecheck` passes.

### Step 3: Implement extractSignaturesOnly and extractNames

Implement extractSignaturesOnly(fileContent: string): regex for function/class/def/func/pub fn lines; return CodeChunk[] with all required fields — filePath via toRelativePath(''), symbolName, symbolType (SYMBOL_TYPE.FUNCTION or SYMBOL_TYPE.CLASS), startLine and endLine via toLineNumber(n), content, tokenCount via toTokenCount(0). Implement extractNames(fileContent: string): regex for export-like names; return ExportedSymbol[] with kind SYMBOL_KIND.CONST or SYMBOL_KIND.FUNCTION. On any error or invalid input return []; never throw.

**Verify:** `pnpm typecheck` passes.

### Step 4: Unit tests

Create `shared/src/adapters/__tests__/generic-provider.test.ts`. Test: (1) parseImports always returns []; (2) extractSignaturesWithDocs always returns []; (3) extractSignaturesOnly returns chunks for "function foo" or "class Bar"; (4) extractNames returns non-empty for obvious exports; (5) invalid or empty input returns [] and does not throw; (6) extensions is empty.

**Verify:** `pnpm test -- shared/src/adapters/__tests__/generic-provider.test.ts` passes.

### Step 5: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

## Tests

| Test case                              | Description                                       |
| -------------------------------------- | ------------------------------------------------- |
| parseImports always empty              | Returns []                                        |
| extractSignaturesWithDocs always empty | Returns []                                        |
| extractSignaturesOnly regex            | Returns chunks for function/class/def/func/pub fn |
| extractNames best-effort               | Returns symbols for regex-matched names           |
| never throws                           | Invalid/empty input returns []                    |
| extensions empty                       | extensions.length === 0                           |

## Acceptance Criteria

- [ ] GenericProvider implements LanguageProvider; extensions is empty
- [ ] No method ever throws
- [ ] All test cases pass
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] Single-line comments only

## Blocked?

If blocked, append `## Blocked` and stop.
