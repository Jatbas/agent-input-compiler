import type { SelectedFile } from "#core/types/selected-file.js";
import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";

export interface TransformContext {
  readonly directTargetPaths: readonly RelativePath[];
  readonly rawMode: boolean;
}

export interface TransformResult {
  readonly files: readonly SelectedFile[];
  readonly metadata: readonly TransformMetadata[];
}

export interface TransformMetadata {
  readonly filePath: RelativePath;
  readonly originalTokens: TokenCount;
  readonly transformedTokens: TokenCount;
  readonly transformersApplied: readonly string[];
}
