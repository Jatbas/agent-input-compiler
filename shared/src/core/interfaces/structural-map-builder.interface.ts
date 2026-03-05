import type { RepoMap } from "#core/types/repo-map.js";

export interface StructuralMapBuilder {
  build(repoMap: RepoMap): string;
}
