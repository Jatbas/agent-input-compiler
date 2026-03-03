import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import { toAbsolutePath, toFilePath } from "#core/types/paths.js";
import type { TaskClass } from "#core/types/enums.js";
import type { RulePackProvider } from "#core/interfaces/rule-pack-provider.interface.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { ProjectScope } from "#storage/create-project-scope.js";
import { closeDatabase } from "#storage/open-database.js";
import { createProjectScope } from "#storage/create-project-scope.js";
import { createCachingFileContentReader } from "#adapters/caching-file-content-reader.js";
import { createFullPipelineDeps } from "../../bootstrap/create-pipeline-deps.js";
import { InspectRunner } from "#pipeline/inspect-runner.js";
import { initLanguageProviders } from "#adapters/init-language-providers.js";
import { LoadConfigFromFile } from "../../config/load-config-from-file.js";
import { applyConfigResult } from "../../config/load-config-from-file.js";
import { loadRulePackFromPath } from "#core/load-rule-pack.js";
import { createProjectFileReader } from "#adapters/project-file-reader-adapter.js";
import { Sha256Adapter } from "#adapters/sha256-adapter.js";

const fixtureRoot = toAbsolutePath(
  path.join(process.cwd(), "test", "benchmarks", "repos", "1"),
);

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

let providers: Awaited<ReturnType<typeof initLanguageProviders>>;

beforeAll(async () => {
  providers = await initLanguageProviders(fixtureRoot as string);
});

describe("selection quality benchmarks", () => {
  let scope: ProjectScope | undefined;

  afterEach(() => {
    if (scope) closeDatabase(scope.db);
    scope = undefined;
  });

  it("selection_quality_task1_matches_baseline", async () => {
    scope = createProjectScope(fixtureRoot);
    const sha256Adapter = new Sha256Adapter();
    const configResult = new LoadConfigFromFile().load(fixtureRoot, null);
    const { budgetConfig, heuristicConfig } = applyConfigResult(
      configResult,
      scope.configStore,
      sha256Adapter,
    );
    const fileContentReader = createCachingFileContentReader(fixtureRoot);
    const rulePackProvider = createRulePackProvider();
    const deps = createFullPipelineDeps(
      fileContentReader,
      rulePackProvider,
      budgetConfig,
      providers,
      heuristicConfig,
    );
    const runner = new InspectRunner(deps, scope.clock);
    const request = {
      intent: "refactor auth module to use middleware pattern",
      projectRoot: fixtureRoot,
      configPath: null,
      dbPath: toFilePath(path.join(fixtureRoot as string, ".aic", "aic.sqlite")),
    };
    const trace = await runner.inspect(request);
    const baselinePath = path.join(
      process.cwd(),
      "test",
      "benchmarks",
      "expected-selection",
      "1.json",
    );
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const actualPaths = trace.selectedFiles.map((f) => f.path as string).toSorted();
    const expectedPaths = (baseline.selectedPaths as string[]).toSorted();
    expect(actualPaths).toEqual(expectedPaths);
  }, 30_000);
});
