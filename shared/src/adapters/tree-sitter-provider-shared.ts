// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Re-exports used by tree-sitter language providers (go, rust, etc.) to avoid clone detection.
export {
  defineTreeSitterProvider,
  resolveTreeSitterWasm,
} from "./tree-sitter-provider-factory.js";
export { toFileExtension } from "@jatbas/aic-shared/core/types/paths.js";
export type { FileExtension } from "@jatbas/aic-shared/core/types/paths.js";
export type { ImportRef } from "@jatbas/aic-shared/core/types/import-ref.js";
export type { CodeChunk } from "@jatbas/aic-shared/core/types/code-chunk.js";
export type { ExportedSymbol } from "@jatbas/aic-shared/core/types/exported-symbol.js";
export { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-shared/core/types/enums.js";
export type { SymbolKind, SymbolType } from "@jatbas/aic-shared/core/types/enums.js";
