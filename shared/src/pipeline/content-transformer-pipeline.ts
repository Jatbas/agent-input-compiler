import type { ContentTransformerPipeline as IContentTransformerPipeline } from "#core/interfaces/content-transformer-pipeline.interface.js";
import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type {
  TransformContext,
  TransformResult,
  TransformMetadata,
} from "#core/types/transform-types.js";
import type { TokenCount } from "#core/types/units.js";
import type { FileExtension } from "#core/types/paths.js";

function getExtension(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx) : "";
}

function matchesExtension(ext: string, pattern: FileExtension): boolean {
  return (pattern as string).toLowerCase() === ext.toLowerCase();
}

export class ContentTransformerPipeline implements IContentTransformerPipeline {
  constructor(
    private readonly transformers: readonly ContentTransformer[],
    private readonly fileContentReader: FileContentReader,
    private readonly tokenCounter: (text: string) => TokenCount,
  ) {}

  transform(files: readonly SelectedFile[], context: TransformContext): TransformResult {
    const formatSpecific = this.transformers.filter((t) => t.fileExtensions.length > 0);
    const nonFormatSpecific = this.transformers.filter(
      (t) => t.fileExtensions.length === 0,
    );

    const directSet = new Set(context.directTargetPaths.map((p) => p as string));

    const result = files.map((file): { file: SelectedFile; meta: TransformMetadata } => {
      const path = file.path as string;
      let content = this.fileContentReader.getContent(file.path);
      const originalTokens = this.tokenCounter(content);
      let applied: readonly string[] = [];

      if (!context.rawMode) {
        const ext = getExtension(path);
        const isDirect = directSet.has(path);
        if (!isDirect) {
          const formatT = formatSpecific.find((t) =>
            t.fileExtensions.some((e) => matchesExtension(ext, e)),
          );
          if (formatT !== undefined) {
            content = formatT.transform(content, file.tier, file.path);
            applied = [...applied, formatT.id];
          }
        }
        for (const t of nonFormatSpecific) {
          const applies =
            t.fileExtensions.length === 0 ||
            t.fileExtensions.some((e) => matchesExtension(ext, e));
          if (applies) {
            content = t.transform(content, file.tier, file.path);
            applied = [...applied, t.id];
          }
        }
      }

      const transformedTokens = this.tokenCounter(content);
      const updatedFile: SelectedFile = {
        ...file,
        estimatedTokens: transformedTokens,
      };
      const meta: TransformMetadata = {
        filePath: file.path,
        originalTokens,
        transformedTokens,
        transformersApplied: applied,
      };
      return { file: updatedFile, meta };
    });

    return {
      files: result.map((r) => r.file),
      metadata: result.map((r) => r.meta),
    };
  }
}
