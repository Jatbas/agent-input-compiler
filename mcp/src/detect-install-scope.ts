// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";

export const INSTALL_SCOPE = {
  GLOBAL: "global",
  WORKSPACE: "workspace",
  BOTH: "both",
} as const;

export type InstallScope = (typeof INSTALL_SCOPE)[keyof typeof INSTALL_SCOPE];

type CursorMcpConfig = {
  readonly mcpServers?: Readonly<Record<string, unknown>>;
};

function readMcpConfig(
  configPath: string,
): { parsed: CursorMcpConfig; servers: Readonly<Record<string, unknown>> } | null {
  if (!fs.existsSync(configPath)) return null;
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as CursorMcpConfig;
    const servers = parsed.mcpServers;
    if (servers === undefined) return null;
    return { parsed, servers };
  } catch {
    return null;
  }
}

function hasAicEntry(configPath: string): boolean {
  const config = readMcpConfig(configPath);
  if (config === null) return false;
  return Object.keys(config.servers).some((k) => k.toLowerCase() === "aic");
}

export function detectInstallScope(homeDir: string, projectRoot: string): InstallScope {
  const globalConfigPath = path.join(homeDir, ".cursor", "mcp.json");
  const workspaceConfigPath = path.join(projectRoot, ".cursor", "mcp.json");
  const inGlobal = hasAicEntry(globalConfigPath);
  const inWorkspace = hasAicEntry(workspaceConfigPath);
  if (inGlobal && inWorkspace) return INSTALL_SCOPE.BOTH;
  if (inGlobal) return INSTALL_SCOPE.GLOBAL;
  return INSTALL_SCOPE.WORKSPACE;
}

export function removeWorkspaceAicEntry(projectRoot: string): boolean {
  const configPath = path.join(projectRoot, ".cursor", "mcp.json");
  const config = readMcpConfig(configPath);
  if (config === null) return false;
  const aicKey = Object.keys(config.servers).find((k) => k.toLowerCase() === "aic");
  if (aicKey === undefined) return false;
  try {
    const rest: Record<string, unknown> = {};
    for (const key of Object.keys(config.servers)) {
      if (key.toLowerCase() !== "aic") {
        rest[key] = config.servers[key];
      }
    }
    const updated = { ...config.parsed, mcpServers: rest };
    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}
