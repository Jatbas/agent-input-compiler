import type { RelativePath } from "#core/types/paths.js";
import type { CachedFileTransform } from "#core/types/file-transform-types.js";

export interface FileTransformStore {
  get(filePath: RelativePath, contentHash: string): CachedFileTransform | null;
  set(entry: CachedFileTransform): void;
  invalidate(filePath: RelativePath): void;
  purgeExpired(): void;
}
