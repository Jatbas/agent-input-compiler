// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import * as initProject from "../../init-project.js";
import { createCompileHandler } from "../compile-handler.js";
import {
  toSessionId,
  toISOTimestamp,
  toUUIDv7,
  toProjectId,
  toConversationId,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toPercentage } from "@jatbas/aic-core/core/types/scores.js";
import {
  type AbsolutePath,
  type FilePath,
  toAbsolutePath,
  toRelativePath,
} from "@jatbas/aic-core/core/types/paths.js";
import {
  EDITOR_ID,
  GUARD_SEVERITY,
  GUARD_FINDING_TYPE,
  TASK_CLASS,
} from "@jatbas/aic-core/core/types/enums.js";
import type {
  CompilationMeta,
  CompilationRequest,
} from "@jatbas/aic-core/core/types/compilation-types.js";
import { defaultResolvedConfig } from "@jatbas/aic-core/core/types/resolved-config.js";
import type { ConfigLoader } from "@jatbas/aic-core/core/interfaces/config-loader.interface.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";
import { STUB_COMPILATION_META } from "@jatbas/aic-core/testing/stub-compilation-meta.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import { openDatabase } from "@jatbas/aic-core/storage/open-database.js";
import { createProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";

function mockScopeForHandler(
  clock: Clock,
  idGenerator: { generate: () => ReturnType<typeof toUUIDv7> },
  projectRoot: AbsolutePath = toAbsolutePath("/tmp/mock"),
): ProjectScope {
  const db = {
    exec: (): void => {},
    prepare: (_sql: string) => ({
      run: (): void => {},
      get: (): unknown => undefined,
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
    vi.restoreAllMocks();
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
      [],
      enabledConfigLoader,
      () => {},
      () => null,
      () => false,
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

  function makeRunnerWithMeta(compiledPrompt: string, meta: CompilationMeta) {
    return {
      run: () =>
        Promise.resolve({
          compiledPrompt,
          meta,
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

  it("prompt_log_written_after_successful_compile", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const expectedPrompt = "expected prompt content";
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeSuccessRunner(expectedPrompt),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      await handler(
        {
          intent: "test",
          projectRoot: tmpDir,
          modelId: null,
          configPath: null,
        },
        undefined,
      );
      const logPath = path.join(tmpDir, ".aic", "last-compiled-prompt.txt");
      expect(fs.existsSync(logPath)).toBe(true);
      expect(fs.readFileSync(logPath, "utf8")).toBe(expectedPrompt);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

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
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
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
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
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
        [],
        mockConfigLoader,
        () => {},
        () => null,
        () => false,
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

  it("init_runs_once_per_project", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      vi.spyOn(initProject, "ensureProjectInit");
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeSuccessRunner("compiled"),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      await handler(
        { intent: "test", projectRoot: tmpDir, modelId: null, configPath: null },
        undefined,
      );
      await handler(
        { intent: "test", projectRoot: tmpDir, modelId: null, configPath: null },
        undefined,
      );
      expect(initProject.ensureProjectInit).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("init_runs_for_each_distinct_project", async () => {
    const tmpDirA = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    const tmpDirB = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      vi.spyOn(initProject, "ensureProjectInit");
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeSuccessRunner("compiled"),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      await handler(
        {
          intent: "test",
          projectRoot: tmpDirA,
          modelId: null,
          configPath: null,
        },
        undefined,
      );
      await handler(
        {
          intent: "test",
          projectRoot: tmpDirB,
          modelId: null,
          configPath: null,
        },
        undefined,
      );
      expect(initProject.ensureProjectInit).toHaveBeenCalledTimes(2);
    } finally {
      fs.rmSync(tmpDirA, { recursive: true, force: true });
      fs.rmSync(tmpDirB, { recursive: true, force: true });
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
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
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

  it("sanitise_overlong_modelId", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const runCalls: CompilationRequest[] = [];
      const captureRunner = {
        run: (req: CompilationRequest) => {
          runCalls.push(req);
          return Promise.resolve({
            compiledPrompt: "ok",
            meta: STUB_COMPILATION_META,
            compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
          });
        },
      };
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => captureRunner,
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      await handler(
        {
          intent: "test",
          projectRoot: tmpDir,
          modelId: "a".repeat(257),
          configPath: null,
        },
        undefined,
      );
      expect(runCalls).toHaveLength(1);
      expect(runCalls[0]!.modelId).toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("sanitise_invalid_editorId", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const runCalls: CompilationRequest[] = [];
      const captureRunner = {
        run: (req: CompilationRequest) => {
          runCalls.push(req);
          return Promise.resolve({
            compiledPrompt: "ok",
            meta: STUB_COMPILATION_META,
            compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
          });
        },
      };
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => captureRunner,
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      await handler(
        {
          intent: "test",
          projectRoot: tmpDir,
          modelId: null,
          configPath: null,
          editorId: "unknown",
        },
        undefined,
      );
      expect(runCalls).toHaveLength(1);
      expect(runCalls[0]!.editorId).toBe(EDITOR_ID.GENERIC);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("sanitise_valid_passthrough", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const runCalls: CompilationRequest[] = [];
      const captureRunner = {
        run: (req: CompilationRequest) => {
          runCalls.push(req);
          return Promise.resolve({
            compiledPrompt: "ok",
            meta: STUB_COMPILATION_META,
            compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
          });
        },
      };
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => captureRunner,
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      await handler(
        {
          intent: "test",
          projectRoot: tmpDir,
          modelId: "claude-3-5-sonnet",
          configPath: null,
          conversationId: "valid-cid",
          editorId: "cursor",
        },
        undefined,
      );
      expect(runCalls).toHaveLength(1);
      const req = runCalls[0]!;
      expect(req.modelId).toBe("claude-3-5-sonnet");
      expect(req.editorId).toBe(EDITOR_ID.CURSOR);
      expect(req.conversationId).toBe(toConversationId("valid-cid"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const EXCLUSION_INSTRUCTION =
    "Do not attempt to read excluded or redacted files (e.g. .env, secrets) directly via editor tools. Use only the context provided below.";

  it("meta_guard_strips_file_paths", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const guardMeta: CompilationMeta = {
        ...STUB_COMPILATION_META,
        guard: {
          passed: false,
          findings: [
            {
              severity: GUARD_SEVERITY.BLOCK,
              type: GUARD_FINDING_TYPE.SECRET,
              file: toRelativePath("path/to/.env"),
              message: "secret",
            },
          ],
          filesBlocked: [toRelativePath("path/to/.env")],
          filesRedacted: [],
          filesWarned: [],
        },
      };
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeRunnerWithMeta("body", guardMeta),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      const result = await handler(
        { intent: "test", projectRoot: tmpDir, modelId: null, configPath: null },
        undefined,
      );
      const items = result.content as readonly { type: string; text: string }[];
      const parsed = JSON.parse(items[0]!.text) as {
        meta: {
          guard: { filesBlocked: unknown[]; findings: readonly { file?: unknown }[] };
        };
      };
      expect(parsed.meta.guard.filesBlocked).toHaveLength(0);
      expect(parsed.meta.guard.findings[0]).not.toHaveProperty("file");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("exclusion_instruction_prepended_when_guard_excluded", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const guardMeta: CompilationMeta = {
        ...STUB_COMPILATION_META,
        guard: {
          passed: false,
          findings: [],
          filesBlocked: [toRelativePath("x")],
          filesRedacted: [],
          filesWarned: [],
        },
      };
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeRunnerWithMeta("body", guardMeta),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      const result = await handler(
        { intent: "test", projectRoot: tmpDir, modelId: null, configPath: null },
        undefined,
      );
      const items = result.content as readonly { type: string; text: string }[];
      const parsed = JSON.parse(items[0]!.text) as { compiledPrompt: string };
      expect(parsed.compiledPrompt).toContain(EXCLUSION_INSTRUCTION);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("no_instruction_when_guard_passed", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const guardMeta: CompilationMeta = {
        ...STUB_COMPILATION_META,
        guard: {
          passed: true,
          findings: [],
          filesBlocked: [],
          filesRedacted: [],
          filesWarned: [],
        },
      };
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeRunnerWithMeta("body", guardMeta),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      const result = await handler(
        { intent: "test", projectRoot: tmpDir, modelId: null, configPath: null },
        undefined,
      );
      const items = result.content as readonly { type: string; text: string }[];
      const parsed = JSON.parse(items[0]!.text) as { compiledPrompt: string };
      expect(parsed.compiledPrompt).not.toContain(EXCLUSION_INSTRUCTION);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("no_instruction_when_guard_null", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
    try {
      const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
      const handler = createCompileHandler(
        getScope,
        (_scope: ProjectScope) => makeSuccessRunner("body"),
        { hash: (): string => "" },
        getSessionId,
        getEditorId,
        getModelId,
        [],
        enabledConfigLoader,
        () => {},
        () => null,
        () => false,
      );
      const result = await handler(
        { intent: "test", projectRoot: tmpDir, modelId: null, configPath: null },
        undefined,
      );
      const items = result.content as readonly { type: string; text: string }[];
      const parsed = JSON.parse(items[0]!.text) as { compiledPrompt: string };
      expect(parsed.compiledPrompt).not.toContain(EXCLUSION_INSTRUCTION);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe("malicious cache inputs", () => {
    function setupMaliciousCache(
      tmpDir: string,
      jsonlLine: string,
    ): (projectRoot: AbsolutePath) => ProjectScope {
      const aicDir = path.join(tmpDir, ".aic");
      fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        path.join(aicDir, "session-models.jsonl"),
        jsonlLine + "\n",
        "utf8",
      );
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
      return (projectRoot: AbsolutePath) =>
        mockScopeForHandler(mockClock, mockIdGenerator, projectRoot);
    }

    it("malicious_cache_overlong_modelId_rejected", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        const overlong = "a".repeat(257);
        const line = JSON.stringify({
          c: "",
          m: overlong,
          e: "generic",
          timestamp: "2026-01-01T00:00:00.000Z",
        });
        const getScope = setupMaliciousCache(tmpDir, line);
        const runCalls: CompilationRequest[] = [];
        const captureRunner = {
          run: (req: CompilationRequest) => {
            runCalls.push(req);
            return Promise.resolve({
              compiledPrompt: "ok",
              meta: STUB_COMPILATION_META,
              compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
            });
          },
        };
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.GENERIC;
        const getModelId = (): string | null => null;
        const handler = createCompileHandler(
          getScope,
          (_scope: ProjectScope) => captureRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
          },
          undefined,
        );
        expect(runCalls).toHaveLength(1);
        expect(runCalls[0]!.modelId).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("malicious_cache_control_char_in_modelId_rejected", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        const line = JSON.stringify({
          c: "",
          m: "a\x00b",
          e: "generic",
          timestamp: "2026-01-01T00:00:00.000Z",
        });
        const getScope = setupMaliciousCache(tmpDir, line);
        const runCalls: CompilationRequest[] = [];
        const captureRunner = {
          run: (req: CompilationRequest) => {
            runCalls.push(req);
            return Promise.resolve({
              compiledPrompt: "ok",
              meta: STUB_COMPILATION_META,
              compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
            });
          },
        };
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.GENERIC;
        const getModelId = (): string | null => null;
        const handler = createCompileHandler(
          getScope,
          (_scope: ProjectScope) => captureRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
          },
          undefined,
        );
        expect(runCalls).toHaveLength(1);
        expect(runCalls[0]!.modelId).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("malicious_cache_nested_object_as_modelId_rejected", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        const line = JSON.stringify({
          c: "",
          m: { nested: true },
          e: "generic",
          timestamp: "2026-01-01T00:00:00.000Z",
        });
        const getScope = setupMaliciousCache(tmpDir, line);
        const runCalls: CompilationRequest[] = [];
        const captureRunner = {
          run: (req: CompilationRequest) => {
            runCalls.push(req);
            return Promise.resolve({
              compiledPrompt: "ok",
              meta: STUB_COMPILATION_META,
              compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
            });
          },
        };
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.GENERIC;
        const getModelId = (): string | null => null;
        const handler = createCompileHandler(
          getScope,
          (_scope: ProjectScope) => captureRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
          },
          undefined,
        );
        expect(runCalls).toHaveLength(1);
        expect(runCalls[0]!.modelId).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("malicious_cache_empty_modelId_rejected", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        const line = JSON.stringify({
          c: "",
          m: "",
          e: "generic",
          timestamp: "2026-01-01T00:00:00.000Z",
        });
        const getScope = setupMaliciousCache(tmpDir, line);
        const runCalls: CompilationRequest[] = [];
        const captureRunner = {
          run: (req: CompilationRequest) => {
            runCalls.push(req);
            return Promise.resolve({
              compiledPrompt: "ok",
              meta: STUB_COMPILATION_META,
              compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
            });
          },
        };
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.GENERIC;
        const getModelId = (): string | null => null;
        const handler = createCompileHandler(
          getScope,
          (_scope: ProjectScope) => captureRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
          },
          undefined,
        );
        expect(runCalls).toHaveLength(1);
        expect(runCalls[0]!.modelId).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("malicious_cache_missing_m_rejected", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        const line = JSON.stringify({
          c: "",
          e: "generic",
          timestamp: "2026-01-01T00:00:00.000Z",
        });
        const getScope = setupMaliciousCache(tmpDir, line);
        const runCalls: CompilationRequest[] = [];
        const captureRunner = {
          run: (req: CompilationRequest) => {
            runCalls.push(req);
            return Promise.resolve({
              compiledPrompt: "ok",
              meta: STUB_COMPILATION_META,
              compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
            });
          },
        };
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.GENERIC;
        const getModelId = (): string | null => null;
        const handler = createCompileHandler(
          getScope,
          (_scope: ProjectScope) => captureRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
          },
          undefined,
        );
        expect(runCalls).toHaveLength(1);
        expect(runCalls[0]!.modelId).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("malicious_cache_duplicate_keys_invalid_last_rejected", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        const overlong = "a".repeat(257);
        const line = JSON.stringify({
          c: "",
          m: "valid",
          e: "generic",
          timestamp: "2026-01-01T00:00:00.000Z",
        }).replace(/"valid"/, `"valid","m":"${overlong}"`);
        const getScope = setupMaliciousCache(tmpDir, line);
        const runCalls: CompilationRequest[] = [];
        const captureRunner = {
          run: (req: CompilationRequest) => {
            runCalls.push(req);
            return Promise.resolve({
              compiledPrompt: "ok",
              meta: STUB_COMPILATION_META,
              compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
            });
          },
        };
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.GENERIC;
        const getModelId = (): string | null => null;
        const handler = createCompileHandler(
          getScope,
          (_scope: ProjectScope) => captureRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
          },
          undefined,
        );
        expect(runCalls).toHaveLength(1);
        expect(runCalls[0]!.modelId).toBeNull();
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("model resolution integration", () => {
    function writeSessionModelsCache(
      tmpDir: string,
      m: string,
      c: string,
      e: string,
      timestamp?: string,
    ): void {
      const aicDir = path.join(tmpDir, ".aic");
      fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
      const line =
        JSON.stringify({
          m,
          c,
          e,
          timestamp: timestamp ?? "2026-01-01T00:00:00.000Z",
        }) + "\n";
      fs.writeFileSync(path.join(tmpDir, ".aic", "session-models.jsonl"), line, "utf8");
    }

    function createScopeWithRealDb(tmpDir: string): {
      scope: ProjectScope;
      projectId: ReturnType<typeof toProjectId>;
    } {
      const fixedTs = toISOTimestamp("2026-03-07T12:00:00.000Z");
      const clock = {
        now: (): typeof fixedTs => fixedTs,
        addMinutes: (_m: number): typeof fixedTs => fixedTs,
        durationMs: (_s: typeof fixedTs, _e: typeof fixedTs) => toMilliseconds(0),
      };
      const db = openDatabase(":memory:", clock);
      const scope = createProjectScope(
        toAbsolutePath(tmpDir),
        new NodePathAdapter(),
        db,
        clock,
      );
      return { scope, projectId: scope.projectId };
    }

    function createRecordingRunner(scope: ProjectScope): {
      run: (request: CompilationRequest) => Promise<{
        compiledPrompt: string;
        meta: CompilationMeta;
        compilationId: ReturnType<typeof toUUIDv7>;
      }>;
    } {
      return {
        run: (request: CompilationRequest) => {
          // sessionId null to avoid server_sessions FK in test DB
          const entry = {
            id: scope.idGenerator.generate(),
            intent: request.intent,
            taskClass: TASK_CLASS.GENERAL,
            filesSelected: 0,
            filesTotal: 0,
            tokensRaw: toTokenCount(0),
            tokensCompiled: toTokenCount(0),
            tokenReductionPct: toPercentage(0),
            cacheHit: false,
            durationMs: toMilliseconds(0),
            editorId: request.editorId,
            modelId: request.modelId ?? "",
            sessionId: null as ReturnType<typeof toSessionId> | null,
            configHash: null,
            createdAt: scope.clock.now(),
            conversationId: request.conversationId ?? null,
            triggerSource: null,
          };
          scope.compilationLogStore.record(entry);
          return Promise.resolve({
            compiledPrompt: "",
            meta: STUB_COMPILATION_META,
            compilationId: entry.id,
          });
        },
      };
    }

    it("cache_entry_cursor_editor_model_id_recorded_in_db", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        writeSessionModelsCache(tmpDir, "claude-sonnet-4", "conv-1", "cursor");
        const { scope, projectId } = createScopeWithRealDb(tmpDir);
        const getScope = (_projectRoot: AbsolutePath) => scope;
        const recordingRunner = createRecordingRunner(scope);
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.CURSOR;
        const getModelId = (): string | null => null;
        const handler = createCompileHandler(
          getScope,
          (_s: ProjectScope) => recordingRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
            conversationId: "conv-1",
          },
          undefined,
        );
        const rows = scope.db
          .prepare(
            "SELECT model_id FROM compilation_log WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
          )
          .all(projectId) as readonly { model_id: string }[];
        expect(rows).toHaveLength(1);
        expect(rows[0]!.model_id).toBe("claude-sonnet-4");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("cache_entry_claude_code_editor_model_id_recorded_in_db", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        writeSessionModelsCache(tmpDir, "claude-sonnet-4", "conv-1", "claude-code");
        const { scope, projectId } = createScopeWithRealDb(tmpDir);
        const getScope = (_projectRoot: AbsolutePath) => scope;
        const recordingRunner = createRecordingRunner(scope);
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.CLAUDE_CODE;
        const getModelId = (): string | null => null;
        const handler = createCompileHandler(
          getScope,
          (_s: ProjectScope) => recordingRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
            conversationId: "conv-1",
          },
          undefined,
        );
        const rows = scope.db
          .prepare(
            "SELECT model_id FROM compilation_log WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
          )
          .all(projectId) as readonly { model_id: string }[];
        expect(rows).toHaveLength(1);
        expect(rows[0]!.model_id).toBe("claude-sonnet-4");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("model_switch_mid_session", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        writeSessionModelsCache(tmpDir, "model-a", "conv-1", "cursor");
        const { scope, projectId } = createScopeWithRealDb(tmpDir);
        const getScope = (_projectRoot: AbsolutePath) => scope;
        const recordingRunner = createRecordingRunner(scope);
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.CURSOR;
        const getModelId = (): string | null => null;
        const handler = createCompileHandler(
          getScope,
          (_s: ProjectScope) => recordingRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
            conversationId: "conv-1",
          },
          undefined,
        );
        const secondLine =
          JSON.stringify({
            m: "model-b",
            c: "conv-1",
            e: "cursor",
            timestamp: "2026-01-01T00:00:00.000Z",
          }) + "\n";
        fs.appendFileSync(
          path.join(tmpDir, ".aic", "session-models.jsonl"),
          secondLine,
          "utf8",
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
            conversationId: "conv-1",
          },
          undefined,
        );
        const rows = scope.db
          .prepare(
            "SELECT model_id FROM compilation_log WHERE project_id = ? ORDER BY created_at ASC",
          )
          .all(projectId) as readonly { model_id: string }[];
        expect(rows).toHaveLength(2);
        expect(rows[0]!.model_id).toBe("model-a");
        expect(rows[1]!.model_id).toBe("model-b");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("empty_cache_defaults_to_detector", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        const { scope, projectId } = createScopeWithRealDb(tmpDir);
        const getScope = (_projectRoot: AbsolutePath) => scope;
        const recordingRunner = createRecordingRunner(scope);
        const getSessionId = (): ReturnType<typeof toSessionId> =>
          toSessionId("00000000-0000-7000-8000-000000000002");
        const getEditorId = () => EDITOR_ID.CURSOR;
        const getModelId = (): string => "auto";
        const handler = createCompileHandler(
          getScope,
          (_s: ProjectScope) => recordingRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "test",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
          },
          undefined,
        );
        const rows = scope.db
          .prepare(
            "SELECT model_id FROM compilation_log WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
          )
          .all(projectId) as readonly { model_id: string }[];
        expect(rows).toHaveLength(1);
        expect(rows[0]!.model_id).toBe("auto");
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("agentic_fields_forwarded_to_runner", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        const capturedRequests: CompilationRequest[] = [];
        const capturingRunner = {
          run: (req: CompilationRequest) => {
            capturedRequests.push(req);
            return Promise.resolve({
              compiledPrompt: "ok",
              meta: STUB_COMPILATION_META,
              compilationId: toUUIDv7("00000000-0000-7000-8000-000000000099"),
            });
          },
        };
        const { getScope, getSessionId, getEditorId, getModelId } = makeDeps();
        const handler = createCompileHandler(
          getScope,
          (_scope: ProjectScope) => capturingRunner,
          { hash: (): string => "" },
          getSessionId,
          getEditorId,
          getModelId,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "fix tests",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
            stepIndex: 2,
            stepIntent: "fix failing auth tests",
            conversationTokens: 4096,
            previousFiles: ["src/auth/service.ts"],
            toolOutputs: [
              {
                type: "test-result" as const,
                content: "3 failures in auth.test.ts",
                relatedFiles: ["src/auth/service.ts"],
              },
            ],
          },
          undefined,
        );
        expect(capturedRequests.length).toBe(1);
        const req = capturedRequests[0];
        expect(req).toBeDefined();
        if (req === undefined) return;
        expect(req.stepIndex).toBe(2);
        expect(req.stepIntent).toBe("fix failing auth tests");
        expect(req.conversationTokens).toBe(4096);
        expect(req.previousFiles).toEqual(["src/auth/service.ts"]);
        expect(req.toolOutputs).toHaveLength(1);
        const output = req.toolOutputs?.[0];
        expect(output?.type).toBe("test-result");
        expect(output?.content).toBe("3 failures in auth.test.ts");
        expect(output?.relatedFiles).toEqual(["src/auth/service.ts"]);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("fallback_intent_used_when_subagent_weak_intent_and_prior_non_general_exists", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-compile-test-"));
      try {
        const { scope } = createScopeWithRealDb(tmpDir);
        // Seed a prior non-general compilation for this conversation
        scope.db
          .prepare(
            `INSERT INTO compilation_log (id, intent, task_class, files_selected, files_total, tokens_raw, tokens_compiled, cache_hit, duration_ms, editor_id, model_id, created_at, project_id, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            toUUIDv7("018f0000-0000-7000-8000-000000000099"),
            "fix subagent intent fallback in compile handler",
            "bugfix",
            5,
            100,
            1000,
            500,
            0,
            100,
            "claude-code",
            null,
            toISOTimestamp("2026-01-01T10:00:00.000Z"),
            scope.projectId,
            "conv-fallback-test",
          );
        const capturedRequests: CompilationRequest[] = [];
        const capturingRunner = {
          run: (
            request: CompilationRequest,
          ): Promise<{
            compiledPrompt: string;
            meta: CompilationMeta;
            compilationId: ReturnType<typeof toUUIDv7>;
          }> => {
            capturedRequests.push(request);
            return Promise.resolve({
              compiledPrompt: "",
              meta: STUB_COMPILATION_META,
              compilationId: toUUIDv7("018f0000-0000-7000-8000-000000000001"),
            });
          },
        };
        const handler = createCompileHandler(
          (_projectRoot: AbsolutePath) => scope,
          (_s: ProjectScope) => capturingRunner,
          { hash: (): string => "" },
          () => toSessionId("00000000-0000-7000-8000-000000000002"),
          () => EDITOR_ID.CLAUDE_CODE,
          () => null,
          [],
          enabledConfigLoader,
          () => {},
          () => null,
          () => false,
        );
        await handler(
          {
            intent: "provide context for general-purpose subagent",
            projectRoot: tmpDir,
            modelId: null,
            configPath: null,
            conversationId: "conv-fallback-test",
          },
          undefined,
        );
        expect(capturedRequests).toHaveLength(1);
        expect(capturedRequests[0]!.intent).toBe(
          "fix subagent intent fallback in compile handler",
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
