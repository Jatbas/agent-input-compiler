import { describe, it, expect } from "vitest";
import { compileCommand } from "../compile.js";
import { CompilationArgsSchema } from "../../schemas/compilation-args.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import type { CompilationMeta } from "@aic/shared/core/types/compilation-types.js";
import { toTokenCount, toMilliseconds } from "@aic/shared/core/types/units.js";
import { toPercentage } from "@aic/shared/core/types/scores.js";
import { EDITOR_ID, INCLUSION_TIER, TASK_CLASS } from "@aic/shared/core/types/enums.js";
import { ConfigError } from "@aic/shared/core/errors/config-error.js";

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
  async run() {
    return {
      compiledPrompt: "Not implemented",
      meta: stubMeta,
    };
  },
};

describe("compileCommand", () => {
  it("valid_args_stdout_stub", async () => {
    const parsed = CompilationArgsSchema.parse({
      intent: "fix bug",
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
    });
    const acc: { chunks: readonly string[] } = { chunks: [] };
    const origWrite = process.stdout.write;
    process.stdout.write = (chunk: string | Uint8Array) => {
      const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      acc.chunks = [...acc.chunks, s];
      return true;
    };
    try {
      await compileCommand(parsed, stubRunner);
      expect(acc.chunks.join("")).toContain("Not implemented");
    } finally {
      process.stdout.write = origWrite;
    }
  });

  it("invalid_args_throws", async () => {
    const invalidArgs = {
      intent: "",
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
    };
    await expect(compileCommand(invalidArgs, stubRunner)).rejects.toThrow();
  });

  it("runner_throws_aic_error", async () => {
    const validParsed = CompilationArgsSchema.parse({
      intent: "fix bug",
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
    });
    const mockRunner: CompilationRunner = {
      async run() {
        throw new ConfigError("test");
      },
    };
    const stderrAcc: { chunks: readonly string[] } = { chunks: [] };
    const origStderr = process.stderr.write;
    process.stderr.write = (chunk: string | Uint8Array) => {
      const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      stderrAcc.chunks = [...stderrAcc.chunks, s];
      return true;
    };
    try {
      await expect(compileCommand(validParsed, mockRunner)).rejects.toThrow();
      expect(stderrAcc.chunks.join("")).toContain("test");
    } finally {
      process.stderr.write = origStderr;
    }
  });
});
