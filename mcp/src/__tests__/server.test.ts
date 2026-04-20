// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, beforeAll, beforeEach, afterEach, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { pathToFileURL } from "node:url";
import { toSessionId, toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import {
  createMcpServer,
  notifyListRootsBootstrapFetchFailed,
  processListedWorkspaceRootsForBootstrap,
  registerShutdownHandler,
} from "../server.js";
import { BOOTSTRAP_INTEGRATION } from "../editor-integration-dispatch.js";
import { openDatabase, closeDatabase } from "@jatbas/aic-core/storage/open-database.js";
import { SystemClock } from "@jatbas/aic-core/adapters/system-clock.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { EDITOR_ID, STOP_REASON } from "@jatbas/aic-core/core/types/enums.js";
import { NodePathAdapter } from "@jatbas/aic-core/adapters/node-path-adapter.js";
import { createProjectScope } from "@jatbas/aic-core/storage/create-project-scope.js";
import { ensureAicDir } from "@jatbas/aic-core/storage/ensure-aic-dir.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import { toAbsolutePath, toFilePath } from "@jatbas/aic-core/core/types/paths.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

type McpServerWithClose = ReturnType<typeof createMcpServer>;

describe("MCP server", () => {
  let tmpDir: string;
  let server: McpServerWithClose | undefined;
  let realFetch: typeof globalThis.fetch;

  beforeAll(() => {
    process.setMaxListeners(32);
    realFetch = globalThis.fetch;
    const home = os.homedir();
    const entries = fs.readdirSync(home);
    for (const entry of entries) {
      if (entry.startsWith("aic-mcp-")) {
        fs.rmSync(path.join(home, entry), { recursive: true, force: true });
      }
    }
  });

  beforeEach(() => {
    // prevent setImmediate version-check from hitting the real npm registry
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
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
    expect(names).toContain("aic_projects");
    expect(names).toContain("aic_status");
    expect(names).toContain("aic_last");
    expect(names).toContain("aic_model_test");
    expect(names).toContain("aic_compile_spec");
    expect(names).toContain("aic_quality_report");
    const byName = Object.fromEntries(result.tools.map((t) => [t.name, t]));
    const readOnlyTools = [
      "aic_projects",
      "aic_status",
      "aic_last",
      "aic_quality_report",
    ] as const;
    for (const n of readOnlyTools) {
      expect(byName[n]?.annotations).toEqual({ readOnlyHint: true });
    }
    const writesTelemetryTools = [
      "aic_compile",
      "aic_compile_spec",
      "aic_inspect",
      "aic_model_test",
      "aic_chat_summary",
    ] as const;
    for (const n of writesTelemetryTools) {
      expect(byName[n]?.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
      });
    }
    for (const tool of result.tools) {
      expect(tool.inputSchema).not.toHaveProperty("$schema");
    }
  });

  it("server_tools_json_unchanged", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const statusResult = await client.callTool({ name: "aic_status", arguments: {} });
    const statusContent = (statusResult as { content?: { text?: string }[] }).content;
    const statusText = Array.isArray(statusContent)
      ? statusContent.map((c) => c?.text ?? "").join("")
      : "";
    expect(() => JSON.parse(statusText || "{}")).not.toThrow();
    const lastResult = await client.callTool({ name: "aic_last", arguments: {} });
    const lastContent = (lastResult as { content?: { text?: string }[] }).content;
    const lastText = Array.isArray(lastContent)
      ? lastContent.map((c) => c?.text ?? "").join("")
      : "";
    expect(() => JSON.parse(lastText || "{}")).not.toThrow();
    const projectsResult = await client.callTool({ name: "aic_projects", arguments: {} });
    const projectsContent = (projectsResult as { content?: { text?: string }[] }).content;
    const projectsText = Array.isArray(projectsContent)
      ? projectsContent.map((c) => c?.text ?? "").join("")
      : "";
    expect(() => JSON.parse(projectsText || "[]")).not.toThrow();
    const qualityResult = await client.callTool({
      name: "aic_quality_report",
      arguments: {},
    });
    const qualityContent = (qualityResult as { content?: { text?: string }[] }).content;
    const qualityText = Array.isArray(qualityContent)
      ? qualityContent.map((c) => c?.text ?? "").join("")
      : "";
    expect(() => JSON.parse(qualityText || "{}")).not.toThrow();
  });

  it("aic_quality_report_returns_json", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({ name: "aic_quality_report", arguments: {} });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as {
      windowDays?: number;
      compilations?: number;
    };
    expect(parsed.windowDays).toBe(7);
    expect(typeof parsed.compilations).toBe("number");
  });

  it("aic_status_accepts_timeRangeDays", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_status",
      arguments: { timeRangeDays: 90 },
    });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as {
      timeRangeDays?: number;
      compilationsTotal?: unknown;
    };
    expect(parsed.timeRangeDays).toBe(90);
    expect(typeof parsed.compilationsTotal).toBe("number");
  });

  it("aic_status_disabled_shows_projectEnabled_false", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    fs.writeFileSync(path.join(tmpDir, "aic.config.json"), '{"enabled": false}', "utf8");
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({ name: "aic_status", arguments: {} });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as { projectEnabled?: boolean };
    expect(parsed["projectEnabled"]).toBe(false);
  });

  it("aic_status_includes_updateAvailable", async () => {
    const registryJson = JSON.stringify({ "dist-tags": { latest: "99.0.0" } });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "application/json" : null,
      },
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(registryJson)),
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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
      const result = await client.callTool({ name: "aic_status", arguments: {} });
      const content = (result as { content?: { text?: string }[] }).content;
      const text = Array.isArray(content)
        ? content.map((c) => c?.text ?? "").join("")
        : "";
      const parsed = JSON.parse(text || "{}") as Record<string, unknown>;
      expect(parsed["updateAvailable"]).toBe("99.0.0");
      expect(parsed["updateMessage"]).toBe(
        "A newer AIC version (99.0.0) is available. Run `rm -rf ~/.npm/_npx` then reload Cursor to update.",
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("list_roots_bootstrap_fetch_failed_writes_signal", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      notifyListRootsBootstrapFetchFailed();
      const matched = stderrSpy.mock.calls.some((call) => {
        const chunk = call[0];
        return (
          typeof chunk === "string" &&
          chunk.includes("[aic] bootstrap") &&
          chunk.includes("list_roots_failed")
        );
      });
      expect(matched).toBe(true);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("list_roots_bootstrap_skipped_does_not_emit_throw_message", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const mod = await import("../install-trigger-rule.js");
    const triggerSpy = vi.spyOn(mod, "installTriggerRule").mockImplementation(() => {
      throw new ConfigError("aic-fake-bootstrap-leak-token");
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      processListedWorkspaceRootsForBootstrap(
        [{ uri: pathToFileURL(rootDir).href }],
        toFilePath(os.homedir()),
        () => EDITOR_ID.GENERIC,
        BOOTSTRAP_INTEGRATION.NONE,
      );
      const combined = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(combined).toContain("root_processing_skipped");
      expect(combined).not.toContain("aic-fake-bootstrap-leak-token");
    } finally {
      stderrSpy.mockRestore();
      triggerSpy.mockRestore();
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("list_roots_bootstrap_invalid_uri_writes_skipped_signal", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      processListedWorkspaceRootsForBootstrap(
        [{ uri: "not-a-valid-file-url" }],
        toFilePath(os.homedir()),
        () => EDITOR_ID.GENERIC,
        BOOTSTRAP_INTEGRATION.NONE,
      );
      const combined = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(combined).toContain("root_processing_skipped");
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("aic_last_after_compile_returns_json", async () => {
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
    const result = await client.callTool({ name: "aic_last", arguments: {} });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as {
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
      selection: { selectedFiles: unknown; excludedFiles: unknown } | null;
    };
    const assertNoResolvedContentKey = (value: unknown): void => {
      if (value === null || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(assertNoResolvedContentKey);
        return;
      }
      expect(Object.prototype.hasOwnProperty.call(value, "resolvedContent")).toBe(false);
      Object.values(value).forEach(assertNoResolvedContentKey);
    };
    expect(parsed["compilationCount"]).toBeGreaterThanOrEqual(1);
    expect(parsed["lastCompilation"]).not.toBeNull();
    expect(parsed["promptSummary"]).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(parsed, "compiledPrompt")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(parsed, "selection")).toBe(true);
    expect(parsed["selection"]).not.toBeUndefined();
    const selectionPayload = parsed["selection"];
    expect(selectionPayload).not.toBeNull();
    if (selectionPayload !== null) {
      expect(Array.isArray(selectionPayload.selectedFiles)).toBe(true);
      const ex = selectionPayload.excludedFiles;
      expect(Array.isArray(ex)).toBe(true);
      if (Array.isArray(ex)) {
        expect(ex.length).toBeLessThanOrEqual(50);
      }
      assertNoResolvedContentKey(selectionPayload);
    }
    if (parsed["lastCompilation"] !== null) {
      expect(parsed["lastCompilation"].intent).toBe("fix bug");
      expect(typeof parsed["lastCompilation"].filesSelected).toBe("number");
      expect(typeof parsed["lastCompilation"].filesTotal).toBe("number");
      expect(typeof parsed["lastCompilation"].tokensCompiled).toBe("number");
      expect(typeof parsed["lastCompilation"].tokenReductionPct).toBe("number");
      expect(typeof parsed["lastCompilation"].created_at).toBe("string");
      expect(typeof parsed["lastCompilation"].editorId).toBe("string");
      expect(
        parsed["lastCompilation"].modelId === null ||
          typeof parsed["lastCompilation"].modelId === "string",
      ).toBe(true);
    }
  });

  it("aic_last_empty_db_has_promptSummary", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({ name: "aic_last", arguments: {} });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as Record<string, unknown>;
    expect(parsed["promptSummary"]).toBeDefined();
    expect(
      parsed["promptSummary"] !== null &&
        typeof parsed["promptSummary"] === "object" &&
        "tokenCount" in (parsed["promptSummary"] as object),
    ).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "compiledPrompt")).toBe(false);
    expect(parsed["selection"] === null || typeof parsed["selection"] === "object").toBe(
      true,
    );
  });

  it("aic_status_global_with_breakdown", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const tmpDir2 = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    await client.callTool({
      name: "aic_compile",
      arguments: { intent: "first project", projectRoot: tmpDir },
    });
    await client.callTool({
      name: "aic_compile",
      arguments: { intent: "second project", projectRoot: tmpDir2 },
    });
    const result = await client.callTool({ name: "aic_status", arguments: {} });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as { projectsBreakdown?: unknown[] };
    expect(parsed["projectsBreakdown"]).toBeDefined();
    expect(Array.isArray(parsed["projectsBreakdown"])).toBe(true);
    expect(parsed["projectsBreakdown"]).toHaveLength(2);
    if (tmpDir2 !== undefined && fs.existsSync(tmpDir2)) {
      fs.rmSync(tmpDir2, { recursive: true, force: true });
    }
  });

  it("aic_last_scoped_by_conversation", async () => {
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
      arguments: {
        intent: "scoped intent",
        projectRoot: tmpDir,
        conversationId: "conv-scoped-last",
      },
    });
    const result = await client.callTool({ name: "aic_last", arguments: {} });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as {
      lastCompilation: { intent: string } | null;
    };
    expect(parsed["lastCompilation"]).not.toBeNull();
    if (parsed["lastCompilation"] !== null) {
      expect(parsed["lastCompilation"].intent).toBe("scoped intent");
    }
  });

  it("aic_chat_summary_includes_projectRoot", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const compileResult = await client.callTool({
      name: "aic_compile",
      arguments: {
        intent: "chat summary test",
        projectRoot: tmpDir,
        conversationId: "conv-project-root",
      },
    });
    const compileContent = (compileResult as { content?: { text?: string }[] }).content;
    const compileText = Array.isArray(compileContent)
      ? compileContent.map((c) => c?.text ?? "").join("")
      : "";
    const compileParsed = JSON.parse(compileText || "{}") as {
      conversationId: string | null;
    };
    const convId = compileParsed.conversationId ?? "conv-project-root";
    const summaryResult = await client.callTool({
      name: "aic_chat_summary",
      arguments: { conversationId: convId },
    });
    const summaryContent = (summaryResult as { content?: { text?: string }[] }).content;
    const summaryText = Array.isArray(summaryContent)
      ? summaryContent.map((c) => c?.text ?? "").join("")
      : "";
    const summaryParsed = JSON.parse(summaryText || "{}") as {
      projectRoot?: string;
    };
    expect(Object.prototype.hasOwnProperty.call(summaryParsed, "projectRoot")).toBe(true);
    expect(typeof summaryParsed.projectRoot).toBe("string");
    expect(summaryParsed.projectRoot).toBe(tmpDir);
  });

  it("aic_projects_returns_list", async () => {
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
      arguments: { intent: "ensure project", projectRoot: tmpDir },
    });
    const result = await client.callTool({
      name: "aic_projects",
      arguments: {},
    });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const list = JSON.parse(text || "[]") as unknown[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    const first = list[0] as {
      projectId?: string;
      projectRoot?: string;
      compilationCount?: number;
    };
    expect(first).toBeDefined();
    expect(typeof first?.projectId).toBe("string");
    expect(typeof first?.projectRoot).toBe("string");
    expect(typeof first?.compilationCount).toBe("number");
  });

  it("aic_status returns project summary", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_status",
      arguments: {},
    });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(parsed, "compilationsTotal")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "budgetMaxTokens")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "projectEnabled")).toBe(true);
    expect(typeof parsed["compilationsTotal"]).toBe("number");
    expect(typeof parsed["budgetMaxTokens"]).toBe("number");
    expect(typeof parsed["projectEnabled"]).toBe("boolean");
  });

  it("aic_last returns last compilation", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_last",
      arguments: {},
    });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as {
      compilationCount?: number;
      lastCompilation?: unknown;
    };
    expect(Object.prototype.hasOwnProperty.call(parsed, "compilationCount")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(parsed, "lastCompilation")).toBe(true);
    expect(typeof parsed["compilationCount"]).toBe("number");
    expect(
      parsed["lastCompilation"] === null || typeof parsed["lastCompilation"] === "object",
    ).toBe(true);
  });

  it("aic_status with no compilations", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.callTool({
      name: "aic_status",
      arguments: {},
    });
    const content = (result as { content?: { text?: string }[] }).content;
    const text = Array.isArray(content) ? content.map((c) => c?.text ?? "").join("") : "";
    const parsed = JSON.parse(text || "{}") as {
      compilationsTotal?: number;
      lastCompilation?: unknown;
    };
    expect(parsed["compilationsTotal"]).toBe(0);
    expect(parsed["lastCompilation"]).toBeNull();
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
    const structured = (result as { structuredContent?: unknown }).structuredContent;
    expect(structured).toEqual(parsed);
  });

  it("aic_compile_spec_returns_structured_content_matching_text_json", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const specResult = await client.callTool({
      name: "aic_compile_spec",
      arguments: {
        spec: { types: [], codeBlocks: [], prose: [] },
      },
    });
    type ContentItem = { type: string; text?: string };
    const raw = (specResult as { content?: ContentItem[] }).content;
    const content: ContentItem[] = Array.isArray(raw) ? raw : [];
    const specText = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");
    const specParsed = JSON.parse(specText) as Record<string, unknown>;
    expect((specResult as { structuredContent?: unknown }).structuredContent).toEqual(
      specParsed,
    );
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
    const result = await client.callTool({
      name: "aic_compile",
      arguments: { intent: 123 },
    });
    expect(result.isError).toBe(true);
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
    const result = await client.callTool({ name: "aic_inspect", arguments: {} });
    expect(result.isError).toBe(true);
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
    const result = await client.callTool({
      name: "aic_chat_summary",
      arguments: { conversationId: 123 },
    });
    expect(result.isError).toBe(true);
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

  it("shutdown_handler_closes_runner_cache_entries", () => {
    const mockClose = vi.fn();
    const cache = new Map<
      string,
      { runner: unknown; closeable: { close: () => void } }
    >();
    cache.set("/fake/path", {
      runner: {},
      closeable: { close: mockClose },
    });
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
      cache as Parameters<typeof registerShutdownHandler>[4],
    );
    vi.spyOn(process, "exit").mockImplementation((() => {}) as (
      code?: string | number | null,
    ) => never);
    handler();
    expect(mockClose).toHaveBeenCalledTimes(1);
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  });

  it("getRunner_evicts_oldest_and_closes_when_at_capacity", async () => {
    const { WatchingRepoMapSupplier } =
      await import("@jatbas/aic-core/adapters/watching-repo-map-supplier.js");
    const closeSpy = vi.spyOn(WatchingRepoMapSupplier.prototype, "close");
    const tmpDirs: string[] = [];
    for (let i = 0; i < 11; i++) {
      tmpDirs.push(fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-")));
    }
    try {
      const firstDir = tmpDirs[0];
      if (firstDir === undefined) expect.fail("tmpDirs[0]");
      const clock = new SystemClock();
      const db = openDatabase(":memory:", clock);
      server = createMcpServer(toAbsolutePath(firstDir), db, clock);
      const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
      await server.connect(transportServer);
      const client = new Client({ name: "test", version: "1.0" });
      await client.connect(transportClient);
      for (let i = 0; i < 11; i++) {
        const root = tmpDirs[i];
        if (root === undefined) expect.fail("tmpDirs[i]");
        await client.callTool({
          name: "aic_compile",
          arguments: { intent: "eviction test", projectRoot: root },
        });
      }
      expect(closeSpy).toHaveBeenCalled();
    } finally {
      closeSpy.mockRestore();
      for (const dir of tmpDirs) {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("server_close_closes_runner_cache_entries", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), "aic-mcp-"));
    const { WatchingRepoMapSupplier } =
      await import("@jatbas/aic-core/adapters/watching-repo-map-supplier.js");
    const closeSpy = vi.spyOn(WatchingRepoMapSupplier.prototype, "close");
    const clock = new SystemClock();
    const db = openDatabase(":memory:", clock);
    server = createMcpServer(toAbsolutePath(tmpDir), db, clock);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    await client.callTool({
      name: "aic_compile",
      arguments: { intent: "fix watcher leak", projectRoot: tmpDir },
    });
    (server as { close(): void }).close();
    expect(closeSpy).toHaveBeenCalled();
    closeSpy.mockRestore();
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
