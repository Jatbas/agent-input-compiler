// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { StatusRequest } from "@jatbas/aic-shared/core/types/status-types.js";
import type { StatusAggregates } from "@jatbas/aic-shared/core/types/status-types.js";

export interface StatusRunner {
  status(request: StatusRequest): Promise<StatusAggregates>;
}
