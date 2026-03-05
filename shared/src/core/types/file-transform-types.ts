import type { RelativePath } from "#core/types/paths.js";
import type { TokenCount } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";
import type { InclusionTier } from "#core/types/enums.js";

export interface CachedFileTransform {
  readonly filePath: RelativePath;
  readonly contentHash: string;
  readonly transformedContent: string;
  readonly tierOutputs: Readonly<
    Record<InclusionTier, { content: string; tokens: TokenCount }>
  >;
  readonly createdAt: ISOTimestamp;
  readonly expiresAt: ISOTimestamp;
}
