// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { upgradeGlobalMcpConfigIfNeeded } from "../upgrade-global-mcp-config-if-needed.js";

function ensureCursorDir(homeDir: string): string {
  const cursorDir = path.join(homeDir, ".cursor");
  fs.mkdirSync(cursorDir, { recursive: true });
  return cursorDir;
}

function readMcpJson(homeDir: string): unknown {
  const configPath = path.join(homeDir, ".cursor", "mcp.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw) as unknown;
}

describe("upgradeGlobalMcpConfigIfNeeded", () => {
  let homeDir: string;

  afterEach(() => {
    if (homeDir !== undefined && fs.existsSync(homeDir)) {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("rewrites_args_when_global_config_has_npx_aic_without_latest", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-upgrade-"));
    ensureCursorDir(homeDir);
    const config = {
      mcpServers: {
        aic: { command: "npx", args: ["-y", "@jatbas/aic"] },
      },
    };
    fs.writeFileSync(
      path.join(homeDir, ".cursor", "mcp.json"),
      JSON.stringify(config, null, 2),
    );
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const result = upgradeGlobalMcpConfigIfNeeded(homeDir);
    const parsed = readMcpJson(homeDir) as { mcpServers?: { aic?: { args?: string[] } } };
    expect(parsed.mcpServers?.aic?.args).toEqual(["-y", "@jatbas/aic@latest"]);
    expect(result).toBe(true);
    expect(stderrSpy).toHaveBeenCalledWith(
      "[aic] Updated ~/.cursor/mcp.json to use @jatbas/aic@latest. Reload Cursor to use the new version.\n",
    );
    stderrSpy.mockRestore();
  });

  it("skips_when_args_already_contain_latest", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-upgrade-"));
    ensureCursorDir(homeDir);
    const config = {
      mcpServers: {
        aic: { command: "npx", args: ["-y", "@jatbas/aic@latest"] },
      },
    };
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(path.join(homeDir, ".cursor", "mcp.json"), content);
    const result = upgradeGlobalMcpConfigIfNeeded(homeDir);
    const raw = fs.readFileSync(path.join(homeDir, ".cursor", "mcp.json"), "utf8");
    expect(raw).toBe(content);
    expect(result).toBe(false);
  });

  it("skips_when_pinned_version", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-upgrade-"));
    ensureCursorDir(homeDir);
    const config = {
      mcpServers: {
        aic: { command: "npx", args: ["-y", "@jatbas/aic@0.6.3"] },
      },
    };
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(path.join(homeDir, ".cursor", "mcp.json"), content);
    const result = upgradeGlobalMcpConfigIfNeeded(homeDir);
    const raw = fs.readFileSync(path.join(homeDir, ".cursor", "mcp.json"), "utf8");
    expect(raw).toBe(content);
    expect(result).toBe(false);
  });

  it("skips_when_command_not_npx", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-upgrade-"));
    ensureCursorDir(homeDir);
    const config = {
      mcpServers: {
        aic: { command: "tsx", args: ["mcp/src/server.ts"] },
      },
    };
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(path.join(homeDir, ".cursor", "mcp.json"), content);
    const result = upgradeGlobalMcpConfigIfNeeded(homeDir);
    const raw = fs.readFileSync(path.join(homeDir, ".cursor", "mcp.json"), "utf8");
    expect(raw).toBe(content);
    expect(result).toBe(false);
  });

  it("skips_when_no_aic_entry", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-upgrade-"));
    ensureCursorDir(homeDir);
    const config = { mcpServers: { other: {} } };
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(path.join(homeDir, ".cursor", "mcp.json"), content);
    const result = upgradeGlobalMcpConfigIfNeeded(homeDir);
    const raw = fs.readFileSync(path.join(homeDir, ".cursor", "mcp.json"), "utf8");
    expect(raw).toBe(content);
    expect(result).toBe(false);
  });

  it("skips_when_file_missing", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-upgrade-"));
    const result = upgradeGlobalMcpConfigIfNeeded(homeDir);
    expect(result).toBe(false);
    const configPath = path.join(homeDir, ".cursor", "mcp.json");
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("skips_when_invalid_json", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-upgrade-"));
    ensureCursorDir(homeDir);
    const badContent = "not valid json {";
    fs.writeFileSync(path.join(homeDir, ".cursor", "mcp.json"), badContent);
    const result = upgradeGlobalMcpConfigIfNeeded(homeDir);
    expect(result).toBe(false);
    const raw = fs.readFileSync(path.join(homeDir, ".cursor", "mcp.json"), "utf8");
    expect(raw).toBe(badContent);
  });
});
