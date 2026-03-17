// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const AIC_SCRIPT_NAMES = [
  "aic-compile-helper.cjs",
  "aic-session-start.cjs",
  "aic-prompt-compile.cjs",
  "aic-subagent-inject.cjs",
  "aic-pre-compact.cjs",
  "aic-after-file-edit-tracker.cjs",
  "aic-stop-quality-check.cjs",
  "aic-block-no-verify.cjs",
  "aic-session-end.cjs",
];

function isAicCommand(command) {
  const m = String(command || "").match(/aic-[a-z0-9-]+\.cjs/);
  return m ? AIC_SCRIPT_NAMES.includes(m[0]) : false;
}

function run() {
  const home = os.homedir();
  const globalClaudeDir = path.join(home, ".claude");
  const globalHooksDir = path.join(globalClaudeDir, "hooks");
  const settingsPath = path.join(globalClaudeDir, "settings.json");
  let removed = false;

  if (!fs.existsSync(settingsPath)) {
    process.stdout.write("AIC was not found in ~/.claude/settings.json.\n");
    return;
  }

  try {
    let removedFromSettings = false;
    const raw = fs.readFileSync(settingsPath, "utf8");
    const data = JSON.parse(raw);
    const hooks = data.hooks;
    if (hooks && typeof hooks === "object") {
      const newHooks = {};
      for (const eventKey of Object.keys(hooks)) {
        const wrappers = hooks[eventKey] || [];
        newHooks[eventKey] = wrappers.map((w) => {
          const inner = w.hooks || [];
          const filtered = inner.filter((entry) => !isAicCommand(entry.command));
          if (filtered.length !== inner.length) removedFromSettings = true;
          return { ...w, hooks: filtered };
        });
      }
      data.hooks = newHooks;
    }
    if (removedFromSettings) {
      fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2) + "\n", "utf8");
      removed = true;
    }
    for (const name of AIC_SCRIPT_NAMES) {
      const p = path.join(globalHooksDir, name);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        removed = true;
      }
    }
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err) + "\n");
    process.exit(1);
  }

  if (removed) {
    process.stdout.write(
      "Removed AIC hooks from ~/.claude/settings.json and ~/.claude/hooks/. Restart Claude Code (or reload) to complete uninstall.\n",
    );
  } else {
    process.stdout.write("AIC was not found in ~/.claude/settings.json.\n");
  }
}

run();
