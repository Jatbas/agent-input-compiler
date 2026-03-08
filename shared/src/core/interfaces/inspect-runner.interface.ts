// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { InspectRequest } from "@jatbas/aic-shared/core/types/inspect-types.js";
import type { PipelineTrace } from "@jatbas/aic-shared/core/types/inspect-types.js";

export interface InspectRunner {
  inspect(request: InspectRequest): Promise<PipelineTrace>;
}
