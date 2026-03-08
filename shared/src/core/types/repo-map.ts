// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath, RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { Bytes, TokenCount } from "@jatbas/aic-shared/core/types/units.js";
import type { ISOTimestamp } from "@jatbas/aic-shared/core/types/identifiers.js";

export interface FileEntry {
  readonly path: RelativePath;
  readonly language: string;
  readonly sizeBytes: Bytes;
  readonly estimatedTokens: TokenCount;
  readonly lastModified: ISOTimestamp;
}

export interface RepoMap {
  readonly root: AbsolutePath;
  readonly files: readonly FileEntry[];
  readonly totalFiles: number;
  readonly totalTokens: TokenCount;
}
