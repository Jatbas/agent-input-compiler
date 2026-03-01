# Task 043: GoProvider

> **Status:** Done
> **Phase:** Phase J — Intent & Selection Quality
> **Layer:** adapter
> **Depends on:** Phase B (LanguageProvider interface Done), Task 042 (PythonProvider optional for ordering)

## Goal

Implement the LanguageProvider interface for Go (`.go`) using the tree-sitter parser for AST-safe import parsing and signature/symbol extraction.

## Architecture Notes

- Only this file may import `tree-sitter-go`. The `web-tree-sitter` package is shared across all WASM-based providers; this file is added to the existing ESLint ignores array alongside `python-provider.ts`. Add `tree-sitter-go` to ESLint restricted imports (add go-provider.ts to the same adapter block, and add path entry for tree-sitter-go).
- Use `web-tree-sitter` (WASM), not native `tree-sitter`. Follow the same pattern as PythonProvider: async `create()` factory, sync constructor taking the loaded `Parser`, `createRequire` to resolve the WASM grammar path. The `create()` factory does NOT call `Parser.init()` — that is called once in `initLanguageProviders()` before creating any WASM provider.
- Wire via `additionalProviders` in composition roots (`mcp/src/server.ts`, `cli/src/main.ts`). Do NOT add to `create-pipeline-deps.ts` directly — only always-on fallback providers live there. Extend `initLanguageProviders()` to check for `.go` files and call `GoProvider.create()` conditionally.

## Files

| Action | Path                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------ |
| Create | `shared/src/adapters/go-provider.ts`                                                                   |
| Create | `shared/src/adapters/__tests__/go-provider.test.ts`                                                    |
| Modify | `shared/package.json` (add tree-sitter-go at exact version)                                            |
| Modify | `eslint.config.mjs` (restrict tree-sitter-go to go-provider.ts only)                                   |
| Modify | `mcp/src/server.ts` (extend `initLanguageProviders` to check for `.go` and call `GoProvider.create()`) |
| Modify | `cli/src/main.ts` (extend `initLanguageProviders` to check for `.go` and call `GoProvider.create()`)   |

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
// shared/src/adapters/go-provider.ts
import { Parser, Language, type Node, type Tree } from "web-tree-sitter";
import { createRequire } from "node:module";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toFileExtension, toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";

export class GoProvider implements LanguageProvider {
  readonly id = "go";
  readonly extensions: readonly FileExtension[];
  private constructor(private readonly parser: Parser) {
    this.extensions = [toFileExtension(".go")];
  }
  static async create(): Promise<GoProvider> {
    const resolve = createRequire(import.meta.url).resolve;
    const language = await Language.load(resolve("tree-sitter-go/tree-sitter-go.wasm"));
    const parser = new Parser();
    parser.setLanguage(language);
    return new GoProvider(parser);
  }
  parseImports(fileContent: string, _filePath: RelativePath): readonly ImportRef[];
  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[];
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

Use `toRelativePath("")` for CodeChunk.filePath; `toTokenCount(0)` for tokenCount. Line from node: `toLineNumber(node.startPosition.row + 1)`.

## Config Changes

- **package.json:** Add `"tree-sitter-go": "0.23.4"` to `shared/package.json` dependencies (exact version). Run `pnpm install`.
- **eslint.config.mjs:** In the adapter block that already has `ignores` including python-provider.ts and restricts tree-sitter/tree-sitter-python, add `"shared/src/adapters/go-provider.ts"` to the `ignores` array. Add to the `paths` array: `{ name: "tree-sitter-go", message: "Only go-provider.ts may import tree-sitter-go." }`.

## Steps

### Step 1: Add dependency

Add `"tree-sitter-go": "0.23.4"` to `shared/package.json` dependencies. Run `pnpm install`.

**Verify:** `pnpm typecheck` passes.

### Step 2: Restrict tree-sitter-go in ESLint

In `eslint.config.mjs`, in the adapter block that restricts tree-sitter and tree-sitter-python, add `"shared/src/adapters/go-provider.ts"` to the `ignores` array and add `{ name: "tree-sitter-go", message: "Only go-provider.ts may import tree-sitter-go." }` to the `paths` array.

**Verify:** `pnpm lint` passes; only go-provider.ts may import tree-sitter-go.

### Step 3: Implement GoProvider

Create `shared/src/adapters/go-provider.ts`. Constructor: `new Parser()`, `parser.setLanguage(Go)`. parseImports: walk root for import_spec/import_decl; extract path and symbols; return ImportRef[]. extractSignaturesWithDocs: walk for function_declaration, method_declaration, type_spec (struct/interface); build CodeChunk with content (signature plus doc comment). extractSignaturesOnly: same nodes, content without comment. extractNames: exported names (capitalized or with doc); return ExportedSymbol[]. Use try/catch; on error return []. Use dispatch map or helpers for node type to SymbolType/SymbolKind (no nested ternaries).

**Verify:** `pnpm typecheck` passes; file imports only from #core and tree-sitter/tree-sitter-go.

### Step 4: Add tests

Create `shared/src/adapters/__tests__/go-provider.test.ts`. Tests: parseImports for `import "pkg"` returns non-empty ImportRef[]; extractSignaturesWithDocs returns CodeChunk[] for func/type; extractSignaturesOnly returns chunks without comments; extractNames returns ExportedSymbol[] for exported names; invalid Go returns [] and does not throw.

**Verify:** `pnpm test shared/src/adapters/__tests__/go-provider.test.ts` passes.

### Step 5a: Wire via composition root — `mcp/src/server.ts`

Restructure `initLanguageProviders()` from the current single-provider early-return into the accumulation pattern below. Import `GoProvider` and `{ Parser } from "web-tree-sitter"`. Call `Parser.init()` once before creating any WASM provider. Use ternary-spread to accumulate providers immutably:

```typescript
async function initLanguageProviders(
  projectRoot: AbsolutePath,
): Promise<readonly LanguageProvider[]> {
  await Parser.init();
  const py = projectHasExtension(projectRoot, ".py")
    ? [await PythonProvider.create()]
    : [];
  const go = projectHasExtension(projectRoot, ".go") ? [await GoProvider.create()] : [];
  return [...py, ...go];
}
```

**Verify:** `pnpm typecheck` passes.

### Step 5b: Wire via composition root — `cli/src/main.ts`

Apply the same restructuring to `initLanguageProviders()` in `cli/src/main.ts`. Import `GoProvider` and `{ Parser } from "web-tree-sitter"`. The pattern is identical to Step 5a (ternary-spread accumulation with `Parser.init()` called once at the top).

**Verify:** `pnpm test` and `pnpm lint` pass.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                | Description                             |
| ---------------------------------------- | --------------------------------------- |
| parseImports_returns_refs                | import "path" produces ImportRef[]      |
| extractSignaturesWithDocs_returns_chunks | func/type produce CodeChunk[]           |
| extractSignaturesOnly_returns_chunks     | Same without comments                   |
| extractNames_returns_symbols             | Exported names produce ExportedSymbol[] |
| invalid_go_returns_empty                 | Malformed source returns []             |

## Acceptance Criteria

- [ ] GoProvider implements LanguageProvider for .go
- [ ] Only go-provider.ts imports tree-sitter-go
- [ ] Registered before GenericImportProvider
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected: stop, append a `## Blocked` section with what you tried and what decision you need, and report to the user.
