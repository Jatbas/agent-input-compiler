// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { z } from "zod";
import { STATUS_TIME_RANGE_DAYS_MAX } from "@jatbas/aic-core/core/types/status-types.js";

const statusRequestShape = {
  timeRangeDays: z.number().int().min(1).max(STATUS_TIME_RANGE_DAYS_MAX).optional(),
} as const;

export const StatusRequestSchema: typeof statusRequestShape = statusRequestShape;
