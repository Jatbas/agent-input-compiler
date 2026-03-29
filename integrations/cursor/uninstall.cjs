// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  resolveGlobalKeepAicDatabase,
  tryCleanGlobalAicDir,
} = require("../clean-global-aic-dir.cjs");
const { tryUninstallGlobalClaude } = require("../shared/uninstall-global-claude.cjs");
const { tryUninstallProjectAic } = require("../shared/uninstall-project-aic.cjs");
const { isDevModeTrue } = require("../shared/read-project-dev-mode.cjs");
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

function parseKeepProjectArtifacts(argv) {
  return argv.includes("--keep-project-artifacts");
}

function run() {
  const argv = process.argv;
  const home = os.homedir();
  const globalCleanup = argv.includes("--global");
  const force = argv.includes("--force");
  const removeDatabase = argv.includes("--remove-database");
  const envRoot =
    process.env.AIC_UNINSTALL_PROJECT_ROOT != null &&
    String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim() !== ""
      ? path.resolve(String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim())
      : null;
  const projectRoot =
    projectRootFromArgv() ??
    envRoot ??
    resolveProjectRootShared(null, { env: process.env, useAicProjectRoot: true });
  const devMode = isDevModeTrue(projectRoot);
  if (devMode && !force) {
    process.stdout.write(
      "This is an AIC development project (devMode: true in aic.config.json). Skipping uninstall.\n",
    );
    process.exit(0);
    return;
  }
  if (force && devMode) {
    process.stdout.write("Force-uninstalling AIC development project.\n");
  }
  if (removeDatabase && !globalCleanup) {
    process.stderr.write(
      "Warning: --remove-database only applies with --global. Ignored.\n",
    );
  }
  const keepProjectArtifacts = parseKeepProjectArtifacts(argv);
  const projectMcpPath = path.join(projectRoot, ".cursor", "mcp.json");
  const globalMcpPath = path.join(home, ".cursor", "mcp.json");
  const sameCursorMcpPath = path.resolve(projectMcpPath) === path.resolve(globalMcpPath);
  const removedProjectMcp =
    sameCursorMcpPath && globalCleanup ? false : tryStripMcp(projectMcpPath);
  const removedProjectHooks = tryCleanProjectHooks(projectRoot);
  const projectAic = tryUninstallProjectAic(projectRoot, {
    keepProjectArtifacts,
    homeDir: home,
  });
  let removedGlobalMcp = false;
  let globalClaude = { changed: false, parts: [] };
  let globalAic = { changed: false, message: null };
  if (globalCleanup) {
    removedGlobalMcp = tryStripMcp(globalMcpPath);
    globalClaude = tryUninstallGlobalClaude(home);
    const keepDb = resolveGlobalKeepAicDatabase(argv, process.env);
    globalAic = tryCleanGlobalAicDir(home, keepDb);
  }
  const changed =
    removedGlobalMcp ||
    removedProjectMcp ||
    removedProjectHooks ||
    globalClaude.changed ||
    projectAic.changed ||
    globalAic.changed;
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
  parts.push(...globalClaude.parts, ...projectAic.parts);
  if (globalAic.message) {
    parts.push(globalAic.message);
  }
  parts.push("Restart Cursor to complete uninstall.");
  process.stdout.write(parts.join(" ") + "\n");
}

run();
