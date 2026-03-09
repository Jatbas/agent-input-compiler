// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";

export function hasColumn(db: ExecutableDb, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as readonly {
    readonly name: string;
  }[];
  return cols.some((c) => c.name === column);
}

export function safeAddColumn(
  db: ExecutableDb,
  table: string,
  column: string,
  def: string,
): void {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}
