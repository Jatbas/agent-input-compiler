// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import { ensureAicDir } from "@jatbas/aic-core/storage/ensure-aic-dir.js";
import { toProjectId, type ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { ProjectRootNormaliser } from "@jatbas/aic-core/core/interfaces/project-root-normaliser.interface.js";

export const PROJECT_ID_FILENAME = "project-id";

interface ProjectRow {
  readonly project_root: string;
}

export function reconcileProjectId(
  projectRoot: AbsolutePath,
  db: ExecutableDb,
  clock: Clock,
  idGenerator: IdGenerator,
  normaliser: ProjectRootNormaliser,
): ProjectId {
  const filePath = path.join(projectRoot, ".aic", PROJECT_ID_FILENAME);
  if (!fs.existsSync(filePath)) {
    ensureAicDir(projectRoot);
    const projectId = idGenerator.generate();
    fs.writeFileSync(filePath, projectId, "utf8");
    const now = clock.now();
    const normalisedRoot = normaliser.normalise(projectRoot);
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectId, normalisedRoot, now, now);
    return toProjectId(projectId);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const projectId = raw.trim();
  const rows = db
    .prepare("SELECT project_root FROM projects WHERE project_id = ?")
    .all(projectId) as readonly ProjectRow[];
  const row = rows[0];
  const normalisedRoot = normaliser.normalise(projectRoot);
  if (row === undefined) {
    const now = clock.now();
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectId, normalisedRoot, now, now);
    return toProjectId(projectId);
  }
  if (row.project_root === normalisedRoot) {
    db.prepare("UPDATE projects SET last_seen_at = ? WHERE project_id = ?").run(
      clock.now(),
      projectId,
    );
    return toProjectId(projectId);
  }
  db.prepare(
    "UPDATE projects SET project_root = ?, last_seen_at = ? WHERE project_id = ?",
  ).run(normalisedRoot, clock.now(), projectId);
  return toProjectId(projectId);
}
