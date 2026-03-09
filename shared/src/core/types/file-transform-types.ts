// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

export interface CachedFileTransform {
  readonly filePath: RelativePath;
  readonly contentHash: string;
  readonly transformedContent: string;
  readonly tierOutputs: Readonly<
    Record<InclusionTier, { content: string; tokens: TokenCount }>
  >;
  readonly createdAt: ISOTimestamp;
  readonly expiresAt: ISOTimestamp;
}
