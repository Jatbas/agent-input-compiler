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
import type { InspectRunner } from "@aic/shared/core/interfaces/inspect-runner.interface.js";
import type { StatusRequest } from "@aic/shared/core/types/status-types.js";
import { openDatabase } from "@aic/shared/storage/open-database.js";
import { SystemClock } from "@aic/shared/adapters/system-clock.js";
import { SqliteStatusStore } from "@aic/shared/storage/sqlite-status-store.js";
import type { PipelineTrace } from "@aic/shared/core/types/inspect-types.js";
import { toTokenCount } from "@aic/shared/core/types/units.js";
import { toPercentage, toConfidence } from "@aic/shared/core/types/scores.js";
import { toISOTimestamp } from "@aic/shared/core/types/identifiers.js";
import { TASK_CLASS, INCLUSION_TIER } from "@aic/shared/core/types/enums.js";
import { STUB_COMPILATION_META } from "@aic/shared/testing/stub-compilation-meta.js";
import {
  type CliOpts,
  resolveBaseArgs,
  runAction,
  createIntentAction,
} from "./utils/run-action.js";

const stubRunner: CompilationRunner = {
  run(_request) {
    return Promise.resolve({
      compiledPrompt: "Not implemented",
      meta: STUB_COMPILATION_META,
    });
  },
};

const stubTrace: PipelineTrace = {
  intent: "",
  taskClass: {
    taskClass: TASK_CLASS.GENERAL,
    confidence: toConfidence(0),
    matchedKeywords: [],
  },
  rulePacks: [],
  budget: toTokenCount(0),
  selectedFiles: [],
  guard: null,
  transforms: [],
  summarisationTiers: {
    [INCLUSION_TIER.L0]: 0,
    [INCLUSION_TIER.L1]: 0,
    [INCLUSION_TIER.L2]: 0,
    [INCLUSION_TIER.L3]: 0,
  },
  constraints: [],
  tokenSummary: {
    raw: toTokenCount(0),
    selected: toTokenCount(0),
    afterGuard: toTokenCount(0),
    afterTransforms: toTokenCount(0),
    afterLadder: toTokenCount(0),
    promptTotal: toTokenCount(0),
    reductionPct: toPercentage(0),
  },
  compiledAt: toISOTimestamp("1970-01-01T00:00:00.000Z"),
};

const inspectStubRunner: InspectRunner = {
  inspect(_request) {
    return Promise.resolve(stubTrace);
  },
};

program.name("aic").version("0.0.1");

program
  .command("compile <intent>")
  .description("Compile intent into a raw prompt; output to stdout")
  .option("--root <path>", "project root directory", process.cwd())
  .option("--config <path>", "path to aic.config.json")
  .option("--db <path>", "path to SQLite database")
  .action(
    createIntentAction(CompilationArgsSchema, (args) => compileCommand(args, stubRunner)),
  );

program
  .command("inspect <intent>")
  .description("Show pipeline trace without executing model; output JSON to stdout")
  .option("--root <path>", "project root directory", process.cwd())
  .option("--config <path>", "path to aic.config.json")
  .option("--db <path>", "path to SQLite database")
  .action(
    createIntentAction(InspectArgsSchema, (args) =>
      inspectCommand(args, inspectStubRunner),
    ),
  );

program
  .command("init")
  .description("Scaffold aic.config.json and add .aic/ to .gitignore")
  .option("--root <path>", "project root directory", process.cwd())
  .option("--upgrade", "migrate config to current schema and back up original")
  .action(async function (this: Command) {
    await runAction(async () => {
      const parsed = InitArgsSchema.parse({
        ...resolveBaseArgs(this.opts() as CliOpts),
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
      const parsed = StatusArgsSchema.parse(resolveBaseArgs(this.opts() as CliOpts));
      const statusRunner = {
        status(request: StatusRequest) {
          const db = openDatabase(request.dbPath as string, new SystemClock());
          const store = new SqliteStatusStore(db, new SystemClock());
          return Promise.resolve(store.getSummary());
        },
      };
      await statusCommand(parsed, statusRunner);
    });
  });

void program.parseAsync(process.argv);
