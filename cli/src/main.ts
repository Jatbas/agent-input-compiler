import { program, type Command } from "commander";
import * as path from "node:path";
import { CompilationArgsSchema } from "./schemas/compilation-args.js";
import { InspectArgsSchema } from "./schemas/inspect-args.js";
import { compileCommand } from "./commands/compile.js";
import { inspectCommand } from "./commands/inspect.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import type { InspectRunner } from "@aic/shared/core/interfaces/inspect-runner.interface.js";
import type { CompilationMeta } from "@aic/shared/core/types/compilation-types.js";
import type { PipelineTrace } from "@aic/shared/core/types/inspect-types.js";
import { toTokenCount, toMilliseconds } from "@aic/shared/core/types/units.js";
import { toPercentage, toConfidence } from "@aic/shared/core/types/scores.js";
import { toISOTimestamp } from "@aic/shared/core/types/identifiers.js";
import { TASK_CLASS, EDITOR_ID, INCLUSION_TIER } from "@aic/shared/core/types/enums.js";
import { sanitizeError } from "@aic/shared/core/errors/sanitize-error.js";
import { z } from "zod";

const stubMeta: CompilationMeta = {
  intent: "",
  taskClass: TASK_CLASS.GENERAL,
  filesSelected: 0,
  filesTotal: 0,
  tokensRaw: toTokenCount(0),
  tokensCompiled: toTokenCount(0),
  tokenReductionPct: toPercentage(0),
  cacheHit: false,
  durationMs: toMilliseconds(0),
  modelId: "",
  editorId: EDITOR_ID.GENERIC,
  transformTokensSaved: toTokenCount(0),
  summarisationTiers: {
    [INCLUSION_TIER.L0]: 0,
    [INCLUSION_TIER.L1]: 0,
    [INCLUSION_TIER.L2]: 0,
    [INCLUSION_TIER.L3]: 0,
  },
  guard: null,
};

const stubRunner: CompilationRunner = {
  run(_request) {
    return Promise.resolve({
      compiledPrompt: "Not implemented",
      meta: stubMeta,
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
  .action(async function (this: Command, intent: string) {
    try {
      const opts = this.opts() as { root?: string; config?: string; db?: string };
      const rootOpt = opts.root ?? process.cwd();
      const parsed = CompilationArgsSchema.parse({
        intent,
        projectRoot: path.resolve(rootOpt),
        configPath: opts.config ?? null,
        dbPath: opts.db ?? null,
      });
      await compileCommand(parsed, stubRunner);
      process.exit(0);
    } catch (err) {
      if (err instanceof z.ZodError) {
        process.stderr.write(String(err.message));
        process.exit(1);
      }
      process.stderr.write(sanitizeError(err).message);
      process.exit(2);
    }
  });

program
  .command("inspect <intent>")
  .description("Show pipeline trace without executing model; output JSON to stdout")
  .option("--root <path>", "project root directory", process.cwd())
  .option("--config <path>", "path to aic.config.json")
  .option("--db <path>", "path to SQLite database")
  .action(async function (this: Command, intent: string) {
    try {
      const opts = this.opts() as { root?: string; config?: string; db?: string };
      const rootOpt = opts.root ?? process.cwd();
      const parsed = InspectArgsSchema.parse({
        intent,
        projectRoot: path.resolve(rootOpt),
        configPath: opts.config ?? null,
        dbPath: opts.db ?? null,
      });
      await inspectCommand(parsed, inspectStubRunner);
      process.exit(0);
    } catch (err) {
      if (err instanceof z.ZodError) {
        process.stderr.write(String(err.message));
        process.exit(1);
      }
      process.stderr.write(sanitizeError(err).message);
      process.exit(2);
    }
  });

void program.parseAsync(process.argv);
