// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { TelemetryEvent } from "#core/types/telemetry-types.js";

export interface TelemetryStore {
  write(event: TelemetryEvent): void;
}
