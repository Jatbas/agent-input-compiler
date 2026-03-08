// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { FileExtension, RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-shared/core/types/enums.js";

export interface ContentTransformer {
  readonly id: string;
  readonly fileExtensions: readonly FileExtension[];
  transform(content: string, tier: InclusionTier, filePath: RelativePath): string;
}
