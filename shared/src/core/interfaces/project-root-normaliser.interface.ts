// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

export interface ProjectRootNormaliser {
  normalise(raw: string): AbsolutePath;
}
