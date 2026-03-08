// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-shared/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-shared/core/types/enums.js";
import { toFileExtension } from "@jatbas/aic-shared/core/types/paths.js";

const JSON_EXTENSIONS: readonly FileExtension[] = [toFileExtension(".json")];

export class JsonCompactor implements ContentTransformer {
  readonly id = "json-compactor";
  readonly fileExtensions = JSON_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    const trimmed = content.trim();
    if (trimmed.length === 0) return content;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return JSON.stringify(parsed);
    } catch {
      return content;
    }
  }
}
