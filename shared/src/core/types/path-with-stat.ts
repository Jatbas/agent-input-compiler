import type { RelativePath } from "#core/types/paths.js";
import type { Bytes } from "#core/types/units.js";
import type { ISOTimestamp } from "#core/types/identifiers.js";

export interface PathWithStat {
  readonly path: RelativePath;
  readonly sizeBytes: Bytes;
  readonly lastModified: ISOTimestamp;
}
