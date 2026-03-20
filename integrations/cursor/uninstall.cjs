// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  parseKeepAicDatabase,
  tryCleanGlobalAicDir,
} = require("../clean-global-aic-dir.cjs");
const {
  resolveProjectRoot: resolveProjectRootShared,
} = require("../shared/resolve-project-root.cjs");

const manifestPath = path.join(__dirname, "aic-hook-scripts.json");
const AIC_SCRIPT_NAMES = JSON.parse(
  fs.readFileSync(manifestPath, "utf8"),
).hookScriptNames;

function findAicMcpKey(servers) {
  if (servers === undefined || typeof servers !== "object" || servers === null) {
    return undefined;
  }
  return Object.keys(servers).find((k) => k.toLowerCase() === "aic");
}

function tryStripMcp(mcpPath) {
  try {
    if (!fs.existsSync(mcpPath)) return false;
    const obj = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    if (typeof obj !== "object" || obj === null) return false;
    let changed = false;
    const next = { ...obj };
    if (Object.prototype.hasOwnProperty.call(next, "aic")) {
      delete next.aic;
      changed = true;
    }
    const servers = next.mcpServers;
    if (servers && typeof servers === "object") {
      const aicKey = findAicMcpKey(servers);
      if (aicKey !== undefined) {
        const nextServers = { ...servers };
        delete nextServers[aicKey];
        next.mcpServers = nextServers;
        changed = true;
      }
    }
    if (!changed) return false;
    fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
    fs.writeFileSync(mcpPath, JSON.stringify(next, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

function isAicScriptEntry(entry) {
  const m = (entry.command ?? "").match(/AIC-[a-z0-9-]+\.cjs/);
  const scriptName = m ? m[0] : undefined;
  if (scriptName === undefined) return false;
  return AIC_SCRIPT_NAMES.includes(scriptName);
}

function tryCleanProjectHooks(projectRoot) {
  const projectHooksDir = path.join(projectRoot, ".cursor", "hooks");
  const hooksJsonPath = path.join(projectRoot, ".cursor", "hooks.json");
  const triggerPath = path.join(projectRoot, ".cursor", "rules", "AIC.mdc");
  let removed = false;
  try {
    if (fs.existsSync(hooksJsonPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
        const hooks = data.hooks || {};
        const nextHooks = {};
        const hooksChanged = Object.keys(hooks).reduce((acc, key) => {
          const arr = hooks[key];
          if (!Array.isArray(arr)) {
            nextHooks[key] = arr;
            return acc;
          }
          const filtered = arr.filter((e) => !isAicScriptEntry(e));
          nextHooks[key] = filtered;
          return acc || filtered.length !== arr.length;
        }, false);
        if (hooksChanged) {
          data.hooks = nextHooks;
          fs.writeFileSync(hooksJsonPath, JSON.stringify(data, null, 2) + "\n", "utf8");
          removed = true;
        }
      } catch {
        // Invalid hooks.json; still attempt file removals below
      }
    }
    for (const name of AIC_SCRIPT_NAMES) {
      try {
        const p = path.join(projectHooksDir, name);
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          removed = true;
        }
      } catch {
        // Best effort
      }
    }
    try {
      if (fs.existsSync(triggerPath)) {
        fs.unlinkSync(triggerPath);
        removed = true;
      }
    } catch {
      // Best effort
    }
  } catch {
    // Best effort
  }
  return removed;
}

function projectRootFromArgv() {
  const argv = process.argv;
  const idx = argv.findIndex(
    (a) => a === "--project-root" || a.startsWith("--project-root="),
  );
  if (idx === -1) return null;
  const arg = argv[idx];
  const eq = arg.indexOf("=");
  if (eq !== -1) return path.resolve(arg.slice(eq + 1));
  if (idx + 1 < argv.length) return path.resolve(argv[idx + 1]);
  return null;
}

function run() {
  const home = os.homedir();
  const globalMcpPath = path.join(home, ".cursor", "mcp.json");
  const envRoot =
    process.env.AIC_UNINSTALL_PROJECT_ROOT != null &&
    String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim() !== ""
      ? path.resolve(String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim())
      : null;
  const projectRoot =
    projectRootFromArgv() ??
    envRoot ??
    resolveProjectRootShared(null, { env: process.env, useAicProjectRoot: true });
  const projectMcpPath = path.join(projectRoot, ".cursor", "mcp.json");
  const removedGlobalMcp = tryStripMcp(globalMcpPath);
  const removedProjectMcp = tryStripMcp(projectMcpPath);
  const removedProjectHooks = tryCleanProjectHooks(projectRoot);
  const keepDb = parseKeepAicDatabase(process.argv, process.env);
  const globalAic = tryCleanGlobalAicDir(home, keepDb);
  const changed =
    removedGlobalMcp || removedProjectMcp || removedProjectHooks || globalAic.changed;
  if (!changed) {
    process.stdout.write("Nothing to remove. No need to restart Cursor.\n");
    return;
  }
  const parts = [];
  if (removedGlobalMcp) {
    parts.push("Removed AIC from ~/.cursor/mcp.json.");
  }
  if (removedProjectMcp) {
    parts.push("Removed AIC from this project's Cursor MCP config.");
  }
  if (removedProjectHooks) {
    parts.push("Removed AIC hooks and trigger rule from this project.");
  }
  if (globalAic.message) {
    parts.push(globalAic.message);
  }
  parts.push("Restart Cursor to complete uninstall.");
  process.stdout.write(parts.join(" ") + "\n");
}

run();
