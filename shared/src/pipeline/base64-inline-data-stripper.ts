// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-shared/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-shared/core/types/enums.js";

const DATA_URL_BASE64_RE = /data:[^;]+;base64,[A-Za-z0-9+/=]+/g;
const PLACEHOLDER = "[base64 inline data stripped]";

export class Base64InlineDataStripper implements ContentTransformer {
  readonly id = "base64-inline-data-stripper";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    return content.replace(DATA_URL_BASE64_RE, PLACEHOLDER);
  }
}
