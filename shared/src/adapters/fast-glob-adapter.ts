import type { GlobProvider } from "#core/interfaces/glob-provider.interface.js";
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";
import { toRelativePath } from "#core/types/paths.js";
import fg from "fast-glob";
import path from "node:path";

export class FastGlobAdapter implements GlobProvider {
  constructor() {}

  find(patterns: readonly string[], cwd: AbsolutePath): readonly RelativePath[] {
    if (patterns.length === 0) {
      return [];
    }
    const cwdStr = cwd as string;
    const raw = fg.sync([...patterns], { cwd: cwdStr });
    const relative = raw.map((p) => {
      const abs = path.isAbsolute(p) ? p : path.resolve(cwdStr, p);
      return toRelativePath(path.relative(cwdStr, abs));
    });
    return relative as readonly RelativePath[];
  }
}
