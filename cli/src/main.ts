import { program, type Command } from "commander";
import * as path from "node:path";
import { CompilationArgsSchema } from "./schemas/compilation-args.js";
import { compileCommand } from "./commands/compile.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import type { CompilationMeta } from "@aic/shared/core/types/compilation-types.js";
import { toTokenCount, toMilliseconds } from "@aic/shared/core/types/units.js";
import { toPercentage } from "@aic/shared/core/types/scores.js";
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

void program.parseAsync(process.argv);
