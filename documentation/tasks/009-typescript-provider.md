# Task 009: TypeScriptProvider

> **Status:** Pending
> **Phase:** D (Adapters)
> **Layer:** adapter
> **Depends on:** Phase B (LanguageProvider interface, domain types Done)

## Goal

Implement the LanguageProvider interface for TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`) using the TypeScript Compiler API for L1/L2/L3 and regex for import parsing, so the pipeline can use first-class TS/JS support.

## Architecture Notes

- LanguageProvider is already in core (language-provider.interface.ts). This task only adds the implementation in adapters.
- One adapter per library: TypeScript compiler API is used only in this file; add `typescript` to ESLint restricted imports for all paths except this adapter.
- Project plan §8.1: Import parsing regex-based; L1/L2 via ts.createSourceFile and AST walk; L3 exported symbol names + kinds. CodeChunk requires filePath — use toRelativePath('') when the method does not receive path (caller can set when merging).
- Extensions must be built with toFileExtension() so the type is readonly FileExtension[] (ADR-010). CodeChunk startLine/endLine must use toLineNumber() from #core/types/units.js.

## Files

| Action | Path                                                                     |
| ------ | ------------------------------------------------------------------------ |
| Create | `shared/src/adapters/typescript-provider.ts`                             |
| Create | `shared/src/adapters/__tests__/typescript-provider.test.ts`              |
| Modify | `shared/package.json` (add typescript at version 5.7.2)                  |
| Modify | `eslint.config.mjs` (restrict typescript to typescript-provider.ts only) |

## Interface / Signature

Implement the existing interface (no changes to core):

```typescript
// From shared/src/core/interfaces/language-provider.interface.ts
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

TypeScriptProvider class:

```typescript
// shared/src/adapters/typescript-provider.ts
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toFileExtension } from "#core/types/paths.js";

export class TypeScriptProvider implements LanguageProvider {
  readonly id = "typescript";
  readonly extensions: readonly FileExtension[];
  constructor() {
    this.extensions = [
      toFileExtension(".ts"),
      toFileExtension(".tsx"),
      toFileExtension(".js"),
      toFileExtension(".jsx"),
    ];
  }
  parseImports(fileContent: string, filePath: RelativePath): readonly ImportRef[];
  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[];
  extractSignaturesOnly(fileContent: string): readonly CodeChunk[];
  extractNames(fileContent: string): readonly ExportedSymbol[];
}
```

- L1: signatures + JSDoc (include doc comments).
- L2: signatures only (no JSDoc, no bodies).
- L3: exported names + SymbolKind from AST.
- parseImports: regex for import/require; return ImportRef[] (source, symbols, isRelative).
- CodeChunk.filePath: use toRelativePath('') when method has no path. CodeChunk.tokenCount: use toTokenCount(0) from #core/types/units.js in this task; do not inject TokenCounter. CodeChunk.startLine and endLine: use toLineNumber() from #core/types/units.js with the 1-based line from the AST.

## Dependent Types

```typescript
// ImportRef (from #core/types/import-ref.js)
export interface ImportRef {
  readonly source: string;
  readonly symbols: readonly string[];
  readonly isRelative: boolean;
}

// CodeChunk (from #core/types/code-chunk.js)
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

// ExportedSymbol (from #core/types/exported-symbol.js)
import type { SymbolKind } from "#core/types/enums.js";
export interface ExportedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
}
```

- FileExtension: branded type from `#core/types/paths.js`; use toFileExtension(value). SymbolType and SymbolKind: from `#core/types/enums.js` (SYMBOL_TYPE, SYMBOL_KIND). LineNumber: use toLineNumber(value) from `#core/types/units.js`.

## Config Changes

