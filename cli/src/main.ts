import { program, type Command } from "commander";
import { CompilationArgsSchema } from "./schemas/compilation-args.js";
import { InspectArgsSchema } from "./schemas/inspect-args.js";
import { InitArgsSchema } from "./schemas/init-args.js";
import { StatusArgsSchema } from "./schemas/status-args.js";
import { compileCommand } from "./commands/compile.js";
import { inspectCommand } from "./commands/inspect.js";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import type { LanguageProvider } from "@aic/shared/core/interfaces/language-provider.interface.js";
import { InspectRunner } from "@aic/shared/pipeline/inspect-runner.js";
import type { StatusRequest } from "@aic/shared/core/types/status-types.js";
import { createCachingFileContentReader } from "@aic/shared/adapters/caching-file-content-reader.js";
import {
  closeDatabase,
  openDatabase,
} from "@aic/shared/storage/open-database.js";
import {
  createProjectScope,
  type ProjectScope,
} from "@aic/shared/storage/create-project-scope.js";
import { createFullPipelineDeps } from "@aic/shared/bootstrap/create-pipeline-deps.js";
import {
  LoadConfigFromFile,
  applyConfigResult,
} from "@aic/shared/config/load-config-from-file.js";
import type { PipelineStepsDeps } from "@aic/shared/core/run-pipeline-steps.js";
import { SystemClock } from "@aic/shared/adapters/system-clock.js";
import { SqliteStatusStore } from "@aic/shared/storage/sqlite-status-store.js";
import { CompilationRunner as CompilationRunnerImpl } from "@aic/shared/pipeline/compilation-runner.js";
import { Sha256Adapter } from "@aic/shared/adapters/sha256-adapter.js";
import type { RulePackProvider } from "@aic/shared/core/interfaces/rule-pack-provider.interface.js";
import type { RulePack } from "@aic/shared/core/types/rule-pack.js";
import type { TaskClass } from "@aic/shared/core/types/enums.js";
import { toAbsolutePath, toFilePath } from "@aic/shared/core/types/paths.js";
import { TASK_CLASS } from "@aic/shared/core/types/enums.js";
import { loadRulePackFromPath } from "@aic/shared/core/load-rule-pack.js";
import { createProjectFileReader } from "@aic/shared/adapters/project-file-reader-adapter.js";
import { initLanguageProviders } from "@aic/shared/adapters/init-language-providers.js";
import { resolveBaseArgs, runAction, createIntentAction } from "./utils/run-action.js";

function defaultRulePack(): RulePack {
  return {
    constraints: [],
    includePatterns: [],
    excludePatterns: [],
  };
}

function createRulePackProvider(_projectRoot: string): RulePackProvider {
  return {
    getBuiltInPack(_name: string): RulePack {
      return defaultRulePack();
    },
    getProjectPack(projectRootArg: string, _taskClass: TaskClass): RulePack | null {
      return loadRulePackFromPath(
        createProjectFileReader(projectRootArg),
        TASK_CLASS.REFACTOR,
      );
    },
  };
}

function createScopeAndDeps(
  projectRoot: string,
  configPath: string | null,
  additionalProviders?: readonly LanguageProvider[],
): {
  scope: ProjectScope;
  deps: PipelineStepsDeps;
} {
  const scope = createProjectScope(toAbsolutePath(projectRoot));
  setImmediate(() => scope.cacheStore.purgeExpired());
  const sha256Adapter = new Sha256Adapter();
  const configLoader = new LoadConfigFromFile();
  const configResult = configLoader.load(
    toAbsolutePath(projectRoot),
    configPath !== null ? toFilePath(configPath) : null,
  );
  const { budgetConfig, heuristicConfig } = applyConfigResult(
    configResult,
    scope.configStore,
    sha256Adapter,
  );
  const fileContentReader = createCachingFileContentReader(toAbsolutePath(projectRoot));
  const rulePackProvider = createRulePackProvider(projectRoot);
  const deps = createFullPipelineDeps(
    fileContentReader,
    rulePackProvider,
    budgetConfig,
    additionalProviders,
    heuristicConfig,
  );
  return { scope, deps };
}

