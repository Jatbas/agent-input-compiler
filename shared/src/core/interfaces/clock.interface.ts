import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface Clock {
  now(): ISOTimestamp;
}
