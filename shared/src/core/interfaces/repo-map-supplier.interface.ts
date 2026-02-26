import type { AbsolutePath } from "#core/types/paths.js";
import type { RepoMap } from "#core/types/repo-map.js";

export interface RepoMapSupplier {
  getRepoMap(projectRoot: AbsolutePath): Promise<RepoMap>;
}
