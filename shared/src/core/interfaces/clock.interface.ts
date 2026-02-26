import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { Milliseconds } from "#core/types/units.js";

export interface Clock {
  now(): ISOTimestamp;
  addMinutes(minutes: number): ISOTimestamp;
  durationMs(start: ISOTimestamp, end: ISOTimestamp): Milliseconds;
}
