import type { TelemetryEvent } from "#core/types/telemetry-types.js";

export interface TelemetryStore {
  write(event: TelemetryEvent): void;
}
