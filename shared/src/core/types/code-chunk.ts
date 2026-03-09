// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { TokenCount, LineNumber } from "@jatbas/aic-core/core/types/units.js";
import type { SymbolType } from "@jatbas/aic-core/core/types/enums.js";

export interface CodeChunk {
  readonly filePath: RelativePath;
  readonly symbolName: string;
  readonly symbolType: SymbolType;
  readonly startLine: LineNumber;
  readonly endLine: LineNumber;
  readonly content: string;
  readonly tokenCount: TokenCount;
}
