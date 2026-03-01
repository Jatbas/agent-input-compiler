// Re-exports for regex/simple language providers to avoid clone detection.
export {
  EMPTY_RELATIVE_PATH,
  toFileExtension,
  toRelativePath,
} from "#core/types/paths.js";
export type { FileExtension, RelativePath } from "#core/types/paths.js";
export type { ImportRef } from "#core/types/import-ref.js";
export type { CodeChunk } from "#core/types/code-chunk.js";
export type { ExportedSymbol } from "#core/types/exported-symbol.js";
export { toLineNumber, toTokenCount } from "#core/types/units.js";
export { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";
export type { SymbolKind, SymbolType } from "#core/types/enums.js";
