// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type {
  ProjectScope,
  CreateProjectScopeOptions,
} from "@jatbas/aic-core/storage/create-project-scope.js";
import type { ProjectRootNormaliser } from "@jatbas/aic-core/core/interfaces/project-root-normaliser.interface.js";
import { createProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";

export class ScopeRegistry {
  private readonly scopes = new Map<string, ProjectScope>();

  constructor(
    private readonly normaliser: ProjectRootNormaliser,
    private readonly db: ExecutableDb,
    private readonly clock: Clock,
  ) {}

  getOrCreate(
    projectRoot: AbsolutePath,
    options?: CreateProjectScopeOptions,
  ): ProjectScope {
    const key = this.normaliser.normalise(projectRoot);
    const existing = this.scopes.get(key);
    if (existing !== undefined) return existing;
    const scope = createProjectScope(
      projectRoot,
      this.normaliser,
      this.db,
      this.clock,
      options,
    );
    this.scopes.set(key, scope);
    return scope;
  }

  close(): void {
    this.scopes.clear();
  }
}
