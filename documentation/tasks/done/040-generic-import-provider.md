# Task 040: GenericImportProvider

> **Status:** In Progress
> **Phase:** Phase J — Intent & Selection Quality
> **Layer:** adapter
> **Depends on:** Phase B (LanguageProvider interface Done), Task 010 (GenericProvider)

## Goal

Implement a LanguageProvider for Python, Go, Rust, and Java that provides regex-based import parsing (so import-graph proximity can score these files) and regex-based L2/L3 extraction. L1 returns empty so the summarisation ladder falls through to L2.

## Architecture Notes

- Implements existing LanguageProvider; no new interface. One adapter covers .py, .go, .rs, .java via extension dispatch.
- No external library: regex only. No ESLint restriction for a new package.
- Must never throw (Null Object style). Register before GenericProvider in create-pipeline-deps.

## Files

| Action | Path                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/adapters/generic-import-provider.ts`                                                                 |
| Create | `shared/src/adapters/__tests__/generic-import-provider.test.ts`                                                  |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate and add to languageProviders before genericProvider) |

## Interface / Signature

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

```typescript
// shared/src/adapters/generic-import-provider.ts
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toFileExtension } from "#core/types/paths.js";

export class GenericImportProvider implements LanguageProvider {
  readonly id = "generic-import";
  readonly extensions: readonly FileExtension[];
  constructor() {
    this.extensions = [
      toFileExtension(".py"),
      toFileExtension(".go"),
      toFileExtension(".rs"),
      toFileExtension(".java"),
    ];
  }
  parseImports(fileContent: string, filePath: RelativePath): readonly ImportRef[];
  extractSignaturesWithDocs(_fileContent: string): readonly CodeChunk[];
  extractSignaturesOnly(fileContent: string): readonly CodeChunk[];
  extractNames(fileContent: string): readonly ExportedSymbol[];
}
```

## Dependent Types

### Tier 0 — verbatim

```typescript
// ImportRef — shared/src/core/types/import-ref.ts
export interface ImportRef {
  readonly source: string;
  readonly symbols: readonly string[];
  readonly isRelative: boolean;
}
```

```typescript
// CodeChunk — shared/src/core/types/code-chunk.ts (fields only)
readonly filePath: RelativePath;
readonly symbolName: string;
readonly symbolType: SymbolType;
readonly startLine: LineNumber;
readonly endLine: LineNumber;
readonly content: string;
readonly tokenCount: TokenCount;
```

```typescript
// ExportedSymbol — shared/src/core/types/exported-symbol.ts
export interface ExportedSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
}
```

### Tier 2 — path-only

| Type            | Path                   | Factory                                     |
| --------------- | ---------------------- | ------------------------------------------- |
| `FileExtension` | `#core/types/paths.js` | `toFileExtension(raw)`                      |
| `RelativePath`  | `#core/types/paths.js` | `toRelativePath(raw)`                       |
| `LineNumber`    | `#core/types/units.js` | `toLineNumber(n)`                           |
| `TokenCount`    | `#core/types/units.js` | `toTokenCount(n)`                           |
| `SymbolType`    | `#core/types/enums.js` | `SYMBOL_TYPE.FUNCTION`, `SYMBOL_TYPE.CLASS` |
| `SymbolKind`    | `#core/types/enums.js` | `SYMBOL_KIND.*`                             |

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change (no new package).

## Steps

### Step 1: Implement GenericImportProvider

Create `shared/src/adapters/generic-import-provider.ts`. Constructor sets `id = "generic-import"` and `extensions = [.py, .go, .rs, .java]` using `toFileExtension`. Implement `parseImports`: derive extension from `filePath` by taking the substring after the last "."; dispatch to Python regex (import/from), Go regex (import "path" or import ( ... )), Rust regex (use ...), Java regex (import pkg.Class); return `ImportRef[]` with source, symbols, isRelative (relative = source starts with "." or "/"). Implement `extractSignaturesWithDocs`: return `[]`. Implement `extractSignaturesOnly`: dispatch by extension; Python: lines matching def/class; Go: func; Rust: fn/impl; Java: public void/class; build CodeChunk with filePath `toRelativePath("")`, symbolName, symbolType, startLine/endLine via `toLineNumber`, content, tokenCount `toTokenCount(0)`. Implement `extractNames`: regex for export-like patterns per language; return ExportedSymbol[]. Wrap all logic in try/catch; on error return []. Never throw.

**Verify:** `pnpm typecheck` passes; file imports only from #core and uses branded types.

### Step 2: Add tests

Create `shared/src/adapters/__tests__/generic-import-provider.test.ts`. Tests: parseImports with Python snippet (import x; from y import z) returns non-empty ImportRef[]; parseImports with Go snippet (import "pkg") returns non-empty; parseImports with Rust snippet (use crate::x) returns non-empty; parseImports with Java snippet (import pkg.Class) returns non-empty; extractSignaturesOnly with def/class or func returns CodeChunk[]; extractNames returns ExportedSymbol[] for export-like lines; empty or invalid content yields [] and does not throw.

**Verify:** `pnpm test shared/src/adapters/__tests__/generic-import-provider.test.ts` passes.

### Step 3: Wire in bootstrap

In `shared/src/bootstrap/create-pipeline-deps.ts`, instantiate `GenericImportProvider`, add it to the `languageProviders` array after `typeScriptProvider` and before `genericProvider` (so order is typeScriptProvider, genericImportProvider, genericProvider).

**Verify:** `pnpm typecheck` and `pnpm test` pass.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                            | Description                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| parseImports_python                  | Python import/from lines produce ImportRef[] with correct source and symbols |
| parseImports_go                      | Go import block produces ImportRef[]                                         |
| parseImports_rust                    | Rust use statements produce ImportRef[]                                      |
| parseImports_java                    | Java import lines produce ImportRef[]                                        |
| extractSignaturesOnly_returns_chunks | def/class or func/fn produces CodeChunk[]                                    |
| extractNames_returns_symbols         | Export-like lines produce ExportedSymbol[]                                   |
| never_throws                         | Empty or malformed content returns [] and does not throw                     |

## Acceptance Criteria

- [ ] GenericImportProvider created with extensions .py, .go, .rs, .java
- [ ] parseImports returns correct ImportRef[] per language; extractSignaturesWithDocs returns []; extractSignaturesOnly and extractNames use regex per language
- [ ] All tests pass; provider never throws
- [ ] Registered in create-pipeline-deps before GenericProvider
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected: stop, append a `## Blocked` section with what you tried and what decision you need, and report to the user.
