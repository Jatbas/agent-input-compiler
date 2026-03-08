// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { CachedFileTransform } from "@jatbas/aic-shared/core/types/file-transform-types.js";

export interface FileTransformStore {
  get(filePath: RelativePath, contentHash: string): CachedFileTransform | null;
  set(entry: CachedFileTransform): void;
  invalidate(filePath: RelativePath): void;
  purgeExpired(): void;
}
