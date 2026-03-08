// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { StructuralMapBuilder as IStructuralMapBuilder } from "@jatbas/aic-shared/core/interfaces/structural-map-builder.interface.js";
import type { RepoMap } from "@jatbas/aic-shared/core/types/repo-map.js";

const MAX_DEPTH = 4;

function dirPrefixAtDepth(path: string, maxDepth: number): string {
  const segments = path.split("/").slice(0, -1);
  const prefixSegments = segments.slice(0, maxDepth);
  if (prefixSegments.length === 0) return "";
  return prefixSegments.join("/") + "/";
}

export class StructuralMapBuilder implements IStructuralMapBuilder {
  constructor() {}

  build(repoMap: RepoMap): string {
    if (repoMap.files.length === 0) return "";
    const counts = repoMap.files.reduce<Readonly<Record<string, number>>>((acc, file) => {
      const dir = dirPrefixAtDepth(file.path, MAX_DEPTH);
      if (dir === "") return acc;
      const n = (acc[dir] ?? 0) + 1;
      return { ...acc, [dir]: n };
    }, {});
    const sortedDirs = Object.keys(counts).toSorted();
    return sortedDirs.map((dir) => `${dir} (${counts[dir] ?? 0} files)`).join("\n");
  }
}
