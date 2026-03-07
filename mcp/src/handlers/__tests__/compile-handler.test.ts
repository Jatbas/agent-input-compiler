import { describe, it, expect, vi, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createCompileHandler } from "../compile-handler.js";
import {
  toSessionId,
  toISOTimestamp,
  toUUIDv7,
} from "@aic/shared/core/types/identifiers.js";
import { toMilliseconds } from "@aic/shared/core/types/units.js";
import { EDITOR_ID } from "@aic/shared/core/types/enums.js";

describe("compile-handler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("compile_timeout_rejects_after_30s", async () => {
    vi.useFakeTimers();
    const neverResolvingRunner = {
      run: (): Promise<never> => new Promise(() => {}),
    };
    const fixedTs = toISOTimestamp("2026-03-07T12:00:00.000Z");
    const mockClock = {
      now: (): typeof fixedTs => fixedTs,
      addMinutes: (_m: number): typeof fixedTs => fixedTs,
      durationMs: (_s: typeof fixedTs, _e: typeof fixedTs) => toMilliseconds(0),
    };
    const mockIdGenerator = {
      generate: (): ReturnType<typeof toUUIDv7> =>
        toUUIDv7("00000000-0000-7000-8000-000000000001"),
    };
    const mockTelemetryDeps = {
      telemetryStore: { write: vi.fn() },
      clock: mockClock,
      idGenerator: mockIdGenerator,
      stringHasher: { hash: (): string => "" },
    };
    const getSessionId = (): ReturnType<typeof toSessionId> =>
      toSessionId("00000000-0000-7000-8000-000000000002");
    const getEditorId = () => EDITOR_ID.GENERIC;
    const getModelId = (): string | null => null;
    const projectRoot = path.join(os.homedir(), "tmp-aic-timeout-test");
    const handler = createCompileHandler(
      neverResolvingRunner,
      mockTelemetryDeps,
      getSessionId,
      getEditorId,
      getModelId,
      null,
      { record: vi.fn() },
      mockClock,
      mockIdGenerator,
    );
    const promise = handler(
      {
        intent: "fix bug",
        projectRoot,
        modelId: null,
        configPath: null,
      },
      undefined,
    );
    vi.advanceTimersByTime(30_000);
    await expect(promise).rejects.toThrow(McpError);
    try {
      await promise;
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe(ErrorCode.InternalError);
      expect((e as McpError).message).toContain("timed out");
    }
  });
});
