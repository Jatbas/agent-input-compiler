// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ImportProximityScorer } from "@jatbas/aic-core/core/interfaces/import-proximity-scorer.interface.js";
import type { FileContentReader } from "@jatbas/aic-core/core/interfaces/file-content-reader.interface.js";
import type { ImportGraphFailureSink } from "@jatbas/aic-core/core/interfaces/import-graph-failure-sink.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import { noopImportGraphFailureSink } from "@jatbas/aic-core/core/interfaces/import-graph-failure-sink.interface.js";
import type { RepoMap } from "@jatbas/aic-core/core/types/repo-map.js";
import type { TaskClassification } from "@jatbas/aic-core/core/types/task-classification.js";
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { FileEntry } from "@jatbas/aic-core/core/types/repo-map.js";
import { resolveImportSpec, toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { getProvider } from "./get-provider.js";
import { pathRelevance } from "./path-relevance.js";

const INDEX_EXTS = [".ts", ".js", ".tsx", ".jsx"] as const;

function buildRepoPathIndex(
  files: readonly FileEntry[],
): ReadonlyMap<RelativePath, RelativePath> {
  const map = new Map<RelativePath, RelativePath>();
  for (const f of files) {
    if (!map.has(f.path)) {
      map.set(f.path, f.path);
    }
  }
  return map;
}

function findRepoPathForResolved(
  resolved: RelativePath,
  pathIndex: ReadonlyMap<RelativePath, RelativePath>,
): RelativePath | null {
  const base = toRelativePath(resolved.trim());
  const exact = pathIndex.get(base);
  if (exact !== undefined) return exact;
  for (const ext of INDEX_EXTS) {
    const withExt = pathIndex.get(toRelativePath(base + ext));
    if (withExt !== undefined) return withExt;
  }
  for (const ext of INDEX_EXTS) {
    const indexPath = pathIndex.get(toRelativePath(base + "/index" + ext));
    if (indexPath !== undefined) return indexPath;
  }
  return null;
}

function depthToScore(depth: number): number {
  if (depth <= 0) return 1;
  if (depth === 1) return 0.6;
  if (depth === 2) return 0.3;
  return 0.1;
}

async function buildEdges(
  repo: RepoMap,
  fileContentReader: FileContentReader,
  languageProviders: readonly LanguageProvider[],
  importGraphFailureSink: ImportGraphFailureSink,
): Promise<ReadonlyMap<RelativePath, readonly RelativePath[]>> {
  const edges = new Map<RelativePath, readonly RelativePath[]>();
  const pathIndex = buildRepoPathIndex(repo.files);
  const pathSet = new Set(pathIndex.keys());
  for (const entry of repo.files) {
    const provider = getProvider(entry.path, languageProviders);
    if (provider === undefined) continue;
    const content = await (async (): Promise<string | null> => {
      try {
        return await fileContentReader.getContent(entry.path);
      } catch (cause) {
        importGraphFailureSink.notifyImportGraphFailure({
          kind: "read",
          path: entry.path,
          cause,
        });
        return null;
      }
    })();
    if (content === null) continue;
    const refs = ((): ReturnType<LanguageProvider["parseImports"]> | null => {
      try {
        return provider.parseImports(content, entry.path);
      } catch (cause) {
        importGraphFailureSink.notifyImportGraphFailure({
          kind: "parse",
          path: entry.path,
          cause,
        });
        return null;
      }
    })();
    if (refs === null) continue;
    const targets = refs
      .filter((r) => r.isRelative)
      .reduce<readonly RelativePath[]>((acc, ref) => {
        const resolved = resolveImportSpec(entry.path, ref.source);
        if (resolved === null) return acc;
        const target = findRepoPathForResolved(resolved, pathIndex);
        if (target === null || !pathSet.has(target)) return acc;
        if (acc.includes(target)) return acc;
        return [...acc, target];
      }, []);
    if (targets.length > 0) edges.set(entry.path, targets);
  }
  return edges;
}

export function buildReverseEdges(
  edges: ReadonlyMap<RelativePath, readonly RelativePath[]>,
): ReadonlyMap<RelativePath, readonly RelativePath[]> {
  const counts = new Map<RelativePath, number>();
  for (const [, toList] of edges) {
    for (const to of toList) {
      counts.set(to, (counts.get(to) ?? 0) + 1);
    }
  }
  const lists = new Map<RelativePath, RelativePath[]>();
  const nextIdx = new Map<RelativePath, number>();
  for (const [to, count] of counts) {
    lists.set(to, new Array<RelativePath>(count));
    nextIdx.set(to, 0);
  }
  for (const [from, toList] of edges) {
    for (const to of toList) {
      const list = lists.get(to);
      const idx = nextIdx.get(to);
      if (list === undefined || idx === undefined) continue;
      list[idx] = from;
      nextIdx.set(to, idx + 1);
    }
  }
  return lists as ReadonlyMap<RelativePath, readonly RelativePath[]>;
}

function bfsScores(
  seeds: readonly RelativePath[],
  edges: ReadonlyMap<RelativePath, readonly RelativePath[]>,
  reverseEdges: ReadonlyMap<RelativePath, readonly RelativePath[]>,
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
    const forward = edges.get(head.path) ?? [];
    const reverse = reverseEdges.get(head.path) ?? [];
    const nexts = [...forward, ...reverse];
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
    private readonly importGraphFailureSink: ImportGraphFailureSink = noopImportGraphFailureSink,
  ) {}

  async getScores(
    repo: RepoMap,
    task: TaskClassification,
  ): Promise<ReadonlyMap<RelativePath, number>> {
    const allPaths = repo.files.map((f) => f.path);
    const edges = await buildEdges(
      repo,
      this.fileContentReader,
      this.languageProviders,
      this.importGraphFailureSink,
    );
    const reverseEdges = buildReverseEdges(edges);
    const seeds = repo.files
      .filter(
        (e) =>
          pathRelevance(e.path, task.matchedKeywords) > 0 &&
          getProvider(e.path, this.languageProviders) !== undefined,
      )
      .map((e) => e.path);
    return bfsScores(seeds, edges, reverseEdges, allPaths);
  }
}
