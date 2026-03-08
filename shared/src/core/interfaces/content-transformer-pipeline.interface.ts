// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SelectedFile } from "@jatbas/aic-shared/core/types/selected-file.js";
import type {
  TransformContext,
  TransformResult,
} from "@jatbas/aic-shared/core/types/transform-types.js";

export interface ContentTransformerPipeline {
  transform(
    files: readonly SelectedFile[],
    context: TransformContext,
  ): Promise<TransformResult>;
}
