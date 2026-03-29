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

interface ProjectIdRow {
  readonly project_id: string;
}

export function reconcileProjectId(
  projectRoot: AbsolutePath,
  db: ExecutableDb,
  clock: Clock,
  idGenerator: IdGenerator,
  normaliser: ProjectRootNormaliser,
): ProjectId {
  const filePath = path.join(projectRoot, ".aic", PROJECT_ID_FILENAME);
  const normalisedRoot = normaliser.normalise(projectRoot);
  const now = clock.now();
  const rootRows = db
    .prepare("SELECT project_id FROM projects WHERE project_root = ? LIMIT 1")
    .all(normalisedRoot) as readonly ProjectIdRow[];
  const rootRow = rootRows[0];
  if (rootRow !== undefined) {
    const canonicalId = rootRow.project_id;
    ensureAicDir(projectRoot);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, canonicalId, "utf8");
    } else {
      const current = fs.readFileSync(filePath, "utf8").trim();
      if (current !== canonicalId) {
        fs.writeFileSync(filePath, canonicalId, "utf8");
      }
    }
    db.prepare("UPDATE projects SET last_seen_at = ? WHERE project_id = ?").run(
      now,
      canonicalId,
    );
    return toProjectId(canonicalId);
  }
  if (!fs.existsSync(filePath)) {
    ensureAicDir(projectRoot);
    const projectId = idGenerator.generate();
    fs.writeFileSync(filePath, projectId, "utf8");
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
  if (row === undefined) {
    const rootRowsRecheck = db
      .prepare("SELECT project_id FROM projects WHERE project_root = ? LIMIT 1")
      .all(normalisedRoot) as readonly ProjectIdRow[];
    const rootRowRecheck = rootRowsRecheck[0];
    if (rootRowRecheck !== undefined) {
      const canonicalId = rootRowRecheck.project_id;
      ensureAicDir(projectRoot);
      fs.writeFileSync(filePath, canonicalId, "utf8");
      db.prepare("UPDATE projects SET last_seen_at = ? WHERE project_id = ?").run(
        now,
        canonicalId,
      );
      return toProjectId(canonicalId);
    }
    db.prepare(
      "INSERT INTO projects (project_id, project_root, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
    ).run(projectId, normalisedRoot, now, now);
    return toProjectId(projectId);
  }
  if (row.project_root === normalisedRoot) {
    db.prepare("UPDATE projects SET last_seen_at = ? WHERE project_id = ?").run(
      now,
      projectId,
    );
    return toProjectId(projectId);
  }
  db.prepare(
    "UPDATE projects SET project_root = ?, last_seen_at = ? WHERE project_id = ?",
  ).run(normalisedRoot, now, projectId);
  return toProjectId(projectId);
}
