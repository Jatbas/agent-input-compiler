import type { RelativePath } from "#core/types/paths.js";

export interface FileContentReader {
  getContent(path: RelativePath): Promise<string>;
}
