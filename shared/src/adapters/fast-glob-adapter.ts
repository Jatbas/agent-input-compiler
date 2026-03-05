import type { GlobProvider } from "#core/interfaces/glob-provider.interface.js";
import type { AbsolutePath, RelativePath } from "#core/types/paths.js";
import { toRelativePath } from "#core/types/paths.js";
import type { PathWithStat } from "#core/types/path-with-stat.js";
import { toBytes } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import fg from "fast-glob";
import path from "node:path";

export class FastGlobAdapter implements GlobProvider {
  constructor() {}

  find(patterns: readonly string[], cwd: AbsolutePath): readonly RelativePath[] {
    if (patterns.length === 0) {
      return [];
    }
    const cwdStr = cwd;
    const raw = fg.sync([...patterns], { cwd: cwdStr });
    const relative = raw.map((p) => {
      const abs = path.isAbsolute(p) ? p : path.resolve(cwdStr, p);
      return toRelativePath(path.relative(cwdStr, abs));
    });
    return relative as readonly RelativePath[];
  }

  findWithStats(patterns: readonly string[], cwd: AbsolutePath): readonly PathWithStat[] {
    if (patterns.length === 0) {
      return [];
    }
    const cwdStr = cwd;
    const raw = fg.sync([...patterns], { cwd: cwdStr, stats: true });
    const withStats = raw.filter(
      (entry): entry is typeof entry & { stats: NonNullable<typeof entry.stats> } =>
        entry.stats !== undefined,
    );
    return withStats.map((entry) => {
      const abs = path.isAbsolute(entry.path)
        ? entry.path
        : path.resolve(cwdStr, entry.path);
      const relPath = toRelativePath(path.relative(cwdStr, abs));
      return {
        path: relPath,
        sizeBytes: toBytes(entry.stats.size),
        lastModified: toISOTimestamp(entry.stats.mtime.toISOString()),
      } satisfies PathWithStat;
    });
  }
}
