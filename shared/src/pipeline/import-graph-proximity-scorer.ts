import type { ImportProximityScorer } from "#core/interfaces/import-proximity-scorer.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { RepoMap } from "#core/types/repo-map.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RelativePath } from "#core/types/paths.js";
import type { FileEntry } from "#core/types/repo-map.js";
import { resolveImportSpec } from "#core/types/paths.js";
import { getProvider } from "./get-provider.js";
import { pathRelevance } from "./path-relevance.js";

const INDEX_EXTS = [".ts", ".js", ".tsx", ".jsx"] as const;

function findRepoPathForResolved(
  resolved: RelativePath,
  files: readonly FileEntry[],
): RelativePath | null {
  const base = resolved.trim();
  const exact = files.find((f) => f.path === base);
  if (exact !== undefined) return exact.path;
  for (const ext of INDEX_EXTS) {
    const withExt = base + ext;
    const match = files.find((f) => f.path === withExt);
    if (match !== undefined) return match.path;
  }
  for (const ext of INDEX_EXTS) {
    const indexPath = base + "/index" + ext;
    const match = files.find((f) => f.path === indexPath);
    if (match !== undefined) return match.path;
  }
  return null;
}

function depthToScore(depth: number): number {
  if (depth <= 0) return 1;
  if (depth === 1) return 0.6;
  if (depth === 2) return 0.3;
  return 0.1;
}

function buildEdges(
  repo: RepoMap,
  fileContentReader: FileContentReader,
  languageProviders: readonly LanguageProvider[],
): ReadonlyMap<RelativePath, readonly RelativePath[]> {
  const edges = new Map<RelativePath, readonly RelativePath[]>();
  const pathSet = new Set(repo.files.map((f) => f.path));
  for (const entry of repo.files) {
    const provider = getProvider(entry.path, languageProviders);
    if (provider === undefined) continue;
    try {
      const content = fileContentReader.getContent(entry.path);
      const refs = provider.parseImports(content, entry.path);
      const targets = refs
        .filter((r) => r.isRelative)
        .reduce<readonly RelativePath[]>((acc, ref) => {
          const resolved = resolveImportSpec(entry.path, ref.source);
          if (resolved === null) return acc;
          const target = findRepoPathForResolved(resolved, repo.files);
          if (target === null || !pathSet.has(target)) return acc;
          if (acc.includes(target)) return acc;
          return [...acc, target];
        }, []);
      if (targets.length > 0) edges.set(entry.path, targets);
    } catch {
      // skip file on read/parse error
    }
  }
  return edges;
}

function bfsScores(
  seeds: readonly RelativePath[],
  edges: ReadonlyMap<RelativePath, readonly RelativePath[]>,
  allPaths: readonly RelativePath[],
): ReadonlyMap<RelativePath, number> {
  const scoreMap = new Map<RelativePath, number>();
  for (const p of allPaths) scoreMap.set(p, 0);
  const initialQueue: readonly { path: RelativePath; depth: number }[] = seeds.map(
    (p) => ({ path: p, depth: 0 }),
  );
  const visited = new Set<RelativePath>();
  const drain = (queue: readonly { path: RelativePath; depth: number }[]): void => {
    if (queue.length === 0) return;
    const [head, ...rest] = queue;
    if (head === undefined) return;
    if (visited.has(head.path)) {
      drain(rest);
      return;
    }
    visited.add(head.path);
    scoreMap.set(head.path, depthToScore(head.depth));
    const nexts = edges.get(head.path) ?? [];
    const newTail = nexts
      .filter((to) => !visited.has(to))
      .map((path) => ({ path, depth: head.depth + 1 }));
    drain([...rest, ...newTail]);
  };
  drain(initialQueue);
  return scoreMap;
}

export class ImportGraphProximityScorer implements ImportProximityScorer {
  constructor(
    private readonly fileContentReader: FileContentReader,
    private readonly languageProviders: readonly LanguageProvider[],
  ) {}

  getScores(repo: RepoMap, task: TaskClassification): ReadonlyMap<RelativePath, number> {
    const allPaths = repo.files.map((f) => f.path);
    const edges = buildEdges(repo, this.fileContentReader, this.languageProviders);
    const seeds = repo.files
      .filter(
        (e) =>
          pathRelevance(e.path, task.matchedKeywords) > 0 &&
          getProvider(e.path, this.languageProviders) !== undefined,
      )
      .map((e) => e.path);
    return bfsScores(seeds, edges, allPaths);
  }
}
