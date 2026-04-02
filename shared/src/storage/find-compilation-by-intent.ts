// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";

export function hasCompilationWithExactIntent(
  db: ExecutableDb,
  intent: string,
  notBefore: ISOTimestamp,
): boolean {
  const row = db
    .prepare("SELECT 1 FROM compilation_log WHERE intent = ? AND created_at >= ? LIMIT 1")
    .get(intent, notBefore) as { 1: number } | undefined;
  return row !== undefined;
}
