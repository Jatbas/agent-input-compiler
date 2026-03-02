import { describe, it, expect } from "vitest";
import { compileCommand } from "../compile.js";
import { CompilationArgsSchema } from "../../schemas/compilation-args.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import type { CompilationMeta } from "@aic/shared/core/types/compilation-types.js";
import type { TelemetryEvent } from "@aic/shared/core/types/telemetry-types.js";
import type { Milliseconds } from "@aic/shared/core/types/units.js";
import {
  type ISOTimestamp,
  type UUIDv7,
  toConversationId,
} from "@aic/shared/core/types/identifiers.js";
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

const stubCompilationId = "00000000-0000-7000-8000-000000000050" as UUIDv7;

const stubRunner: CompilationRunner = {
  async run() {
    return {
      compiledPrompt: "Not implemented",
      meta: stubMeta,
      compilationId: stubCompilationId,
    };
  },
};

describe("compileCommand", () => {
  it("compileCommand without telemetryDeps", async () => {
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
      triggerSource: "cli" as const,
    };
    await expect(compileCommand(invalidArgs, stubRunner)).rejects.toThrow();
  });

  it("compileCommand with telemetryDeps", async () => {
    const parsed = CompilationArgsSchema.parse({
      intent: "fix bug",
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
    });
    const written: { event: TelemetryEvent }[] = [];
    const mockTelemetryStore = {
      write(event: TelemetryEvent) {
        written.push({ event });
      },
    };
    const mockClock = {
      now: (): ISOTimestamp => "2026-01-01T00:00:00.000Z" as ISOTimestamp,
      addMinutes: (_m: number): ISOTimestamp =>
        "2026-01-01T00:00:00.000Z" as ISOTimestamp,
      durationMs: (): Milliseconds => 0 as Milliseconds,
    };
    const mockIdGenerator = {
      generate: (): UUIDv7 => "00000000-0000-7000-8000-000000000000" as UUIDv7,
    };
    const mockStringHasher = { hash: (input: string) => `hash-${input}` };
    const telemetryDeps = {
      telemetryStore: mockTelemetryStore,
      clock: mockClock,
      idGenerator: mockIdGenerator,
      stringHasher: mockStringHasher,
    };
    const acc: { chunks: readonly string[] } = { chunks: [] };
    const origWrite = process.stdout.write;
    process.stdout.write = (chunk: string | Uint8Array) => {
      const s = typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
      acc.chunks = [...acc.chunks, s];
      return true;
    };
    try {
      await compileCommand(parsed, stubRunner, telemetryDeps);
      expect(written.length).toBe(1);
      const recorded = written[0];
      expect(recorded).toBeDefined();
      if (recorded !== undefined) {
        expect(recorded.event.compilationId).toBe(stubCompilationId);
      }
      expect(acc.chunks.join("")).toContain("Not implemented");
    } finally {
      process.stdout.write = origWrite;
    }
  });

  it("cli_sets_trigger_source", async () => {
    const parsed = CompilationArgsSchema.parse({
      intent: "fix bug",
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
    });
    type CapturedRequest = Parameters<CompilationRunner["run"]>[0];
    const captured: { request: CapturedRequest | null } = { request: null };
    const capturingRunner: CompilationRunner = {
      async run(request) {
        captured.request = request;
        return {
          compiledPrompt: "ok",
          meta: stubMeta,
          compilationId: stubCompilationId,
        };
      },
    };
    await compileCommand(parsed, capturingRunner);
    expect(captured.request).not.toBeNull();
    if (captured.request !== null) {
      expect(captured.request.triggerSource).toBe("cli");
    }
  });

  it("compile_command_passes_conversation_id", async () => {
    const parsed = CompilationArgsSchema.parse({
      intent: "fix bug",
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
      conversationId: "cli-conv-123",
    });
    type CapturedRequest = Parameters<CompilationRunner["run"]>[0];
    const captured: { request: CapturedRequest | null } = { request: null };
    const capturingRunner: CompilationRunner = {
      async run(request) {
        captured.request = request;
        return {
          compiledPrompt: "ok",
          meta: stubMeta,
          compilationId: stubCompilationId,
        };
      },
    };
    await compileCommand(parsed, capturingRunner);
    expect(captured.request).not.toBeNull();
    if (captured.request !== null) {
      expect(captured.request.conversationId).toBe(toConversationId("cli-conv-123"));
    }
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
