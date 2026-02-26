import type { Clock } from "#core/interfaces/clock.interface.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { Milliseconds } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { toMilliseconds } from "#core/types/units.js";

export class SystemClock implements Clock {
  now(): ISOTimestamp {
    return toISOTimestamp(new Date().toISOString());
  }

  addMinutes(minutes: number): ISOTimestamp {
    const d = new Date();
    d.setMinutes(d.getMinutes() + minutes);
    return toISOTimestamp(d.toISOString());
  }

  durationMs(start: ISOTimestamp, end: ISOTimestamp): Milliseconds {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    return toMilliseconds(endMs - startMs);
  }
}
