// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";

const RETENTION_MINUTES = 24 * 60;

function parseTimestamp(line: string): string | null {
  try {
    const obj = JSON.parse(line) as { timestamp?: string };
    return typeof obj.timestamp === "string" ? obj.timestamp : null;
  } catch {
    return null;
  }
}

export function pruneJsonlByTimestamp(
  projectRoot: AbsolutePath,
  clock: Clock,
  logFileName: string,
): void {
  const logPath = path.join(projectRoot, ".aic", logFileName);
  try {
    if (!fs.existsSync(logPath)) return;
    const cutoff = clock.addMinutes(-RETENTION_MINUTES);
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.split("\n").filter((s) => s.trim().length > 0);
    const kept = lines.filter((line) => {
      const ts = parseTimestamp(line);
      return ts !== null && ts >= cutoff;
    });
    if (kept.length < lines.length) {
      fs.writeFileSync(logPath, kept.length > 0 ? kept.join("\n") + "\n" : "", "utf8");
    }
  } catch {
    // Non-fatal; do not throw
  }
}
