// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";

export interface TransformContext {
  readonly directTargetPaths: readonly RelativePath[];
  readonly rawMode: boolean;
}

export interface TransformResult {
  readonly files: readonly SelectedFile[];
  readonly metadata: readonly TransformMetadata[];
}

export interface TransformMetadata {
  readonly filePath: RelativePath;
  readonly originalTokens: TokenCount;
  readonly transformedTokens: TokenCount;
  readonly transformersApplied: readonly string[];
}
