// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";
import { deduplicateImportsInText } from "./import-merge-dedup-text.js";

export class ImportDeduplicator implements ContentTransformer {
  readonly id = "import-deduplicator";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    return deduplicateImportsInText(content);
  }
}
