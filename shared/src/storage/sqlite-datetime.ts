// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ISOTimestamp } from "@jatbas/aic-shared/core/types/identifiers.js";
import { toISOTimestamp } from "@jatbas/aic-shared/core/types/identifiers.js";

const SQLITE_DATETIME_LEN = 19;

export function isoToSqliteDatetime(iso: string): string {
  const prefix = iso.slice(0, SQLITE_DATETIME_LEN);
  return prefix.includes("T") ? prefix.replace("T", " ") : prefix;
}

export function sqliteDatetimeToIso(sqlite: string): ISOTimestamp {
  if (sqlite.includes("T")) return sqlite as ISOTimestamp;
  return toISOTimestamp(sqlite.slice(0, 10) + "T" + sqlite.slice(11, 19) + ".000Z");
}
