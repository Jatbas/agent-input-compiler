// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { Milliseconds } from "@jatbas/aic-core/core/types/units.js";

export interface Clock {
  now(): ISOTimestamp;
  addMinutes(minutes: number): ISOTimestamp;
  durationMs(start: ISOTimestamp, end: ISOTimestamp): Milliseconds;
}
