import type { Clock } from "#core/interfaces/clock.interface.js";
import { toISOTimestamp } from "#core/types/identifiers.js";

export class SystemClock implements Clock {
  now(): ReturnType<typeof toISOTimestamp> {
    return toISOTimestamp(new Date().toISOString());
  }
}
