// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { FileExtension, RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { ImportRef } from "@jatbas/aic-shared/core/types/import-ref.js";
import type { CodeChunk } from "@jatbas/aic-shared/core/types/code-chunk.js";
import type { ExportedSymbol } from "@jatbas/aic-shared/core/types/exported-symbol.js";

export interface LanguageProvider {
  readonly id: string;
  readonly extensions: readonly FileExtension[];
  parseImports(fileContent: string, filePath: RelativePath): readonly ImportRef[];
  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[];
  extractSignaturesOnly(fileContent: string): readonly CodeChunk[];
  extractNames(fileContent: string): readonly ExportedSymbol[];
}
