# Task 045: JavaProvider

> **Status:** Pending
> **Phase:** Phase J — Intent & Selection Quality
> **Layer:** adapter
> **Depends on:** Phase B (LanguageProvider interface Done), Task 044 (RustProvider optional for ordering)

## Goal

Implement the LanguageProvider interface for Java (`.java`) using the tree-sitter parser for AST-safe import parsing and signature/symbol extraction.

## Architecture Notes

- Only this file may import `tree-sitter-java`. The `web-tree-sitter` package is shared across all WASM-based providers; this file is added to the existing ESLint ignores array. Add `tree-sitter-java` to ESLint restricted imports; add java-provider.ts to the adapter block ignores.
- Use `web-tree-sitter` (WASM), not native `tree-sitter`. Follow the same pattern as GoProvider: async `create()` factory, sync constructor taking the loaded `Parser`, `createRequire` to resolve the WASM grammar path. The `create()` factory does NOT call `Parser.init()` — that is called once in `initLanguageProviders()`.
- Wire via `additionalProviders` in composition roots (`mcp/src/server.ts`, `cli/src/main.ts`). Do NOT add to `create-pipeline-deps.ts` directly — only always-on fallback providers live there. Extend `initLanguageProviders()` to check for `.java` files and call `JavaProvider.create()` conditionally.

## Files

| Action | Path                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/adapters/java-provider.ts`                                                                     |
| Create | `shared/src/adapters/__tests__/java-provider.test.ts`                                                      |
| Modify | `shared/package.json` (add tree-sitter-java at exact version)                                              |
| Modify | `eslint.config.mjs` (restrict tree-sitter-java to java-provider.ts only)                                   |
| Modify | `mcp/src/server.ts` (extend `initLanguageProviders` to check for `.java` and call `JavaProvider.create()`) |
| Modify | `cli/src/main.ts` (extend `initLanguageProviders` to check for `.java` and call `JavaProvider.create()`)   |

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
// shared/src/adapters/java-provider.ts
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

export class JavaProvider implements LanguageProvider {
  readonly id = "java";
  readonly extensions: readonly FileExtension[];
  private constructor(private readonly parser: Parser) {
    this.extensions = [toFileExtension(".java")];
  }
  static async create(): Promise<JavaProvider> {
    const resolve = createRequire(import.meta.url).resolve;
    const language = await Language.load(
      resolve("tree-sitter-java/tree-sitter-java.wasm"),
    );
    const parser = new Parser();
    parser.setLanguage(language);
    return new JavaProvider(parser);
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

Use `toRelativePath("")` for CodeChunk.filePath; `toTokenCount(0)` for tokenCount. Line: `toLineNumber(node.startPosition.row + 1)`.

## Config Changes

- **package.json:** Add `"tree-sitter-java": "0.23.5"` to `shared/package.json` dependencies (exact version; verify on npm). Run `pnpm install`.
- **eslint.config.mjs:** In the adapter block that restricts tree-sitter and tree-sitter-python, add `"shared/src/adapters/java-provider.ts"` to the `ignores` array and add `{ name: "tree-sitter-java", message: "Only java-provider.ts may import tree-sitter-java." }` to the `paths` array.

## Steps

### Step 1: Add dependency

Add `"tree-sitter-java": "0.23.5"` to `shared/package.json` dependencies. Run `pnpm install`.

**Verify:** `pnpm typecheck` passes.

### Step 2: Restrict tree-sitter-java in ESLint

In `eslint.config.mjs`, in the adapter block that restricts tree-sitter and tree-sitter-python, add `"shared/src/adapters/java-provider.ts"` to the `ignores` array and add `{ name: "tree-sitter-java", message: "Only java-provider.ts may import tree-sitter-java." }` to the `paths` array.

**Verify:** `pnpm lint` passes; only java-provider.ts may import tree-sitter-java.

### Step 3: Implement JavaProvider

Create `shared/src/adapters/java-provider.ts`. Constructor: `new Parser()`, `parser.setLanguage(Java)`. parseImports: walk root for import_declaration; extract package path and symbols; return ImportRef[]. extractSignaturesWithDocs: walk for method_declaration, class_declaration; build CodeChunk with content (signature plus Javadoc). extractSignaturesOnly: same nodes, content without comment. extractNames: public members and top-level class; return ExportedSymbol[]. Use try/catch; on error return []. Use dispatch map or helpers for node type (no nested ternaries).

**Verify:** `pnpm typecheck` passes; file imports only from #core and tree-sitter/tree-sitter-java.

### Step 4: Add tests

Create `shared/src/adapters/__tests__/java-provider.test.ts`. Tests: parseImports for `import pkg.Class` returns ImportRef[]; extractSignaturesWithDocs/extractSignaturesOnly return CodeChunk[] for class/method; extractNames returns ExportedSymbol[] for public symbols; invalid Java returns [] and does not throw.

**Verify:** `pnpm test shared/src/adapters/__tests__/java-provider.test.ts` passes.

### Step 5a: Wire via composition root — `mcp/src/server.ts`

In `initLanguageProviders()`, import `JavaProvider` and add a `java` entry after `rs` using the ternary-spread pattern:

```typescript
const java = projectHasExtension(projectRoot, ".java")
  ? [await JavaProvider.create()]
  : [];
return [...py, ...go, ...rs, ...java];
```

**Verify:** `pnpm typecheck` passes.

### Step 5b: Wire via composition root — `cli/src/main.ts`

Apply the same change to `initLanguageProviders()` in `cli/src/main.ts`. Import `JavaProvider` and add the `java` ternary-spread entry.

**Verify:** `pnpm test` and `pnpm lint` pass.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                | Description                             |
| ---------------------------------------- | --------------------------------------- |
| parseImports_returns_refs                | import pkg.Class produces ImportRef[]   |
| extractSignaturesWithDocs_returns_chunks | class/method produce CodeChunk[]        |
| extractSignaturesOnly_returns_chunks     | Same without comments                   |
| extractNames_returns_symbols             | public symbols produce ExportedSymbol[] |
| invalid_java_returns_empty               | Malformed source returns []             |

## Acceptance Criteria

- [ ] JavaProvider implements LanguageProvider for .java
- [ ] Only java-provider.ts imports tree-sitter-java
- [ ] Registered before GenericImportProvider
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected: stop, append a `## Blocked` section with what you tried and what decision you need, and report to the user.
