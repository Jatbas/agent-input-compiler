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
  if (path.endsWith(".d.ts")) return ".d.ts";
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx) : "";
}

function matchesExtension(ext: string, pattern: FileExtension): boolean {
  return pattern.toLowerCase() === ext.toLowerCase();
}

function getApplicableTransformers(
  formatSpecific: readonly ContentTransformer[],
  nonFormatSpecific: readonly ContentTransformer[],
  ext: string,
  isDirect: boolean,
): readonly ContentTransformer[] {
  const format = isDirect
    ? []
    : [
        formatSpecific.find((t) =>
          t.fileExtensions.some((e) => matchesExtension(ext, e)),
        ),
      ].filter((t): t is ContentTransformer => t !== undefined);
  const nonFormat = nonFormatSpecific.filter(
    (t) =>
      t.fileExtensions.length === 0 ||
      t.fileExtensions.some((e) => matchesExtension(ext, e)),
  );
  return [...format, ...nonFormat];
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

    const directSet = new Set(context.directTargetPaths.map((p) => p));

    const result = files.map((file): { file: SelectedFile; meta: TransformMetadata } => {
      const rawContent = this.fileContentReader.getContent(file.path);
      const originalTokens = this.tokenCounter(rawContent);
      const applicable = context.rawMode
        ? []
        : getApplicableTransformers(
            formatSpecific,
            nonFormatSpecific,
            getExtension(file.path),
            directSet.has(file.path),
          );
      const { content, applied } = applicable.reduce<{
        readonly content: string;
        readonly applied: readonly string[];
      }>(
        (acc, t) => ({
          content: t.transform(acc.content, file.tier, file.path),
          applied: [...acc.applied, t.id],
        }),
        { content: rawContent, applied: [] },
      );

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
