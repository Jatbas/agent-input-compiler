# Task 042: PythonProvider

> **Status:** Done
> **Phase:** Phase J — Intent & Selection Quality
> **Layer:** adapter
> **Depends on:** Phase B (LanguageProvider interface Done), Task 040 (GenericImportProvider optional for ordering)

## Goal

Implement the LanguageProvider interface for Python (`.py`) using the tree-sitter parser for AST-safe import parsing and signature/symbol extraction, so the pipeline gets import proximity and L1/L2/L3 for Python files.

## Architecture Notes

- One adapter per library: only this file may import `tree-sitter` and `tree-sitter-python`. Add both to ESLint restricted imports for all other adapter files.
- Tree-sitter API: sync; `parser.parse(source)` returns a Tree; walk `rootNode` by type (import_statement, import_from_statement, function_definition, class_definition). Node positions use `startPosition.row` (0-based); convert to 1-based line for CodeChunk with `toLineNumber(node.startPosition.row + 1)`.
- Register before GenericImportProvider in create-pipeline-deps so Python uses this provider instead of GenericImportProvider.

## Files

| Action | Path                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Create | `shared/src/adapters/python-provider.ts`                                                                                           |
| Create | `shared/src/adapters/__tests__/python-provider.test.ts`                                                                            |
| Modify | `shared/package.json` (add tree-sitter and tree-sitter-python at exact versions)                                                   |
| Modify | `eslint.config.mjs` (restrict tree-sitter and tree-sitter-python to python-provider.ts only)                                       |
| Modify | `shared/src/bootstrap/create-pipeline-deps.ts` (instantiate PythonProvider, add to languageProviders before genericImportProvider) |

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
// shared/src/adapters/python-provider.ts
import Parser from "tree-sitter";
import Python from "tree-sitter-python";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { ImportRef } from "#core/types/import-ref.js";
import type { CodeChunk } from "#core/types/code-chunk.js";
import type { ExportedSymbol } from "#core/types/exported-symbol.js";
import { toFileExtension, toRelativePath } from "#core/types/paths.js";
import { toLineNumber, toTokenCount } from "#core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";

