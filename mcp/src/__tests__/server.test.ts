import { describe, it, afterEach, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { toSessionId, toISOTimestamp } from "@aic/shared/core/types/identifiers.js";
import { createMcpServer, registerShutdownHandler } from "../server.js";
import { toMilliseconds } from "@aic/shared/core/types/units.js";
import { STOP_REASON } from "@aic/shared/core/types/enums.js";
import { createProjectScope } from "@aic/shared/storage/create-project-scope.js";
import { ensureAicDir } from "@aic/shared/storage/ensure-aic-dir.js";
import { toAbsolutePath } from "@aic/shared/core/types/paths.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe("MCP server", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir !== undefined && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("list_tools", async () => {
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"));
    const server = createMcpServer(toAbsolutePath(tmpDir));
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const result = await client.listTools();
    expect(result.tools).toBeDefined();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("aic_compile");
    expect(names).toContain("aic_inspect");
  });

  it("valid_args_returns_compiled_prompt", async () => {
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"));
    const server = createMcpServer(toAbsolutePath(tmpDir));
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
  });

  it("mcp_accepts_optional_trigger_source", async () => {
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"));
    const server = createMcpServer(toAbsolutePath(tmpDir));
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

  it("invalid_args_returns_32602", async () => {
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"));
    const server = createMcpServer(toAbsolutePath(tmpDir));
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    await expect(
      client.callTool({ name: "aic_compile", arguments: {} }),
    ).rejects.toThrow();
  });

  it("aic_inspect_invalid_params", async () => {
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"));
    const server = createMcpServer(toAbsolutePath(tmpDir));
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    await expect(
      client.callTool({ name: "aic_inspect", arguments: {} }),
    ).rejects.toThrow();
  });

  it("aic_inspect_returns_trace", async () => {
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"));
    const server = createMcpServer(toAbsolutePath(tmpDir));
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
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"));
    const projectRoot = toAbsolutePath(tmpDir);
    expect(() => createProjectScope(projectRoot)).not.toThrow();
    expect(() => createProjectScope(projectRoot)).not.toThrow();
  });

  it("permissions", () => {
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"));
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
    const fixedTs = toISOTimestamp("2026-02-28T12:00:00.000Z");
    const mockClock = {
      now: (): typeof fixedTs => fixedTs,
      addMinutes: (_m: number): typeof fixedTs => fixedTs,
      durationMs: (_s: typeof fixedTs, _e: typeof fixedTs) => toMilliseconds(0),
    };
    const sessionId = toSessionId("019504a0-0000-7000-8000-000000000000");
    const handler = registerShutdownHandler(mockSessionTracker, sessionId, mockClock);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as (code?: string | number | null) => never);
    handler();
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
    tmpDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "aic-mcp-"));
    const projectRoot = toAbsolutePath(tmpDir);
    const server = createMcpServer(projectRoot);
    const [transportServer, transportClient] = InMemoryTransport.createLinkedPair();
    await server.connect(transportServer);
    const client = new Client({ name: "test", version: "1.0" });
    await client.connect(transportClient);
    const scope = createProjectScope(projectRoot);
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
