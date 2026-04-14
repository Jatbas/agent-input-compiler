// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// Resolves the AIC MCP server's runtime identifier within Cursor.
// Cursor assigns internal IDs like "project-0-AIC-aic-dev" or "user-aic"
// that differ from the config keys in .cursor/mcp.json ("aic-dev", "aic").

const fs = require("fs");
const path = require("path");
const os = require("os");

function toCursorProjectSlug(projectRoot) {
  return projectRoot.replace(/^\//, "").replace(/[^a-zA-Z0-9-]/g, "-");
}

function resolveAicServerId(projectRoot, options) {
  try {
    const cursorProjectsDir =
      options?.cursorProjectsDir ?? path.join(os.homedir(), ".cursor", "projects");
    const slug = toCursorProjectSlug(projectRoot);
    const mcpsDir = path.join(cursorProjectsDir, slug, "mcps");
    if (!fs.existsSync(mcpsDir)) return null;
    const entries = fs.readdirSync(mcpsDir, { withFileTypes: true });
    const matches = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const toolFile = path.join(mcpsDir, entry.name, "tools", "aic_compile.json");
      if (fs.existsSync(toolFile)) {
        matches.push(entry.name);
      }
    }
    if (matches.length === 0) return null;
    const projectLevel = matches.find((n) => n.startsWith("project-"));
    return projectLevel ?? matches[0];
  } catch {
    return null;
  }
}

module.exports = { resolveAicServerId, toCursorProjectSlug };
