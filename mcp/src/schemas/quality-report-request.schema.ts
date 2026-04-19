// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { z } from "zod";

const qualityReportRequestShape = {
  windowDays: z.number().int().min(1).max(365).optional(),
} as const;

export const QualityReportRequestSchema: typeof qualityReportRequestShape =
  qualityReportRequestShape;

export function toQualityReportWindowDays(raw: number): number {
  const n = Math.trunc(raw);
  return Math.min(365, Math.max(1, n));
}
