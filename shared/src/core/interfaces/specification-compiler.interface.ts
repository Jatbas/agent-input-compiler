// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type {
  SpecificationInput,
  SpecCompilationResult,
} from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";

export interface SpecificationCompiler {
  compile(input: SpecificationInput, budget: TokenCount): SpecCompilationResult;
}
