import { describe, it, expect } from "vitest";
import { inspectCommand } from "../inspect.js";
import { InspectArgsSchema } from "../../schemas/inspect-args.js";
import type { InspectRunner } from "@aic/shared/core/interfaces/inspect-runner.interface.js";
import type { PipelineTrace } from "@aic/shared/core/types/inspect-types.js";
import { toTokenCount } from "@aic/shared/core/types/units.js";
import { toPercentage, toConfidence } from "@aic/shared/core/types/scores.js";
import { toISOTimestamp } from "@aic/shared/core/types/identifiers.js";
import { TASK_CLASS, INCLUSION_TIER } from "@aic/shared/core/types/enums.js";
import { ConfigError } from "@aic/shared/core/errors/config-error.js";

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

const stubRunner: InspectRunner = {
  inspect() {
    return Promise.resolve(stubTrace);
  },
};

describe("inspectCommand", () => {
  it("valid_args_stdout_stub", async () => {
    const parsed = InspectArgsSchema.parse({
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
      await inspectCommand(parsed, stubRunner);
      const json = JSON.parse(acc.chunks.join(""));
      expect(json).toHaveProperty("trace");
      expect(json.trace).toHaveProperty("intent", "");
      expect(json.trace.taskClass.taskClass).toBe(TASK_CLASS.GENERAL);
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
    await expect(inspectCommand(invalidArgs, stubRunner)).rejects.toThrow();
  });

  it("runner_throws_aic_error", async () => {
    const validParsed = InspectArgsSchema.parse({
      intent: "fix bug",
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
    });
    const mockRunner: InspectRunner = {
      async inspect() {
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
      await expect(inspectCommand(validParsed, mockRunner)).rejects.toThrow();
      expect(stderrAcc.chunks.join("")).toContain("test");
    } finally {
      process.stderr.write = origStderr;
    }
  });
});
