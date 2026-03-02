# Task 048: CssProvider

> **Status:** Done
> **Phase:** Phase J — Intent & Selection Quality
> **Layer:** adapter
> **Depends on:** Phase B (LanguageProvider interface Done)

## Goal

Implement the LanguageProvider interface for CSS (`.css`) with regex for @import and regex-based L2 (selector-like lines) and L3. parseImports extracts @import URL/path for proximity; L1 returns [].

## Architecture Notes

- Regex only; no new dependency. Never throw (Null Object style).
- parseImports: @import url(...) or @import "..." → ImportRef[] (source = URL or path). extractNames: return [] (CSS has no exported symbols in the same sense).
- Wire via `additionalProviders` in composition roots (`mcp/src/server.ts`, `cli/src/main.ts`). Do NOT add to `create-pipeline-deps.ts` directly — only always-on fallback providers live there. Extend `initLanguageProviders()` to check for the relevant file extension and create the provider conditionally.

## Files

| Action | Path                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------- |
| Create | `shared/src/adapters/css-provider.ts`                                                           |
| Create | `shared/src/adapters/__tests__/css-provider.test.ts`                                            |
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
// shared/src/adapters/css-provider.ts
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toFileExtension, toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_TYPE } from "#core/types/enums.js";

export class CssProvider implements LanguageProvider {
  readonly id = "css";
  readonly extensions: readonly FileExtension[];
  constructor() {
    this.extensions = [toFileExtension(".css")];
  }
  parseImports(fileContent: string, _filePath: RelativePath): readonly ImportRef[];
  extractSignaturesWithDocs(_fileContent: string): readonly CodeChunk[];
  extractSignaturesOnly(fileContent: string): readonly CodeChunk[];
  extractNames(_fileContent: string): readonly ExportedSymbol[];
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

| Type            | Path                   | Factory                                       |
| --------------- | ---------------------- | --------------------------------------------- |
| `FileExtension` | `#core/types/paths.js` | `toFileExtension(raw)`                        |
| `RelativePath`  | `#core/types/paths.js` | `toRelativePath(raw)`                         |
| `LineNumber`    | `#core/types/units.js` | `toLineNumber(n)`                             |
| `TokenCount`    | `#core/types/units.js` | `toTokenCount(n)`                             |
| `SymbolType`    | `#core/types/enums.js` | `SYMBOL_TYPE.CLASS` (use for selector chunks) |

Use `toRelativePath("")` for CodeChunk.filePath; `toTokenCount(0)` for tokenCount. extractNames returns [].

## Config Changes

- **package.json:** No change.
- **eslint.config.mjs:** No change (no new package).

## Steps

### Step 1: Implement CssProvider

Create `shared/src/adapters/css-provider.ts`. Constructor sets `id = "css"` and `extensions = [toFileExtension(".css")]`. parseImports: regex `@import\s+(?:url\()?["']?([^"')]+)["']?\);`; capture the URL/path; return ImportRef[] with source set to that value, symbols `[]`, isRelative when source starts with "." or "/". extractSignaturesWithDocs: return `[]`. extractSignaturesOnly: regex for lines that look like selectors (e.g. `.class`, `#id`, `element` at start of line before `{`); for each match build CodeChunk with symbolName the selector text, symbolType SYMBOL_TYPE.CLASS, filePath `toRelativePath("")`, startLine/endLine from line number, content the line, tokenCount `toTokenCount(0)`. If no selector lines match, return []. extractNames: return `[]`. Wrap all logic in try/catch; on error return []. Never throw.

**Verify:** `pnpm typecheck` passes; file imports only from #core.

### Step 2: Add tests

Create `shared/src/adapters/__tests__/css-provider.test.ts`. Tests: parseImports with `@import url("x")` or `@import "x";` returns ImportRef[] with correct source; extractSignaturesOnly returns CodeChunk[] when selector-like lines exist, or [] otherwise; extractNames returns []; empty or malformed content yields [] and does not throw.

**Verify:** `pnpm test shared/src/adapters/__tests__/css-provider.test.ts` passes.

### Step 3a: Wire via composition root — `mcp/src/server.ts`

In `initLanguageProviders()`, import `CssProvider` and add a `css` entry using the ternary-spread pattern:

```typescript
const css = projectHasExtension(projectRoot, ".css") ? [new CssProvider()] : [];
```

Add `...css` to the return spread. Adjust the spread list to match whatever providers exist at the time this task is executed.

**Verify:** `pnpm typecheck` passes.

### Step 3b: Wire via composition root — `cli/src/main.ts`

Apply the same change to `initLanguageProviders()` in `cli/src/main.ts`. Import `CssProvider` and add the `css` ternary-spread entry.

**Verify:** `pnpm typecheck` and `pnpm test` pass.

### Step 4: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                            | Description                                          |
| ------------------------------------ | ---------------------------------------------------- |
| parseImports_returns_refs            | @import url("x") or @import "x" produces ImportRef[] |
| extractSignaturesOnly_returns_chunks | Selector-like lines produce CodeChunk[] when present |
| extractNames_returns_empty           | extractNames returns []                              |
| invalid_returns_empty                | Malformed content returns [] and does not throw      |

## Acceptance Criteria

- [ ] CssProvider implements LanguageProvider for .css
- [ ] Regex only; never throw
- [ ] Registered before GenericImportProvider
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected: stop, append a `## Blocked` section with what you tried and what decision you need, and report to the user.
