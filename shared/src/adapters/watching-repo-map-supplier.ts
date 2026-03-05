import * as fs from "node:fs";
import * as path from "node:path";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { Closeable } from "#core/interfaces/closeable.interface.js";
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap, FileEntry } from "#core/types/repo-map.js";
import { toRelativePath } from "#core/types/paths.js";
import { toBytes } from "#core/types/units.js";
import { toTokenCount } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { buildFileEntry } from "./file-entry-utils.js";

type WatchFn = (
  path: string,
  options: { recursive: boolean },
  listener: (eventType: string, filename: string | null) => void,
) => fs.FSWatcher;

interface CacheEntry {
  readonly repoMap: RepoMap;
  readonly watcher: fs.FSWatcher;
}

export class WatchingRepoMapSupplier implements RepoMapSupplier, Closeable {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastErrors = new Map<string, string>();

  constructor(
    private readonly inner: RepoMapSupplier,
    private readonly ignoreProvider: IgnoreProvider,
    private readonly watchFn: WatchFn = fs.watch,
    private readonly statFn: (path: string) => fs.Stats = fs.statSync,
  ) {}

  async getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap> {
    const cached = this.cache.get(projectRoot);
    if (cached) return Promise.resolve(cached.repoMap);

    const repoMap = await this.inner.getRepoMap(projectRoot);
    try {
      const watcher = this.watchFn(
        projectRoot,
        { recursive: true },
        (eventType: string, filename: string | null) =>
          this.handleWatchEvent(projectRoot, filename),
      );
      watcher.on("error", (err: Error) => this.handleWatchError(projectRoot, err));
      this.cache.set(projectRoot, { repoMap, watcher });
      this.lastErrors.delete(projectRoot);
      return repoMap;
    } catch (err) {
      this.lastErrors.set(projectRoot, (err as Error).message);
      return repoMap;
    }
  }

  close(): void {
    for (const entry of this.cache.values()) {
      entry.watcher.close();
    }
    this.cache.clear();
  }

  private rebuildRepoMap(
    projectRoot: AbsolutePath,
    files: readonly FileEntry[],
  ): RepoMap {
    const totalTokensRaw = files.reduce((sum, e) => sum + e.estimatedTokens, 0);
    return {
      root: projectRoot,
      files,
      totalFiles: files.length,
      totalTokens: toTokenCount(totalTokensRaw),
    };
  }

  private invalidateCache(projectRoot: string): void {
    const entry = this.cache.get(projectRoot);
    if (entry) {
      entry.watcher.close();
      this.cache.delete(projectRoot);
    }
  }

  private updateCacheEntry(
    projectRoot: AbsolutePath,
    updatedFiles: readonly FileEntry[],
  ): void {
    const existing = this.cache.get(projectRoot);
    if (!existing) return;
    const newRepoMap = this.rebuildRepoMap(projectRoot, updatedFiles);
    this.cache.set(projectRoot, { repoMap: newRepoMap, watcher: existing.watcher });
  }

  private filesWithoutNormalizedPath(
    files: readonly FileEntry[],
    projectRoot: string,
    normalizedFullPath: string,
  ): readonly FileEntry[] {
    return files.filter(
      (f) => path.normalize(path.join(projectRoot, f.path)) !== normalizedFullPath,
    );
  }

  private handleWatchEvent(projectRoot: AbsolutePath, filename: string | null): void {
    if (filename === null) {
      this.invalidateCache(projectRoot);
      return;
    }
    const fullPath = path.join(projectRoot, filename);
    const normalizedFull = path.normalize(fullPath);
    try {
      const stat = this.statFn(fullPath);
      if (!stat.isFile()) return;
      const relativePath = toRelativePath(filename);
      if (!this.ignoreProvider.accepts(relativePath, projectRoot)) {
        const cached = this.cache.get(projectRoot)?.repoMap.files ?? [];
        this.updateCacheEntry(
          projectRoot,
          this.filesWithoutNormalizedPath(cached, projectRoot, normalizedFull),
        );
        return;
      }
      const entry = buildFileEntry(
        relativePath,
        toBytes(stat.size),
        toISOTimestamp(stat.mtime.toISOString()),
      );
      if (entry === null) {
        const cached = this.cache.get(projectRoot)?.repoMap.files ?? [];
        this.updateCacheEntry(
          projectRoot,
          this.filesWithoutNormalizedPath(cached, projectRoot, normalizedFull),
        );
        return;
      }
      const existing = this.cache.get(projectRoot);
      if (!existing) return;
      const withoutPath = this.filesWithoutNormalizedPath(
        existing.repoMap.files,
        projectRoot,
        normalizedFull,
      );
      this.updateCacheEntry(projectRoot, [...withoutPath, entry]);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        const existing = this.cache.get(projectRoot);
        if (existing) {
          const updatedFiles = this.filesWithoutNormalizedPath(
            existing.repoMap.files,
            projectRoot,
            normalizedFull,
          );
          this.updateCacheEntry(projectRoot, updatedFiles);
        }
        return;
      }
      this.invalidateCache(projectRoot);
    }
  }

  private handleWatchError(projectRoot: AbsolutePath, err: Error): void {
    this.lastErrors.set(projectRoot, err.message);
    this.invalidateCache(projectRoot);
  }
}
