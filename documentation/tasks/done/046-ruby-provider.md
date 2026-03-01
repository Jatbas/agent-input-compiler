# Task 046: RubyProvider

> **Status:** In Progress
> **Phase:** Phase J — Intent & Selection Quality
> **Layer:** adapter
> **Depends on:** Phase B (LanguageProvider interface Done)

## Goal

Implement the LanguageProvider interface for Ruby (`.rb`) with regex-based import parsing (require/load) and regex-based L2/L3 extraction. L1 returns [].

## Architecture Notes

- Regex only; no new dependency. Never throw (Null Object style).
- Wire via `additionalProviders` in composition roots (`mcp/src/server.ts`, `cli/src/main.ts`). Do NOT add to `create-pipeline-deps.ts` directly — only always-on fallback providers live there. Extend `initLanguageProviders()` to check for the relevant file extension and create the provider conditionally.

## Files

| Action | Path                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- |
| Create | `shared/src/adapters/ruby-provider.ts`                                                          |
| Create | `shared/src/adapters/__tests__/ruby-provider.test.ts`                                           |
| Modify | `mcp/src/server.ts` (extend `initLanguageProviders` to check for extension and create provider) |
| Modify | `cli/src/main.ts` (extend `initLanguageProviders` to check for extension and create provider)   |

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
// shared/src/adapters/ruby-provider.ts
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toFileExtension, toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";

export class RubyProvider implements LanguageProvider {
  readonly id = "ruby";
  readonly extensions: readonly FileExtension[];
  constructor() {
    this.extensions = [toFileExtension(".rb")];
  }
  parseImports(fileContent: string, _filePath: RelativePath): readonly ImportRef[];
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
// CodeChunk — shared/src/core/types/code-chunk.ts (fields)
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

Use `toRelativePath("")` for CodeChunk.filePath; `toTokenCount(0)` for tokenCount.

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change (no new package).

## Steps

### Step 1: Implement RubyProvider

Create `shared/src/adapters/ruby-provider.ts`. Constructor sets `id = "ruby"` and `extensions = [toFileExtension(".rb")]`. parseImports: regex for `require("...")` and `load("...")`; extract source path; return ImportRef[] with isRelative when path starts with ".". extractSignaturesWithDocs: return `[]`. extractSignaturesOnly: regex for lines matching `^\s*def\s+\w+` or `^\s*class\s+\w+`; build CodeChunk with filePath `toRelativePath("")`, symbolName, symbolType (SYMBOL_TYPE.CLASS for class, SYMBOL_TYPE.FUNCTION for def), startLine/endLine via `toLineNumber`, content (the line), tokenCount `toTokenCount(0)`. extractNames: regex for top-level `class\s+(\w+)`, `module\s+(\w+)`, `def\s+self\.(\w+)`; return ExportedSymbol[] with appropriate SYMBOL_KIND. Wrap all logic in try/catch; on error return []. Never throw.

**Verify:** `pnpm typecheck` passes; file imports only from #core.

### Step 2: Add tests

Create `shared/src/adapters/__tests__/ruby-provider.test.ts`. Tests: parseImports with `require "x"` returns non-empty ImportRef[]; extractSignaturesOnly with def/class returns CodeChunk[]; extractNames returns ExportedSymbol[] for class/module; empty or malformed content yields [] and does not throw.

**Verify:** `pnpm test shared/src/adapters/__tests__/ruby-provider.test.ts` passes.

### Step 3a: Wire via composition root — `mcp/src/server.ts`

In `initLanguageProviders()`, import `RubyProvider` and add an `rb` entry using the ternary-spread pattern:

```typescript
const rb = projectHasExtension(projectRoot, ".rb") ? [new RubyProvider()] : [];
return [...py, ...go, ...rs, ...java, ...rb];
```

Adjust the spread list to match whatever providers exist at the time this task is executed.

**Verify:** `pnpm typecheck` passes.

### Step 3b: Wire via composition root — `cli/src/main.ts`

Apply the same change to `initLanguageProviders()` in `cli/src/main.ts`. Import `RubyProvider` and add the `rb` ternary-spread entry.

**Verify:** `pnpm typecheck` and `pnpm test` pass.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                            | Description                                     |
| ------------------------------------ | ----------------------------------------------- |
| parseImports_returns_refs            | require "x" produces ImportRef[]                |
| extractSignaturesOnly_returns_chunks | def/class produce CodeChunk[]                   |
| extractNames_returns_symbols         | class/module produce ExportedSymbol[]           |
| invalid_returns_empty                | Malformed content returns [] and does not throw |

## Acceptance Criteria

- [ ] RubyProvider implements LanguageProvider for .rb
- [ ] Regex only; never throw
- [ ] Registered before GenericImportProvider
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected: stop, append a `## Blocked` section with what you tried and what decision you need, and report to the user.
