import type { SelectedFile } from "#core/types/selected-file.js";
import type { TransformContext, TransformResult } from "#core/types/transform-types.js";

export interface ContentTransformerPipeline {
  transform(files: readonly SelectedFile[], context: TransformContext): TransformResult;
}
