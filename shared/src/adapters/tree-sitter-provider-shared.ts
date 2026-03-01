// Re-exports used by tree-sitter language providers (go, rust, etc.) to avoid clone detection.
export {
  defineTreeSitterProvider,
  resolveTreeSitterWasm,
} from "./tree-sitter-provider-factory.js";
export { toFileExtension } from "#core/types/paths.js";
export type { FileExtension } from "#core/types/paths.js";
export type { ImportRef } from "#core/types/import-ref.js";
export type { CodeChunk } from "#core/types/code-chunk.js";
export type { ExportedSymbol } from "#core/types/exported-symbol.js";
export { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";
export type { SymbolKind, SymbolType } from "#core/types/enums.js";
