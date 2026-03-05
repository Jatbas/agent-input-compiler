import { describe, it, expect, beforeAll, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
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

const fixtureRoot = toAbsolutePath(
  path.join(process.cwd(), "test", "benchmarks", "repos", "1"),
);

const baselinePath = path.join(process.cwd(), "test", "benchmarks", "baseline.json");

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

type BaselineEntry = { token_count: number; duration_ms: number };

function readBaseline(): Record<string, BaselineEntry> {
  try {
    return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch {
    return {};
  }
}

describe("token reduction benchmarks", () => {
  let scope: ProjectScope | undefined;

  afterEach(() => {
    if (scope) closeDatabase(scope.db);
    scope = undefined;
  });

  it("token_reduction_task1_matches_or_establishes_baseline", async () => {
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
    const runner = new CompilationRunner(
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
    const request = {
      intent: "refactor auth module to use middleware pattern",
      projectRoot: fixtureRoot,
      modelId: null,
      editorId: EDITOR_ID.GENERIC,
      configPath: null,
      triggerSource: TRIGGER_SOURCE.INTERNAL_TEST,
    };
    const result = await runner.run(request);
    const tokenCount = result.meta.tokensCompiled;
    const durationMs = result.meta.durationMs;
    let baseline: Record<string, BaselineEntry> = readBaseline();
    if (baseline["1"] === undefined) {
      baseline = {
        ...baseline,
        "1": { token_count: tokenCount, duration_ms: durationMs },
      };
      fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
      console.log(
        `[benchmark] task 1 — established baseline: ${tokenCount} tokens, ${durationMs}ms`,
      );
      expect(true).toBe(true);
      return;
    }
    const prev = baseline["1"];
    const delta = tokenCount - prev.token_count;
    const pct = prev.token_count === 0 ? 0 : (delta / prev.token_count) * 100;
    console.log(
      `[benchmark] task 1 — tokens: ${tokenCount} (baseline: ${prev.token_count}, delta: ${delta >= 0 ? "+" : ""}${delta}, ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%) | duration: ${durationMs}ms (baseline: ${prev.duration_ms}ms)`,
    );
    if (tokenCount < prev.token_count) {
      const updated = {
        ...baseline,
        "1": { token_count: tokenCount, duration_ms: durationMs },
      };
      fs.writeFileSync(baselinePath, JSON.stringify(updated, null, 2) + "\n");
      console.log(
        `[benchmark] task 1 — baseline ratcheted: ${prev.token_count} → ${tokenCount} tokens`,
      );
    }
    expect(tokenCount).toBeLessThanOrEqual(prev.token_count * 1.05);
    if (prev.duration_ms > 0) {
      expect(durationMs).toBeLessThanOrEqual(prev.duration_ms * 2);
    }
  }, 30_000);
});
