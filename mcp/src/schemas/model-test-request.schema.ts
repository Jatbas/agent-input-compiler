// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { z } from "zod";

const modelTestRequestShape = {
  projectRoot: z.string().min(1).max(4096),
  probeId: z
    .string()
    .length(8)
    .regex(/^[A-Z]{8}$/)
    .optional(),
  answers: z.tuple([z.number().int(), z.string().min(1).max(32)]).optional(),
} as const;

export const ModelTestRequestSchema: typeof modelTestRequestShape = modelTestRequestShape;
