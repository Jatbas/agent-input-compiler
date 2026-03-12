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

function hasAicEntry(configPath: string): boolean {
  if (!fs.existsSync(configPath)) return false;
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as {
      readonly mcpServers?: Readonly<Record<string, unknown>>;
    };
    const servers = parsed.mcpServers;
    if (servers === undefined) return false;
    return Object.keys(servers).some((k) => k.toLowerCase() === "aic");
  } catch {
    return false;
  }
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
