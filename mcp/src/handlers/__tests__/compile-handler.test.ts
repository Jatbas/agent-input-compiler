import { describe, it, expect } from "vitest";
import { createCompileHandler } from "../compile-handler.js";
import type { CompilationRunner } from "@aic/shared/core/interfaces/compilation-runner.interface.js";
import type { CompilationMeta } from "@aic/shared/core/types/compilation-types.js";
import type { TelemetryDeps } from "@aic/shared/core/types/telemetry-types.js";
import type { TelemetryEvent } from "@aic/shared/core/types/telemetry-types.js";
import type { ISOTimestamp, UUIDv7 } from "@aic/shared/core/types/identifiers.js";
import type { Milliseconds } from "@aic/shared/core/types/units.js";
import { toTokenCount, toMilliseconds } from "@aic/shared/core/types/units.js";
import { toPercentage } from "@aic/shared/core/types/scores.js";
import { toSessionId } from "@aic/shared/core/types/identifiers.js";
import { EDITOR_ID, INCLUSION_TIER, TASK_CLASS } from "@aic/shared/core/types/enums.js";

const stubMeta: CompilationMeta = {
  intent: "fix bug",
  taskClass: TASK_CLASS.REFACTOR,
  filesSelected: 3,
  filesTotal: 10,
  tokensRaw: toTokenCount(1000),
  tokensCompiled: toTokenCount(200),
  tokenReductionPct: toPercentage(80),
  cacheHit: true,
  durationMs: toMilliseconds(150),
  modelId: "gpt-4",
  editorId: EDITOR_ID.GENERIC,
  transformTokensSaved: toTokenCount(0),
  summarisationTiers: {
    [INCLUSION_TIER.L0]: 1,
    [INCLUSION_TIER.L1]: 1,
    [INCLUSION_TIER.L2]: 1,
    [INCLUSION_TIER.L3]: 0,
  },
  guard: null,
};

const stubCompilationId = "00000000-0000-7000-8000-000000000050" as UUIDv7;

describe("createCompileHandler", () => {
  it("createCompileHandler with deps", async () => {
    const written: TelemetryEvent[] = [];
    const mockRunner: CompilationRunner = {
      async run() {
        return {
          compiledPrompt: "prompt",
          meta: stubMeta,
          compilationId: stubCompilationId,
        };
      },
    };
    const mockTelemetryStore = {
      write(event: TelemetryEvent) {
        written.push(event);
      },
    };
    const mockClock = {
      now: (): ISOTimestamp => "2026-01-01T12:00:00.000Z" as ISOTimestamp,
      addMinutes: (_m: number): ISOTimestamp =>
        "2026-01-01T12:00:00.000Z" as ISOTimestamp,
      durationMs: (): Milliseconds => 0 as Milliseconds,
    };
    const mockIdGenerator = {
      generate: (): UUIDv7 => "00000000-0000-7000-8000-000000000000" as UUIDv7,
    };
    const mockStringHasher = { hash: (input: string) => `hash-${input}` };
    const telemetryDeps: TelemetryDeps = {
      telemetryStore: mockTelemetryStore,
      clock: mockClock,
      idGenerator: mockIdGenerator,
      stringHasher: mockStringHasher,
    };
    const sessionId = toSessionId("018c3d4e-0000-7000-8000-000000000010");
    const handler = createCompileHandler(
      mockRunner,
      telemetryDeps,
      sessionId,
      () => EDITOR_ID.GENERIC,
    );
    await handler(
      {
        intent: "fix bug",
        projectRoot: "/tmp/proj",
        modelId: null,
        editorId: "generic",
        configPath: null,
      },
      undefined,
    );
    expect(written.length).toBe(1);
    const event = written[0];
    expect(event).toBeDefined();
    if (event !== undefined) {
      expect(event.compilationId).toBe(stubCompilationId);
      expect(event.guardBlockedCount).toBe(0);
      expect(event.guardFindingsCount).toBe(0);
    }
  });
});
