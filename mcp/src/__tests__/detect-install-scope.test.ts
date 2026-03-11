// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  detectInstallScope,
  removeWorkspaceAicEntry,
  INSTALL_SCOPE,
} from "../detect-install-scope.js";

const AIC_CONFIG = JSON.stringify({
  mcpServers: { aic: { command: "npx", args: ["-y", "@jatbas/aic"] } },
});

function setupGlobalConfig(homeDir: string): void {
  const cursorDir = path.join(homeDir, ".cursor");
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(path.join(cursorDir, "mcp.json"), AIC_CONFIG);
}

function setupWorkspaceConfig(projectDir: string): void {
  const cursorDir = path.join(projectDir, ".cursor");
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(path.join(cursorDir, "mcp.json"), AIC_CONFIG);
}

describe("detectInstallScope", () => {
  let homeDir: string;
  let projectDir: string;

  afterEach(() => {
    if (homeDir !== undefined && fs.existsSync(homeDir)) {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
    if (projectDir !== undefined && projectDir !== homeDir && fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("returns_global_when_aic_in_global_config_only", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-home-"));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-proj-"));
    setupGlobalConfig(homeDir);
    expect(detectInstallScope(homeDir, projectDir)).toBe(INSTALL_SCOPE.GLOBAL);
  });

  it("returns_workspace_when_aic_in_workspace_config_only", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-home-"));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-proj-"));
    setupWorkspaceConfig(projectDir);
    expect(detectInstallScope(homeDir, projectDir)).toBe(INSTALL_SCOPE.WORKSPACE);
  });

  it("returns_both_when_aic_in_global_and_workspace", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-home-"));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-proj-"));
    setupGlobalConfig(homeDir);
    setupWorkspaceConfig(projectDir);
    expect(detectInstallScope(homeDir, projectDir)).toBe(INSTALL_SCOPE.BOTH);
  });

  it("returns_workspace_when_no_configs_exist", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-home-"));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-proj-"));
    expect(detectInstallScope(homeDir, projectDir)).toBe(INSTALL_SCOPE.WORKSPACE);
  });

  it("returns_workspace_when_global_config_has_no_aic", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-home-"));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-proj-"));
    const cursorDir = path.join(homeDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorDir, "mcp.json"),
      JSON.stringify({ mcpServers: { other: {} } }),
    );
    expect(detectInstallScope(homeDir, projectDir)).toBe(INSTALL_SCOPE.WORKSPACE);
  });

  it("returns_workspace_when_global_config_is_invalid_json", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-home-"));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-proj-"));
    const cursorDir = path.join(homeDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(path.join(cursorDir, "mcp.json"), "not json");
    expect(detectInstallScope(homeDir, projectDir)).toBe(INSTALL_SCOPE.WORKSPACE);
  });

  it("matches_aic_key_case_insensitively", () => {
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-home-"));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-scope-proj-"));
    const cursorDir = path.join(projectDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorDir, "mcp.json"),
      JSON.stringify({ mcpServers: { AIC: { command: "npx" } } }),
    );
    expect(detectInstallScope(homeDir, projectDir)).toBe(INSTALL_SCOPE.WORKSPACE);
  });
});

describe("removeWorkspaceAicEntry", () => {
  let projectDir: string;

  afterEach(() => {
    if (projectDir !== undefined && fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("removes_aic_entry_and_preserves_other_servers", () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-remove-"));
    const cursorDir = path.join(projectDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    const config = {
      mcpServers: { aic: { command: "npx" }, other: { command: "node" } },
    };
    fs.writeFileSync(path.join(cursorDir, "mcp.json"), JSON.stringify(config));
    const removed = removeWorkspaceAicEntry(projectDir);
    expect(removed).toBe(true);
    const result = JSON.parse(fs.readFileSync(path.join(cursorDir, "mcp.json"), "utf8"));
    expect(result.mcpServers).toStrictEqual({ other: { command: "node" } });
  });

  it("removes_aic_entry_case_insensitively", () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-remove-"));
    const cursorDir = path.join(projectDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorDir, "mcp.json"),
      JSON.stringify({ mcpServers: { AIC: { command: "npx" } } }),
    );
    const removed = removeWorkspaceAicEntry(projectDir);
    expect(removed).toBe(true);
    const result = JSON.parse(fs.readFileSync(path.join(cursorDir, "mcp.json"), "utf8"));
    expect(result.mcpServers).toStrictEqual({});
  });

  it("returns_false_when_no_config_file", () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-remove-"));
    expect(removeWorkspaceAicEntry(projectDir)).toBe(false);
  });

  it("returns_false_when_no_aic_entry", () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-remove-"));
    const cursorDir = path.join(projectDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorDir, "mcp.json"),
      JSON.stringify({ mcpServers: { other: {} } }),
    );
    expect(removeWorkspaceAicEntry(projectDir)).toBe(false);
  });

  it("returns_false_when_config_is_invalid_json", () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-remove-"));
    const cursorDir = path.join(projectDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(path.join(cursorDir, "mcp.json"), "not json");
    expect(removeWorkspaceAicEntry(projectDir)).toBe(false);
  });

  it("preserves_non_mcpServers_fields", () => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-remove-"));
    const cursorDir = path.join(projectDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    const config = { version: 2, mcpServers: { aic: { command: "npx" } }, extra: true };
    fs.writeFileSync(path.join(cursorDir, "mcp.json"), JSON.stringify(config));
    removeWorkspaceAicEntry(projectDir);
    const result = JSON.parse(fs.readFileSync(path.join(cursorDir, "mcp.json"), "utf8"));
    expect(result.version).toBe(2);
    expect(result.extra).toBe(true);
    expect(result.mcpServers).toStrictEqual({});
  });
});
