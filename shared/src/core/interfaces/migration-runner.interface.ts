// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "./executable-db.interface.js";
import type { Migration } from "./migration.interface.js";

export interface MigrationRunner {
  run(db: ExecutableDb, migrations: ReadonlyArray<Migration>): void;
}
