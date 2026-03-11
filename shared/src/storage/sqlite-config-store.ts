// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ProjectId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { ConfigStore } from "@jatbas/aic-core/core/interfaces/config-store.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";

export class SqliteConfigStore implements ConfigStore {
  constructor(
    private readonly projectId: ProjectId,
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}

  getLatestHash(): string | null {
    const rows = this.db
      .prepare(
        "SELECT config_hash FROM config_history WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .all(this.projectId) as readonly { config_hash: string }[];
    const row = rows[0];
    return row === undefined ? null : row.config_hash;
  }

  writeSnapshot(configHash: string, configJson: string): void {
    const createdAt = this.clock.now();
    this.db
      .prepare(
        "INSERT OR REPLACE INTO config_history (config_hash, config_json, created_at, project_id) VALUES (?, ?, ?, ?)",
      )
      .run(configHash, configJson, createdAt, this.projectId);
  }
}
