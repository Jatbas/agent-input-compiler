// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs";
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
import { STUB_COMPILATION_META } from "@aic/shared/testing/stub-compilation-meta.js";

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

  function makeSuccessRunner(compiledPrompt: string) {
    return {
      run: () =>
        Promise.resolve({
          compiledPrompt,
          meta: STUB_COMPILATION_META,
          compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
        }),
    };
  }

  function makeDeps() {
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
    return {
      mockClock,
      mockIdGenerator,
      mockTelemetryDeps,
      getSessionId,
      getEditorId,
      getModelId,
    };
  }

  it("response_includes_conversation_id_when_provided", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const {
        mockClock,
        mockIdGenerator,
        mockTelemetryDeps,
        getSessionId,
        getEditorId,
        getModelId,
      } = makeDeps();
      const handler = createCompileHandler(
        makeSuccessRunner("compiled"),
        mockTelemetryDeps,
        getSessionId,
        getEditorId,
        getModelId,
        null,
        { record: vi.fn() },
        mockClock,
        mockIdGenerator,
      );
      const result = await handler(
        {
          intent: "test",
          projectRoot: tmpDir,
          modelId: null,
          configPath: null,
          conversationId: "conv-echo-test",
        },
        undefined,
      );
      const items = result.content as readonly { type: string; text: string }[];
      const first = items[0]!;
      const parsed = JSON.parse(first.text) as { conversationId: string | null };
      expect(parsed.conversationId).toBe("conv-echo-test");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("response_includes_conversation_id_null_when_omitted", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const {
        mockClock,
        mockIdGenerator,
        mockTelemetryDeps,
        getSessionId,
        getEditorId,
        getModelId,
      } = makeDeps();
      const handler = createCompileHandler(
        makeSuccessRunner("compiled"),
        mockTelemetryDeps,
        getSessionId,
        getEditorId,
        getModelId,
        null,
        { record: vi.fn() },
        mockClock,
        mockIdGenerator,
      );
      const result = await handler(
        { intent: "test", projectRoot: tmpDir, modelId: null, configPath: null },
        undefined,
      );
      const items = result.content as readonly { type: string; text: string }[];
      const first = items[0]!;
      const parsed = JSON.parse(first.text) as { conversationId: string | null };
      expect(parsed.conversationId).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("auto_init_creates_config_and_aic_dir_when_project_has_no_config", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-auto-init-"));
    try {
      expect(fs.existsSync(path.join(tmpDir, "aic.config.json"))).toBe(false);
      const {
        mockClock,
        mockIdGenerator,
        mockTelemetryDeps,
        getSessionId,
        getEditorId,
        getModelId,
      } = makeDeps();
      const handler = createCompileHandler(
        makeSuccessRunner("compiled"),
        mockTelemetryDeps,
        getSessionId,
        getEditorId,
        getModelId,
        null,
        { record: vi.fn() },
        mockClock,
        mockIdGenerator,
      );
      await handler(
        { intent: "test", projectRoot: tmpDir, modelId: null, configPath: null },
        undefined,
      );
      expect(fs.existsSync(path.join(tmpDir, "aic.config.json"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".aic"))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
