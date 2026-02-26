import type { StatusRequest } from "#core/types/status-types.js";
import type { StatusAggregates } from "#core/types/status-types.js";

export interface StatusRunner {
  status(request: StatusRequest): Promise<StatusAggregates>;
}
