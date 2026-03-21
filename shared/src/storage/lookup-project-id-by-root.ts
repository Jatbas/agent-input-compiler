// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import { toProjectId } from "@jatbas/aic-core/core/types/identifiers.js";

export function lookupProjectIdByNormalisedRoot(
  db: ExecutableDb,
  normalisedRoot: string,
): ProjectId | null {
  const rows = db
    .prepare("SELECT project_id FROM projects WHERE project_root = ? LIMIT 1")
    .all(normalisedRoot) as { readonly project_id: string }[];
  const row = rows[0];
  return row?.project_id !== undefined ? toProjectId(row.project_id) : null;
}
