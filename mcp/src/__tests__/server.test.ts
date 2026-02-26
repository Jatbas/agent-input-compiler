import { describe, it, afterEach, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createMcpServer, createProjectScope, ensureAicDir } from "../server.js";
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

  it("valid_args_returns_stub_content", async () => {
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
    const textParts = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text);
    const joined = textParts.join("");
    const parsed = JSON.parse(joined) as {
      compiledPrompt?: string;
      meta?: unknown;
    };
    expect(parsed.compiledPrompt).toBe("Not implemented");
    expect(parsed.meta).toBeDefined();
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
});
