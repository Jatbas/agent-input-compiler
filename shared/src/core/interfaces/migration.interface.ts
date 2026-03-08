// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ExecutableDb } from "./executable-db.interface.js";

export interface Migration {
  readonly id: string;
  up(db: ExecutableDb): void;
  down(db: ExecutableDb): void;
}
