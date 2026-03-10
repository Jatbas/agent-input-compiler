// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { pruneJsonlByTimestamp } from "./prune-jsonl-by-timestamp.js";

export function prunePromptLog(projectRoot: AbsolutePath, clock: Clock): void {
  pruneJsonlByTimestamp(projectRoot, clock, "prompt-log.jsonl");
}
