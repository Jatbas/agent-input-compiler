// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath, RelativePath } from "@jatbas/aic-core/core/types/paths.js";

export interface IgnoreProvider {
  accepts(relativePath: RelativePath, root: AbsolutePath): boolean;
}
