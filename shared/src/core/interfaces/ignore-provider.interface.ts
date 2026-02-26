import type { AbsolutePath, RelativePath } from "#core/types/paths.js";

export interface IgnoreProvider {
  accepts(relativePath: RelativePath, root: AbsolutePath): boolean;
}
