import type { StatusAggregates } from "#core/types/status-types.js";

export interface StatusStore {
  getSummary(): StatusAggregates;
}
