// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createCompileHandler } from "../compile-handler.js";
import {
  toSessionId,
  toISOTimestamp,
  toUUIDv7,
  toProjectId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import {
  type AbsolutePath,
  type FilePath,
  toAbsolutePath,
} from "@jatbas/aic-core/core/types/paths.js";
import { EDITOR_ID } from "@jatbas/aic-core/core/types/enums.js";
import { defaultResolvedConfig } from "@jatbas/aic-core/core/types/resolved-config.js";
import type { ConfigLoader } from "@jatbas/aic-core/core/interfaces/config-loader.interface.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";
import { STUB_COMPILATION_META } from "@jatbas/aic-core/testing/stub-compilation-meta.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";

function mockScopeForHandler(
  clock: Clock,
  idGenerator: { generate: () => ReturnType<typeof toUUIDv7> },
  projectRoot: AbsolutePath = toAbsolutePath("/tmp/mock"),
): ProjectScope {
  const db = {
    exec: (): void => {},
    prepare: (_sql: string) => ({
      run: (): void => {},
      all: (): unknown[] => [],
    }),
  };
  return {
    db,
    clock,
    idGenerator,
    normaliser: new NodePathAdapter(),
    projectRoot,
    projectId: toProjectId("018f0000-0000-7000-8000-000000000001"),
    cacheStore: {} as ProjectScope["cacheStore"],
    telemetryStore: { write: vi.fn() } as ProjectScope["telemetryStore"],
    configStore: {} as ProjectScope["configStore"],
    guardStore: {} as ProjectScope["guardStore"],
    compilationLogStore: {} as ProjectScope["compilationLogStore"],
    sessionTracker: {} as ProjectScope["sessionTracker"],
    fileTransformStore: {} as ProjectScope["fileTransformStore"],
  };
}

describe("compile-handler", () => {
  beforeAll(() => {
    const home = os.homedir();
    const prefixes = [
      "aic-compile-test-",
      "aic-compile-auto-init-",
      "tmp-aic-timeout-test",
    ];
    const entries = fs.readdirSync(home);
    for (const entry of entries) {
      if (prefixes.some((p) => entry.startsWith(p))) {
        fs.rmSync(path.join(home, entry), { recursive: true, force: true });
      }
    }
  });

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
    const getSessionId = (): ReturnType<typeof toSessionId> =>
      toSessionId("00000000-0000-7000-8000-000000000002");
    const getEditorId = () => EDITOR_ID.GENERIC;
    const getModelId = (): string | null => null;
    const projectRoot = path.join(os.homedir(), "tmp-aic-timeout-test");
    const scope = mockScopeForHandler(mockClock, mockIdGenerator);
    const handler = createCompileHandler(
      (_projectRoot: AbsolutePath) => scope,
      (_scope: ProjectScope) => neverResolvingRunner,
      { hash: (): string => "" },
      getSessionId,
      getEditorId,
      getModelId,
      null,
      [],
      enabledConfigLoader,
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

  const enabledConfigLoader: ConfigLoader = {
    load: () => ({ config: defaultResolvedConfig() }),
  };

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
    const scope = mockScopeForHandler(mockClock, mockIdGenerator);
    const getScope = (_projectRoot: AbsolutePath) => scope;
    const getSessionId = (): ReturnType<typeof toSessionId> =>
      toSessionId("00000000-0000-7000-8000-000000000002");
    const getEditorId = () => EDITOR_ID.GENERIC;
    const getModelId = (): string | null => null;
    return {
      mockClock,
      mockIdGenerator,
      getScope,
      getSessionId,
      getEditorId,
      getModelId,
    };
  }

  it("response_includes_conversation_id_when_provided", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeSuccessRunner("compiled"),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        null,
        [],
        enabledConfigLoader,
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
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeSuccessRunner("compiled"),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        null,
        [],
        enabledConfigLoader,
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

  it("compile_handler_disabled_returns_message_no_db_writes", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const runCalls: unknown[] = [];
      const mockRunner = {
        run: (req: unknown): Promise<never> => {
          runCalls.push(req);
          return Promise.resolve({
            compiledPrompt: "never",
            meta: STUB_COMPILATION_META,
            compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
          } as never);
        },
      };
      const mockConfigLoader: ConfigLoader = {
        load: (_projectRoot: AbsolutePath, _configPath: FilePath | null) => ({
          config: { ...defaultResolvedConfig(), enabled: false },
        }),
      };
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => mockRunner,
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        null,
        [],
        mockConfigLoader,
      );
      const result = await handler(
        { intent: "test", projectRoot: tmpDir, modelId: null, configPath: null },
        undefined,
      );
      const items = result.content as readonly { type: string; text: string }[];
      const first = items[0];
      const parsed = JSON.parse(first!.text) as { compiledPrompt: string };
      expect(parsed.compiledPrompt).toContain("AIC is disabled for this project");
      expect(parsed.compiledPrompt).toContain('"enabled": true');
      expect(runCalls).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("auto_init_creates_config_and_aic_dir_when_project_has_no_config", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-auto-init-"));
    try {
      expect(fs.existsSync(path.join(tmpDir, "aic.config.json"))).toBe(false);
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeSuccessRunner("compiled"),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        null,
        [],
        enabledConfigLoader,
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
