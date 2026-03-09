// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { CompilationRequest } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { CompilationMeta } from "@jatbas/aic-core/core/types/compilation-types.js";
import type { UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";

export interface CompilationRunner {
  run(request: CompilationRequest): Promise<{
    compiledPrompt: string;
    meta: CompilationMeta;
    compilationId: UUIDv7;
  }>;
}
