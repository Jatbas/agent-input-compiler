import type { CompilationRequest } from "#core/types/compilation-types.js";
import type { CompilationMeta } from "#core/types/compilation-types.js";

export interface CompilationRunner {
  run(request: CompilationRequest): Promise<{
    compiledPrompt: string;
    meta: CompilationMeta;
  }>;
}
