import type { AbsolutePath } from "#core/types/paths.js";
import type { RelativePath } from "#core/types/paths.js";

export interface GlobProvider {
  find(patterns: readonly string[], cwd: AbsolutePath): readonly RelativePath[];
}
