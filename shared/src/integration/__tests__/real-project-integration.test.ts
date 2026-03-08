// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { toAbsolutePath } from "#core/types/paths.js";
import { EDITOR_ID, TRIGGER_SOURCE } from "#core/types/enums.js";
import type { TaskClass } from "#core/types/enums.js";
import type { RulePackProvider } from "#core/interfaces/rule-pack-provider.interface.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { ProjectScope } from "#storage/create-project-scope.js";
import { closeDatabase } from "#storage/open-database.js";
import { createProjectScope } from "#storage/create-project-scope.js";
import { createCachingFileContentReader } from "#adapters/caching-file-content-reader.js";
import { createFullPipelineDeps } from "../../bootstrap/create-pipeline-deps.js";
import { CompilationRunner } from "#pipeline/compilation-runner.js";
import { initLanguageProviders } from "#adapters/init-language-providers.js";
import { LoadConfigFromFile } from "../../config/load-config-from-file.js";
import { applyConfigResult } from "../../config/load-config-from-file.js";
import { loadRulePackFromPath } from "#core/load-rule-pack.js";
import { createProjectFileReader } from "#adapters/project-file-reader-adapter.js";
import { Sha256Adapter } from "#adapters/sha256-adapter.js";

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
  lastScope = createProjectScope(projectRoot);
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
  const deps = createFullPipelineDeps(
    fileContentReader,
    rulePackProvider,
    budgetConfig,
    providers,
    heuristicConfig,
  );
  return new CompilationRunner(
    deps,
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
  providers = await initLanguageProviders(projectRoot);
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
