// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");

const { hookScriptNames: AIC_SCRIPT_NAMES } = require("../claude/aic-hook-scripts.json");
const AIC_HOOK_CMD = /aic-[a-z0-9-]+\.cjs/i;

function commandReferencesAicHook(command) {
  return AIC_HOOK_CMD.test(String(command || ""));
}

function tryRemoveFromSettings(settingsPath) {
  try {
    if (!fs.existsSync(settingsPath)) return false;
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const hooks = data.hooks;
    if (!hooks || typeof hooks !== "object") return false;
    let changed = false;
    const newHooks = {};
    for (const eventKey of Object.keys(hooks)) {
      const wrappers = hooks[eventKey] || [];
      newHooks[eventKey] = wrappers.map((w) => {
        const inner = w.hooks || [];
        const filtered = inner.filter(
          (entry) => !commandReferencesAicHook(entry.command),
        );
        if (filtered.length !== inner.length) changed = true;
        return { ...w, hooks: filtered };
      });
    }
    if (!changed) return false;
    data.hooks = newHooks;
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

function tryRemoveMcpServerFromSettings(settingsPath) {
  try {
    if (!fs.existsSync(settingsPath)) return false;
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const servers = data.mcpServers;
    if (!servers || typeof servers !== "object") return false;
    const aicKey = Object.keys(servers).find((k) => k.toLowerCase() === "aic");
    if (aicKey === undefined) return false;
    const nextServers = { ...servers };
    delete nextServers[aicKey];
    data.mcpServers = nextServers;
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

function tryRemoveHookFiles(globalHooksDir) {
  let removed = false;
  for (const name of AIC_SCRIPT_NAMES) {
    try {
      const p = path.join(globalHooksDir, name);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        removed = true;
      }
    } catch {
      // Best effort
    }
  }
  const hookDirFiles = fs.existsSync(globalHooksDir)
    ? fs.readdirSync(globalHooksDir)
    : [];
  for (const name of hookDirFiles) {
    if (/^aic-[a-z0-9-]+\.cjs$/.test(name) && !AIC_SCRIPT_NAMES.includes(name)) {
      try {
        fs.unlinkSync(path.join(globalHooksDir, name));
        removed = true;
      } catch {
        // Best effort
      }
    }
  }
  return removed;
}

function tryUninstallGlobalClaude(homeDir) {
  const globalClaudeDir = path.join(homeDir, ".claude");
  const globalHooksDir = path.join(globalClaudeDir, "hooks");
  const settingsPath = path.join(globalClaudeDir, "settings.json");
  const removedSettings = tryRemoveFromSettings(settingsPath);
  const removedMcp = tryRemoveMcpServerFromSettings(settingsPath);
  const removedFiles = tryRemoveHookFiles(globalHooksDir);
  const changed = removedSettings || removedMcp || removedFiles;
  const parts = [];
  if (removedSettings) {
    parts.push("Removed AIC hook entries from ~/.claude/settings.json.");
  }
  if (removedMcp) {
    parts.push("Removed AIC from mcpServers in ~/.claude/settings.json.");
  }
  if (removedFiles) {
    parts.push("Removed AIC scripts from ~/.claude/hooks/.");
  }
  return { changed, parts };
}

module.exports = { tryUninstallGlobalClaude };
