// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, beforeAll, afterEach, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { toSessionId, toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { createMcpServer, registerShutdownHandler } from "../server.js";
import { openDatabase, closeDatabase } from "@jatbas/aic-core/storage/open-database.js";
import { SystemClock } from "@jatbas/aic-core/adapters/system-clock.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { STOP_REASON } from "@jatbas/aic-core/core/types/enums.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";
import { createProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import { ensureAicDir } from "@jatbas/aic-core/storage/ensure-aic-dir.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

type McpServerWithClose = ReturnType<typeof createMcpServer>;

describe("MCP server", () => {
  let tmpDir: string;
  let server: McpServerWithClose | undefined;

  beforeAll(() => {
    process.setMaxListeners(32);
    // Remove stale temp dirs from previous killed test runs
    const home = os.homedir();
    const entries = fs.readdirSync(home);
    for (const entry of entries) {
      if (entry.startsWith("aic-mcp-")) {
        fs.rmSync(path.join(home, entry), { recursive: true, force: true });
      }
    }
  });

  afterEach(() => {
    if (typeof (server as { close?(): void })?.close === "function") {
      (server as { close(): void }).close();
      server = undefined;
    }
    if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("list_tools", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.listTools();
    expect(result.tools).toBeDefined();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("aic_compile");
    expect(names).toContain("aic_inspect");
    expect(names).toContain("aic_chat_summary");
  });

  it("status_resource_returns_json", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.readResource({ uri: "aic://status" });
    expect(result.contents).toHaveLength(1);
    const first = result.contents[0];
    expect(first?.mimeType).toBe("application/json");
    const text: string =
      first && "text" in first && typeof first.text === "string" ? first.text : "{}";
    const parsed = JSON.parse(text) as {
      compilationsTotal?: number;
      compilationsToday?: number;
      lastCompilation?: unknown;
    };
    expect(typeof parsed["compilationsTotal"]).toBe("number");
    expect(typeof parsed["compilationsToday"]).toBe("number");
    expect(
      parsed.lastCompilation === null || typeof parsed.lastCompilation === "object",
    ).toBe(true);
  });

  it("status_resource_empty_db", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.readResource({ uri: "aic://status" });
    const first = result.contents[0];
    const rawText: string =
      first && "text" in first && typeof first.text === "string" ? first.text : "{}";
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    expect(parsed["compilationsTotal"]).toBe(0);
    const expectedKeys = [
      "compilationsTotal",
      "compilationsToday",
      "cacheHitRatePct",
      "guardByType",
      "topTaskClasses",
      "lastCompilation",
      "installationOk",
      "installationNotes",
      "totalTokensRaw",
      "totalTokensCompiled",
      "budgetMaxTokens",
      "budgetUtilizationPct",
      "updateAvailable",
      "installScope",
      "installScopeWarnings",
      "projectEnabled",
    ];
    for (const key of expectedKeys) {
      expect(Object.prototype.hasOwnProperty.call(parsed, key)).toBe(true);
    }
    expect(Array.isArray(parsed["installScopeWarnings"])).toBe(true);
  });

  it("status_resource_disabled_shows_projectEnabled_false", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    fs.writeFileSync(path.join(tmpDir, "aic.config.json"), '{"enabled": false}', "utf8");
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.readResource({ uri: "aic://status" });
    const first = result.contents[0];
    const rawText: string =
      first && "text" in first && typeof first.text === "string" ? first.text : "{}";
    const parsed = JSON.parse(rawText) as { projectEnabled?: boolean };
    expect(parsed.projectEnabled).toBe(false);
  });

  it("status_resource_includes_updateAvailable", async () => {
    const registryJson = JSON.stringify({ "dist-tags": { latest: "99.0.0" } });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(registryJson)),
    });
    try {
      tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
      const clock = new SystemClock();
      const db = openDatabase(":memory:", clock);
      server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
      const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
      await server.connect(transportServer);
      const client = new Client({ name: "test", version: "1.0" });
      await client.connect(transportClient);
      await new Promise<void>((r) => setTimeout(r, 150));
      const result = await client.readResource({ uri: "aic://status" });
      const first = result.contents[0];
      const rawText: string =
        first && "text" in first && typeof first.text === "string" ? first.text : "{}";
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      expect(parsed["updateAvailable"]).toBe("99.0.0");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("last_resource_returns_json", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    await client.callTool({
      name: "aic_compile",
      arguments: { intent: "fix bug", projectRoot: tmpDir },
    });
    const result = await client.readResource({ uri: "aic://last" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0]?.mimeType).toBe("application/json");
    const text: string =
      result.contents[0] &&
      "text" in result.contents[0] &&
      typeof result.contents[0].text === "string"
        ? result.contents[0].text
        : "{}";
    const parsed = JSON.parse(text) as {
      compilationCount: number;
      lastCompilation: {
        intent: string;
        filesSelected: number;
        filesTotal: number;
        tokensCompiled: number;
        tokenReductionPct: number;
        created_at: string;
        editorId: string;
        modelId: string | null;
      } | null;
      promptSummary: { tokenCount: number | null; guardPassed: null };
    };
    expect(parsed.compilationCount).toBeGreaterThanOrEqual(1);
    expect(parsed.lastCompilation).not.toBeNull();
    expect(parsed["promptSummary"]).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(parsed, "compiledPrompt")).toBe(false);
    if (parsed.lastCompilation !== null) {
      expect(parsed.lastCompilation.intent).toBe("fix bug");
      expect(typeof parsed.lastCompilation.filesSelected).toBe("number");
      expect(typeof parsed.lastCompilation.filesTotal).toBe("number");
      expect(typeof parsed.lastCompilation.tokensCompiled).toBe("number");
      expect(typeof parsed.lastCompilation.tokenReductionPct).toBe("number");
      expect(typeof parsed.lastCompilation.created_at).toBe("string");
      expect(typeof parsed.lastCompilation.editorId).toBe("string");
      expect(
        parsed.lastCompilation.modelId === null ||
          typeof parsed.lastCompilation.modelId === "string",
      ).toBe(true);
    }
  });

  it("aic_last_no_compiled_prompt", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.readResource({ uri: "aic://last" });
    const first = result.contents[0];
    const rawText: string =
      first && "text" in first && typeof first.text === "string" ? first.text : "{}";
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    expect(parsed["promptSummary"]).toBeDefined();
    expect(
      parsed["promptSummary"] !== null &&
        typeof parsed["promptSummary"] === "object" &&
        "tokenCount" in parsed["promptSummary"],
    ).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "compiledPrompt")).toBe(false);
  });

  it("last_resource_empty_db", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.readResource({ uri: "aic://last" });
    const first = result.contents[0];
    const rawText: string =
      first && "text" in first && typeof first.text === "string" ? first.text : "{}";
    const parsed = JSON.parse(rawText) as {
      compilationCount: number;
      lastCompilation: null;
      promptSummary: { tokenCount: number | null; guardPassed: null };
    };
    expect(parsed.compilationCount).toBe(0);
    expect(parsed.lastCompilation).toBeNull();
    expect(parsed["promptSummary"]).toBeDefined();
    expect("tokenCount" in parsed["promptSummary"]).toBe(true);
    expect("guardPassed" in parsed["promptSummary"]).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "compiledPrompt")).toBe(false);
  });

  it("valid_args_returns_compiled_prompt", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_compile",
      arguments: { intent: "fix bug", projectRoot: tmpDir },
    });
    type ContentItem = { type: string; text?: string };
    const raw = (result as { content?: ContentItem[] }).content;
    const content: ContentItem[] = Array.isArray(raw) ? raw : [];
    const text = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");
    expect(text.length).toBeGreaterThan(0);
    expect((result as { isError?: boolean }).isError).not.toBe(true);
    const parsed = JSON.parse(text) as { conversationId: string | null };
    expect(parsed.conversationId).toBeNull();
  });

  it("mcp_accepts_optional_trigger_source", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_compile",
      arguments: {
        intent: "fix bug",
        projectRoot: tmpDir,
        triggerSource: "session_start",
      },
    });
    type ContentItem = { type: string; text?: string };
    const raw = (result as { content?: ContentItem[] }).content;
    const content: ContentItem[] = Array.isArray(raw) ? raw : [];
    const text = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");
    expect(text.length).toBeGreaterThan(0);
    expect((result as { isError?: boolean }).isError).not.toBe(true);
  });

  it("aic_chat_summary_tool_returns_json_when_compilations_exist", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const conversationId = "conv-test-summary";
    await client.callTool({
      name: "aic_compile",
      arguments: {
        intent: "fix bug",
        projectRoot: tmpDir,
        conversationId,
      },
    });
    const result = await client.callTool({
      name: "aic_chat_summary",
      arguments: { conversationId },
    });
    type ContentItem = { type: string; text?: string };
    const raw = (result as { content?: ContentItem[] }).content;
    const content: ContentItem[] = Array.isArray(raw) ? raw : [];
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe("text");
    const text =
      content[0] && "text" in content[0] && typeof content[0].text === "string"
        ? content[0].text
        : "{}";
    const parsed = JSON.parse(text) as { compilationsInConversation: number };
    expect(parsed.compilationsInConversation).toBeGreaterThanOrEqual(1);
  });

  it("aic_chat_summary_tool_returns_zero_when_no_compilations", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_chat_summary",
      arguments: { conversationId: "conv-unknown-no-rows" },
    });
    type ContentItem = { type: string; text?: string };
    const raw = (result as { content?: ContentItem[] }).content;
    const content: ContentItem[] = Array.isArray(raw) ? raw : [];
    const text = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");
    const parsed = JSON.parse(text) as {
      compilationsInConversation: number;
      lastCompilationInConversation: null;
    };
    expect(parsed.compilationsInConversation).toBe(0);
    expect(parsed.lastCompilationInConversation).toBeNull();
  });

  it("aic_chat_summary_omitted_conversation_id_ignores_file", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    fs.mkdirSync(path.join(tmpDir, ".aic"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".aic", "conversation-id"),
      "conv-omit-file-test",
      "utf8",
    );
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_chat_summary",
      arguments: {},
    });
    type ContentItem = { type: string; text?: string };
    const raw = (result as { content?: ContentItem[] }).content;
    const content: ContentItem[] = Array.isArray(raw) ? raw : [];
    const text = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");
    const parsed = JSON.parse(text) as {
      compilationsInConversation: number;
      conversationId: string;
    };
    expect(parsed.compilationsInConversation).toBe(0);
    expect(parsed.conversationId).toBe("");
  });

  it("aic_chat_summary_omitted_conversation_id_no_file_returns_zero", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_chat_summary",
      arguments: {},
    });
    type ContentItem = { type: string; text?: string };
    const raw = (result as { content?: ContentItem[] }).content;
    const content: ContentItem[] = Array.isArray(raw) ? raw : [];
    const text = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");
    const parsed = JSON.parse(text) as {
      compilationsInConversation: number;
      conversationId: string;
    };
    expect(parsed.compilationsInConversation).toBe(0);
    expect(parsed.conversationId).toBe("");
  });

  it("invalid_args_returns_32602", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    await expect(
      client.callTool({ name: "aic_compile", arguments: {} }),
    ).rejects.toThrow();
  });

  it("aic_inspect_invalid_params", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    await expect(
      client.callTool({ name: "aic_inspect", arguments: {} }),
    ).rejects.toThrow();
  });

  it("aic_chat_summary_catch_returns_internal_error", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    // Invalid type triggers parse error, handler catch returns McpError InternalError
    await expect(
      client.callTool({
        name: "aic_chat_summary",
        arguments: { conversationId: 123 },
      }),
    ).rejects.toThrow();
  });

  it("aic_inspect_returns_trace", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_inspect",
      arguments: { intent: "refactor auth", projectRoot: tmpDir },
    });
    type ContentItem = { type: string; text?: string };
    const raw = (result as { content?: ContentItem[] }).content;
    const content: ContentItem[] = Array.isArray(raw) ? raw : [];
    const text = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");
    const parsed = JSON.parse(text) as { trace: { intent: string } };
    expect(parsed.trace.intent).toBe("refactor auth");
  });

  it("idempotency", () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const projectRoot = toAbsolutePath(tmpDir);
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    const normaliser = new NodePathAdapter();
    let _scope1: ReturnType<typeof createProjectScope> | undefined;
    let _scope2: ReturnType<typeof createProjectScope> | undefined;
    expect(() => {
      _scope1 = createProjectScope(projectRoot, normaliser, db, clock);
    }).not.toThrow();
    expect(() => {
      _scope2 = createProjectScope(projectRoot, normaliser, db, clock);
    }).not.toThrow();
    closeDatabase(db);
  });

  it("permissions", () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    ensureAicDir(toAbsolutePath(tmpDir));
    const aicPath = path.join(tmpDir, ".aic");
    const mode = fs.statSync(aicPath).mode & 0o777;
    expect(mode).toBe(0o700);
  });

  it("shutdown_handler_calls_stopSession_with_graceful", () => {
    const mockSessionTracker = {
      startSession: vi.fn(),
      stopSession: vi.fn(),
      backfillCrashedSessions: vi.fn(),
    };
    const mockCacheStore = {
      get: vi.fn(),
      set: vi.fn(),
      invalidate: vi.fn(),
      invalidateAll: vi.fn(),
      purgeExpired: vi.fn(),
    };
    const fixedTs = toISOTimestamp("2026-02-28T12:00:00.000Z");
    const mockClock = {
      now: (): typeof fixedTs => fixedTs,
      addMinutes: (_m: number): typeof fixedTs => fixedTs,
      durationMs: (_s: typeof fixedTs, _e: typeof fixedTs) => toMilliseconds(0),
    };
    const sessionId = toSessionId("019504a0-0000-7000-8000-000000000000");
    const handler = registerShutdownHandler(
      mockSessionTracker,
      sessionId,
      mockClock,
      mockCacheStore,
    );
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as (code?: string | number | null) => never);
    handler();
    expect(mockCacheStore.purgeExpired).toHaveBeenCalledTimes(1);
    expect(mockSessionTracker.stopSession).toHaveBeenCalledTimes(1);
    expect(mockSessionTracker.stopSession).toHaveBeenCalledWith(
      sessionId,
      fixedTs,
      STOP_REASON.GRACEFUL,
    );
    exitSpy.mockRestore();
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  });

  it("server_sessions_row_has_integrity", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const projectRoot = toAbsolutePath(tmpDir);
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(projectRoot, db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const scope = createProjectScope(projectRoot, new NodePathAdapter(), db, clock);
    const rows = scope.db
      .prepare(
        "SELECT session_id, installation_ok, installation_notes FROM server_sessions ORDER BY started_at DESC LIMIT 1",
      )
      .all() as readonly {
      session_id: string;
      installation_ok: number | null;
      installation_notes: string | null;
    }[];
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) expect.fail("expected one row");
    expect(row.session_id).toBeDefined();
    expect(row.installation_ok === 0 || row.installation_ok === 1).toBe(true);
    expect(typeof row.installation_notes === "string").toBe(true);
  });
});