function createCompilationRunner(
  projectRoot: string,
  configPath: string | null,
  additionalProviders?: readonly LanguageProvider[],
): {
  runner: CompilationRunner;
  scope: ProjectScope;
  stringHasher: InstanceType<typeof Sha256Adapter>;
} {
  const { scope, deps } = createScopeAndDeps(
    projectRoot,
    configPath,
    additionalProviders,
  );
  const stringHasher = new Sha256Adapter();
  const runner = new CompilationRunnerImpl(
    deps,
    scope.clock,
    scope.cacheStore,
    scope.configStore,
    stringHasher,
    scope.guardStore,
    scope.compilationLogStore,
    scope.idGenerator,
  );
  return { runner, scope, stringHasher };
}

function createInspectRunner(
  projectRoot: string,
  configPath: string | null,
  additionalProviders?: readonly LanguageProvider[],
): { runner: InspectRunner; scope: ProjectScope } {
  const { scope, deps } = createScopeAndDeps(
    projectRoot,
    configPath,
    additionalProviders,
  );
  return { runner: new InspectRunner(deps, scope.clock), scope };
}

program.name("aic").version("0.0.1");

program
  .command("compile <intent>")
  .description("Compile intent into a raw prompt; output to stdout")
  .option("--root <path>", "project root directory", process.cwd())
  .option("--config <path>", "path to aic.config.json")
  .option("--db <path>", "path to SQLite database")
  .action(
    createIntentAction(CompilationArgsSchema, async (args) => {
      const providers = await initLanguageProviders(args.projectRoot);
      const result = createCompilationRunner(
        args.projectRoot,
        args.configPath ?? null,
        providers,
      );
      try {
        await compileCommand(args, result.runner, {
          telemetryStore: result.scope.telemetryStore,
          clock: result.scope.clock,
          idGenerator: result.scope.idGenerator,
          stringHasher: result.stringHasher,
        });
      } finally {
        closeDatabase(result.scope.db);
      }
    }),
  );

program
  .command("inspect <intent>")
  .description("Show pipeline trace without executing model; output JSON to stdout")
  .option("--root <path>", "project root directory", process.cwd())
  .option("--config <path>", "path to aic.config.json")
  .option("--db <path>", "path to SQLite database")
  .action(
    createIntentAction(InspectArgsSchema, async (args) => {
      const providers = await initLanguageProviders(args.projectRoot);
      const { runner, scope } = createInspectRunner(
        args.projectRoot,
        args.configPath ?? null,
        providers,
      );
      try {
        await inspectCommand(args, runner);
      } finally {
        closeDatabase(scope.db);
      }
    }),
  );

program
  .command("init")
  .description("Scaffold aic.config.json and add .aic/ to .gitignore")
  .option("--root <path>", "project root directory", process.cwd())
  .option("--upgrade", "migrate config to current schema and back up original")
  .action(async function (this: Command) {
    await runAction(async () => {
      const parsed = InitArgsSchema.parse({
        ...resolveBaseArgs(this.opts()),
        upgrade: this.opts()["upgrade"] === true,
      });
      await initCommand(parsed);
    });
  });

program
  .command("status")
  .description("Show project-level summary from local database")
  .option("--root <path>", "project root directory", process.cwd())
  .option("--config <path>", "path to aic.config.json")
  .option("--db <path>", "path to SQLite database")
  .action(async function (this: Command) {
    await runAction(async () => {
      const parsed = StatusArgsSchema.parse(resolveBaseArgs(this.opts()));
      const statusRunner = {
        status(request: StatusRequest) {
          const db = openDatabase(request.dbPath, new SystemClock());
          try {
            const store = new SqliteStatusStore(db, new SystemClock());
            return Promise.resolve(store.getSummary());
          } finally {
            closeDatabase(db);
          }
        },
      };
      await statusCommand(parsed, statusRunner);
    });
  });

void program.parseAsync(process.argv);
