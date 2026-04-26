// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { joinUnderProjectAic } from "@jatbas/aic-core/storage/ensure-aic-dir.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import { isValidTimestamp } from "./cache-field-validators.js";

const RETENTION_MINUTES = 24 * 60;

function parseTimestamp(line: string): string | null {
  try {
    const obj = JSON.parse(line) as { timestamp?: string };
    if (typeof obj.timestamp !== "string") return null;
    if (!isValidTimestamp(obj.timestamp)) return null;
    return obj.timestamp;
  } catch {
    return null;
  }
}

export function pruneJsonlByTimestamp(
  projectRoot: AbsolutePath,
  clock: Clock,
  logFileName: string,
): void {
  const logPath = joinUnderProjectAic(projectRoot, logFileName);
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
