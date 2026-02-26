import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ignore from "ignore";

export class IgnoreAdapter implements IgnoreProvider {
  constructor() {}

  accepts(relativePath: RelativePath, root: AbsolutePath): boolean {
    const rootStr = root as string;
    const gitignorePath = path.join(rootStr, ".gitignore");
    const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
    const ig = ignore().add(content);
    return !ig.ignores(relativePath as string);
  }
}
