import type { InspectRequest } from "#core/types/inspect-types.js";
import type { PipelineTrace } from "#core/types/inspect-types.js";

export interface InspectRunner {
  inspect(request: InspectRequest): Promise<PipelineTrace>;
}
