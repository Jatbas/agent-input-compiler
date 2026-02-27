import type { ResolvedConfig } from "#core/types/resolved-config.js";

export interface LoadConfigResult {
  readonly config: ResolvedConfig;
  readonly rawJson?: string;
}
