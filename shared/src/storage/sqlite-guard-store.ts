// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { GuardStore } from "@jatbas/aic-core/core/interfaces/guard-store.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { GuardFinding } from "@jatbas/aic-core/core/types/guard-types.js";
import type { UUIDv7 } from "@jatbas/aic-core/core/types/identifiers.js";
import { toLineNumber } from "@jatbas/aic-core/core/types/units.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";

export class SqliteGuardStore implements GuardStore {
  constructor(
    private readonly projectRoot: AbsolutePath,
    private readonly db: ExecutableDb,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  write(compilationId: UUIDv7, findings: readonly GuardFinding[]): void {
    this.db
      .prepare("DELETE FROM guard_findings WHERE compilation_id = ?")
      .run(compilationId);
    const insert = this.db.prepare(
      `INSERT INTO guard_findings (id, compilation_id, type, severity, file, line, message, pattern, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const created_at = this.clock.now();
    for (const f of findings) {
      insert.run(
        this.idGenerator.generate(),
        compilationId,
        f.type,
        f.severity,
        f.file,
        f.line ?? null,
        f.message,
        f.pattern ?? null,
        created_at,
      );
    }
  }

  queryByCompilation(compilationId: UUIDv7): readonly GuardFinding[] {
    const rows = this.db
      .prepare(
        "SELECT type, severity, file, line, message, pattern FROM guard_findings WHERE compilation_id = ? ORDER BY created_at",
      )
      .all(compilationId) as readonly {
      type: string;
      severity: string;
      file: string;
      line: number | null;
      message: string;
      pattern: string | null;
    }[];
    return rows.map(
      (row): GuardFinding => ({
        type: row.type as GuardFinding["type"],
        severity: row.severity as GuardFinding["severity"],
        file: toRelativePath(row.file),
        ...(row.line !== null ? { line: toLineNumber(row.line) } : {}),
        message: row.message,
        ...(row.pattern !== null ? { pattern: row.pattern } : {}),
      }),
    );
  }
}