export class PythonProvider implements LanguageProvider {
  readonly id = "python";
  readonly extensions: readonly FileExtension[];
  private readonly parser: Parser;
  constructor() {
    this.extensions = [toFileExtension(".py")];
    const p = new Parser();
    p.setLanguage(Python as Parser.Language);
    this.parser = p;
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

Use `toRelativePath("")` for CodeChunk.filePath; `toTokenCount(0)` for tokenCount.

## Config Changes

- **package.json:** Add `"tree-sitter": "0.25.0"` and `"tree-sitter-python": "0.25.0"` to `shared/package.json` dependencies (exact versions). Run `pnpm install`.
- **eslint.config.mjs:** Add a new block after the typescript-provider block. Copy that block: `files: ["shared/src/adapters/**/*.ts"]`, same `ignores` array but add `"shared/src/adapters/python-provider.ts"` to the ignores list (so python-provider.ts is allowed to import tree-sitter). In the same block that currently restricts typescript, add two path entries: `{ name: "tree-sitter", message: "Only python-provider.ts may import tree-sitter." }` and `{ name: "tree-sitter-python", message: "Only python-provider.ts may import tree-sitter-python." }`. All other paths and patterns in that block stay unchanged. Result: python-provider.ts is in ignores so it is not subject to this block; all other adapter files are restricted from importing tree-sitter and tree-sitter-python.

## Steps

### Step 1: Add dependencies

Add to `shared/package.json` in the `dependencies` object: `"tree-sitter": "0.25.0"` and `"tree-sitter-python": "0.25.0"`. Run `pnpm install`.

**Verify:** `pnpm typecheck` passes.

### Step 2: Restrict tree-sitter imports in ESLint

In `eslint.config.mjs`, locate the adapter block that has `ignores` including `typescript-provider.ts` and restricts `typescript`. Add `"shared/src/adapters/python-provider.ts"` to that block's `ignores` array. In the same block's `paths` array, add `{ name: "tree-sitter", message: "Only python-provider.ts may import tree-sitter." }` and `{ name: "tree-sitter-python", message: "Only python-provider.ts may import tree-sitter-python." }`.

**Verify:** `pnpm lint` passes; only python-provider.ts may import tree-sitter or tree-sitter-python.

### Step 3: Implement PythonProvider

Create `shared/src/adapters/python-provider.ts`. Constructor: create `new Parser()`, call `parser.setLanguage(Python)` (Python from tree-sitter-python). parseImports: call `parser.parse(fileContent)`, get `tree.rootNode`, walk children for nodes with type `import_statement` or `import_from_statement`; extract module path and symbol names from node text; return ImportRef[] with isRelative when source starts with ".". extractSignaturesWithDocs: walk for function_definition and class_definition; for each, get signature range and preceding docstring from source slice; build CodeChunk with content including docstring. extractSignaturesOnly: same walk, content without docstring. extractNames: walk for function_definition and class_definition; return ExportedSymbol[] with SYMBOL_KIND.FUNCTION or SYMBOL_KIND.CLASS. Use try/catch; on parse error return []. Use `node.startPosition.row + 1` for toLineNumber. Use dispatch map or helper for node-type to SymbolType/SymbolKind (no nested ternaries).

**Verify:** `pnpm typecheck` passes; file imports only from #core and tree-sitter/tree-sitter-python.

### Step 4: Add tests

Create `shared/src/adapters/__tests__/python-provider.test.ts`. Tests: parseImports returns ImportRef[] for "import x" and "from y import z"; extractSignaturesWithDocs returns CodeChunk[] for a def and a class; extractSignaturesOnly returns chunks without docstring; extractNames returns symbols for def/class; invalid Python returns [] and does not throw.

**Verify:** `pnpm test shared/src/adapters/__tests__/python-provider.test.ts` passes.

### Step 5: Wire in bootstrap

In `shared/src/bootstrap/create-pipeline-deps.ts`, import PythonProvider, instantiate it, add to languageProviders after typeScriptProvider and before genericImportProvider.

**Verify:** `pnpm test` and `pnpm lint` pass.

### Step 6: Final verification

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm knip`
Expected: all pass, zero warnings, no new knip findings.

## Tests

| Test case                                    | Description                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| parseImports_returns_refs                    | Python import/from lines produce ImportRef[]                                |
| extractSignaturesWithDocs_includes_docstring | def/class with docstring produce CodeChunk with content including docstring |
| extractSignaturesOnly_no_docstring           | Same nodes produce chunks without docstring                                 |
| extractNames_returns_symbols                 | Exported def/class produce ExportedSymbol[]                                 |
| invalid_python_returns_empty                 | Malformed source returns [] and does not throw                              |

## Acceptance Criteria

- [ ] PythonProvider implements LanguageProvider for .py
- [ ] tree-sitter and tree-sitter-python only imported in python-provider.ts
- [ ] parseImports and L1/L2/L3 use AST walk; never throw
- [ ] Registered before GenericImportProvider
- [ ] `pnpm lint` — zero errors, zero warnings
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm knip` — no new unused files, exports, or dependencies

## Blocked?

If during execution you encounter something unexpected: stop, append a `## Blocked` section with what you tried and what decision you need, and report to the user.

---

## Post-completion: Node 24 / tree-sitter native build

**What happened:** The implementation uses native `tree-sitter` and `tree-sitter-python` (node-gyp). On **Node 24** the native build fails (C++ compilation errors against V8/cppgc headers). Adding these packages to `onlyBuiltDependencies` would make `pnpm install` fail on Node 24, so that was reverted.

**Current workaround:** Tests that depend on loading the server or PythonProvider skip when tree-sitter fails to load: `python-provider.test.ts` uses a top-level dynamic check and `describe.skipIf(!treeSitterAvailable)`; `mcp/src/__tests__/server.test.ts` dynamically imports the server and uses `describe.skipIf(!serverAvailable)`. So on Node 24 the suite passes but those tests are skipped; on Node 20 (where tree-sitter builds) they run.

**When redoing this task:** Fix the above with no tradeoff so that install works on Node 24, PythonProvider and server tests always run, and there are no conditional skips. Choose one approach:

1. **WASM-based tree-sitter (recommended):** Replace native `tree-sitter` / `tree-sitter-python` with a WASM-based parser (e.g. `web-tree-sitter` or equivalent with a Python grammar WASM). No native build; works on Node 20 and 24. Rewrite `python-provider.ts` to use the WASM API (likely async init, then same parse → rootNode → walk pattern). Remove the skip logic from `python-provider.test.ts` and `server.test.ts`; remove tree-sitter from ESLint restricted-imports or update to the new package(s).

2. **Node 20 constraint:** Set `engines` in root `package.json` to `"node": ">=20.0.0 <24.0.0"`, add `.nvmrc` with `20`, run CI on Node 20, add `tree-sitter` and `tree-sitter-python` to `onlyBuiltDependencies`. Remove the skip logic. Full support is then Node 20 only; Node 24 remains unsupported.

**Resolved:** Option 1 (WASM) was implemented. `web-tree-sitter` replaced native `tree-sitter`. `PythonProvider` uses an `async create()` factory for WASM init. Skip guards removed from `python-provider.test.ts` and `server.test.ts`.

## Post-completion: Conditional dependency loading refactor

PythonProvider is no longer created inside `createPipelineDeps`. Instead, `createPipelineDeps` accepts `additionalProviders?: readonly LanguageProvider[]`. The composition roots (`mcp/src/server.ts` `main()` and `cli/src/main.ts` action handlers) scan the project for `.py` files; if none exist, PythonProvider is never created and the WASM grammar is never loaded. `createPipelineDeps`, `createFullPipelineDeps`, and `createMcpServer` are sync. All future language providers follow this same pattern via `initLanguageProviders()`.
