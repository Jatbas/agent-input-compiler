// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { EDITOR_ID, TRIGGER_SOURCE } from "@jatbas/aic-core/core/types/enums.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import type { RulePackProvider } from "@jatbas/aic-core/core/interfaces/rule-pack-provider.interface.js";
import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { ProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import { openDatabase, closeDatabase } from "@jatbas/aic-core/storage/open-database.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";
import { SystemClock } from "@jatbas/aic-core/adapters/system-clock.js";
import { createProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import { createCachingFileContentReader } from "@jatbas/aic-core/adapters/caching-file-content-reader.js";
import { createPipelineDeps } from "../../bootstrap/create-pipeline-deps.js";
import { CompilationRunner } from "@jatbas/aic-core/pipeline/compilation-runner.js";
import { FileSystemRepoMapSupplier } from "@jatbas/aic-core/adapters/file-system-repo-map-supplier.js";
import { FastGlobAdapter } from "@jatbas/aic-core/adapters/fast-glob-adapter.js";
import { IgnoreAdapter } from "@jatbas/aic-core/adapters/ignore-adapter.js";
import { initLanguageProviders } from "@jatbas/aic-core/adapters/init-language-providers.js";
import { LoadConfigFromFile } from "../../config/load-config-from-file.js";
import { applyConfigResult } from "../../config/load-config-from-file.js";
import { loadRulePackFromPath } from "@jatbas/aic-core/core/load-rule-pack.js";
import { createProjectFileReader } from "@jatbas/aic-core/adapters/project-file-reader-adapter.js";
import { Sha256Adapter } from "@jatbas/aic-core/adapters/sha256-adapter.js";

const projectRoot = toAbsolutePath(process.cwd());

const defaultRulePack: RulePack = {
  constraints: [],
  includePatterns: [],
  excludePatterns: [],
};

function createRulePackProvider(): RulePackProvider {
  return {
    getBuiltInPack(): RulePack {
      return defaultRulePack;
    },
    getProjectPack(
      projectRootArg: ReturnType<typeof toAbsolutePath>,
      taskClass: TaskClass,
    ): RulePack | null {
      return loadRulePackFromPath(
        createProjectFileReader(projectRootArg as string),
        taskClass,
      );
    },
  };
}

let lastScope: ProjectScope | undefined;

function createRunner(): CompilationRunner {
  const clock = new SystemClock();
  const db = openDatabase(":memory:", clock);
  lastScope = createProjectScope(projectRoot, new NodePathAdapter(), db, clock);
  const scope = lastScope;
  const sha256Adapter = new Sha256Adapter();
  const configResult = new LoadConfigFromFile().load(projectRoot, null);
  const { budgetConfig, heuristicConfig } = applyConfigResult(
    configResult,
    scope.configStore,
    sha256Adapter,
  );
  const fileContentReader = createCachingFileContentReader(projectRoot);
  const rulePackProvider = createRulePackProvider();
  const deps = createPipelineDeps(
    fileContentReader,
    rulePackProvider,
    budgetConfig,
    providers,
    heuristicConfig,
  );
  const repoMapSupplier = new FileSystemRepoMapSupplier(
    new FastGlobAdapter(),
    new IgnoreAdapter(),
  );
  return new CompilationRunner(
    { ...deps, repoMapSupplier },
    scope.clock,
    scope.cacheStore,
    scope.configStore,
    sha256Adapter,
    scope.guardStore,
    scope.compilationLogStore,
    scope.idGenerator,
    null,
  );
}

let providers: Awaited<ReturnType<typeof initLanguageProviders>>;

beforeAll(async () => {
  providers = await initLanguageProviders(projectRoot, new IgnoreAdapter());
}, 60_000);

describe("real project integration", () => {
  afterEach(() => {
    if (lastScope) closeDatabase(lastScope.db);
    lastScope = undefined;
  });

  const request = {
    intent: "refactor auth module to use middleware pattern",
    projectRoot,
    modelId: null,
    editorId: EDITOR_ID.GENERIC,
    configPath: null,
    triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
  };

  it("real_project_compile_succeeds", async () => {
    const runner = createRunner();
    const result = await runner.run(request);
    expect(result.compiledPrompt.length).toBeGreaterThan(0);
    expect(result.meta).toBeDefined();
    expect(typeof result.meta.cacheHit).toBe("boolean");
    expect(result.meta.durationMs).toBeDefined();
  }, 30_000);

  it("real_project_compile_output_has_expected_structure", async () => {
    const runner = createRunner();
    const result = await runner.run(request);
    expect(result.compiledPrompt).toContain("## Task");
    expect(result.compiledPrompt).toContain("## Context");
  }, 30_000);

  it("real_project_second_run_cache_hit", async () => {
    const runner = createRunner();
    await runner.run(request);
    const second = await runner.run(request);
    expect(second.meta.cacheHit).toBe(true);
  }, 30_000);
});
