// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  parseKeepAicDatabase,
  tryCleanGlobalAicDir,
} = require("../clean-global-aic-dir.cjs");

const manifestPath = path.join(__dirname, "aic-hook-scripts.json");
const AIC_SCRIPT_NAMES = JSON.parse(
  fs.readFileSync(manifestPath, "utf8"),
).hookScriptNames;

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
  return removed;
}

function run() {
  const home = os.homedir();
  const globalClaudeDir = path.join(home, ".claude");
  const globalHooksDir = path.join(globalClaudeDir, "hooks");
  const settingsPath = path.join(globalClaudeDir, "settings.json");
  const removedSettings = tryRemoveFromSettings(settingsPath);
  const removedFiles = tryRemoveHookFiles(globalHooksDir);
  const keepDb = parseKeepAicDatabase(process.argv, process.env);
  const globalAic = tryCleanGlobalAicDir(home, keepDb);
  const changed = removedSettings || removedFiles || globalAic.changed;
  if (!changed) {
    process.stdout.write("Nothing to remove. No need to restart Claude Code.\n");
    return;
  }
  const parts = [];
  if (removedSettings) {
    parts.push("Removed AIC hook entries from ~/.claude/settings.json.");
  }
  if (removedFiles) {
    parts.push("Removed AIC scripts from ~/.claude/hooks/.");
  }
  if (globalAic.message) {
    parts.push(globalAic.message);
  }
  parts.push("Restart Claude Code (or reload) to complete uninstall.");
  process.stdout.write(parts.join(" ") + "\n");
}

run();