- **package.json:** Add dependency `"typescript": "5.7.2"` (exact).
- **eslint.config.mjs:** (1) In the core/pipeline block `no-restricted-imports` paths array, add `{ name: "typescript", message: "Use LanguageProvider interface." }`. (2) In the storage block `no-restricted-imports` paths array, add the same typescript entry. (3) Add a new block after the adapter boundary block and before the system-clock exemption with `files: ["shared/src/adapters/**/*.ts"]`, `ignores: ["shared/src/adapters/typescript-provider.ts"]`, and `no-restricted-imports` set to the full adapter rule: same paths as the adapter boundary (better-sqlite3, zod) plus `{ name: "typescript", message: "Only typescript-provider.ts may import typescript." }`, and the same patterns as the adapter boundary (BAN_RELATIVE_PARENT and the four group entries for cli, mcp, storage, pipeline). This ensures adapter files other than typescript-provider.ts get all existing restrictions plus typescript; typescript-provider.ts is only subject to the adapter boundary block and may import typescript.

## Steps

### Step 1: Add typescript dependency

Add `"typescript": "5.7.2"` to `shared/package.json` dependencies. Run `pnpm install`.

**Verify:** `pnpm install` completes without errors.

### Step 2: Add ESLint restriction for typescript

In `eslint.config.mjs`, add the typescript path entry to the core/pipeline block's no-restricted-imports paths and to the storage block's no-restricted-imports paths. Add the new adapter block (files adapters/\*_/_.ts, ignores typescript-provider.ts, no-restricted-imports with full paths and patterns as in Config Changes).

**Verify:** `pnpm lint` passes with zero errors.

### Step 3: Implement constructor, id, extensions, and parseImports

Create `shared/src/adapters/typescript-provider.ts`. Implement the class with `readonly id = "typescript"`, `readonly extensions` set in constructor using toFileExtension() for each of ".ts", ".tsx", ".js", ".jsx", and `parseImports(fileContent: string, filePath: RelativePath)`: use regex for import/require lines; return `ImportRef[]` (source, symbols, isRelative).

**Verify:** `pnpm typecheck` passes.

### Step 4: Implement extractSignaturesWithDocs and extractSignaturesOnly

Implement `extractSignaturesWithDocs(fileContent: string)` and `extractSignaturesOnly(fileContent: string)`. Use ts.createSourceFile and AST walk for functions/classes/interfaces; L1 includes JSDoc in content, L2 omits JSDoc. Return CodeChunk[] with filePath toRelativePath(''), symbolName, symbolType from SYMBOL_TYPE, startLine and endLine via toLineNumber() from AST line numbers, content, tokenCount toTokenCount(0).

**Verify:** `pnpm typecheck` passes.

### Step 5: Implement extractNames

Implement `extractNames(fileContent: string)`: walk AST for exported names and kinds; map to SYMBOL_KIND; return ExportedSymbol[] with name and kind.

**Verify:** `pnpm typecheck` passes.

### Step 6: Unit tests

Create `shared/src/adapters/__tests__/typescript-provider.test.ts`. Use in-memory fixture strings for all tests. Test: (1) parseImports returns ImportRef[] for import/require lines; (2) extractSignaturesWithDocs returns at least one chunk for a file with a function; (3) extractSignaturesOnly omits JSDoc from content; (4) extractNames returns ExportedSymbol[] with name and kind; (5) extensions and id match .ts, .tsx, .js, .jsx; (6) extractNames returns empty array for a file with no exports (edge case).

**Verify:** `pnpm test -- shared/src/adapters/__tests__/typescript-provider.test.ts` passes.

### Step 7: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test`. Expected: all pass.

## Tests

| Test case                 | Description                                     |
| ------------------------- | ----------------------------------------------- |
| parseImports              | Returns ImportRef[] for import/require lines    |
| extractSignaturesWithDocs | Returns CodeChunk[] with content including docs |
| extractSignaturesOnly     | Returns chunks without JSDoc in content         |
| extractNames              | Returns ExportedSymbol[] with name and kind     |
| extensions                | id and extensions match .ts, .tsx, .js, .jsx    |
| extractNames empty        | Returns empty array for file with no exports    |

## Acceptance Criteria

- [ ] TypeScriptProvider implements LanguageProvider exactly
- [ ] extensions built with toFileExtension(); CodeChunk startLine/endLine with toLineNumber()
- [ ] typescript only imported in typescript-provider.ts
- [ ] All test cases pass
- [ ] `pnpm lint` and `pnpm typecheck` clean
- [ ] Single-line comments only

## Blocked?

If blocked, append `## Blocked` with what you tried, what went wrong, and what decision you need. Stop and report.
