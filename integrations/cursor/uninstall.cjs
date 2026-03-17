// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const AIC_SCRIPT_NAMES = [
  "AIC-session-init.cjs",
  "AIC-compile-context.cjs",
  "AIC-require-aic-compile.cjs",
  "AIC-inject-conversation-id.cjs",
  "AIC-post-compile-context.cjs",
  "AIC-before-submit-prewarm.cjs",
  "AIC-block-no-verify.cjs",
  "AIC-after-file-edit-tracker.cjs",
  "AIC-session-end.cjs",
  "AIC-stop-quality-check.cjs",
];

const hookKeys = [
  "sessionStart",
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "beforeShellExecution",
  "afterFileEdit",
  "sessionEnd",
  "stop",
];

function isAicScriptInManifest(entry) {
  const m = (entry.command ?? "").match(/AIC-[a-z0-9-]+\.cjs/);
  const scriptName = m ? m[0] : undefined;
  if (scriptName === undefined) return false;
  return AIC_SCRIPT_NAMES.includes(scriptName);
}

function run() {
  const home = os.homedir();
  const cursorDir = path.join(home, ".cursor");
  const mcpPath = path.join(cursorDir, "mcp.json");
  let removedGlobal = false;
  let removedProject = false;

  if (fs.existsSync(mcpPath)) {
    try {
      const raw = fs.readFileSync(mcpPath, "utf8");
      const obj = JSON.parse(raw);
      if (Object.prototype.hasOwnProperty.call(obj, "aic")) {
        delete obj.aic;
        fs.mkdirSync(cursorDir, { recursive: true });
        fs.writeFileSync(mcpPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
        removedGlobal = true;
      }
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err) + "\n");
      process.exit(1);
    }
  }

  const withProject = process.argv.includes("--project");
  if (withProject) {
    const projectRoot = process.cwd();
    const projectCursorDir = path.join(projectRoot, ".cursor");
    const projectHooksDir = path.join(projectCursorDir, "hooks");
    const hooksJsonPath = path.join(projectCursorDir, "hooks.json");
    const rulesDir = path.join(projectRoot, ".cursor", "rules");
    const triggerPath = path.join(rulesDir, "AIC.mdc");

    try {
      if (fs.existsSync(hooksJsonPath)) {
        const raw = fs.readFileSync(hooksJsonPath, "utf8");
        const data = JSON.parse(raw);
        const hooks = data.hooks || {};
        let changed = false;
        for (const key of hookKeys) {
          const arr = (hooks[key] || []).filter((e) => !isAicScriptInManifest(e));
          if (arr.length !== (hooks[key] || []).length) changed = true;
          hooks[key] = arr;
        }
        if (changed) {
          data.hooks = hooks;
          fs.writeFileSync(hooksJsonPath, JSON.stringify(data, null, 2) + "\n", "utf8");
          removedProject = true;
        }
      }
      for (const name of AIC_SCRIPT_NAMES) {
        const p = path.join(projectHooksDir, name);
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          removedProject = true;
        }
      }
      if (fs.existsSync(triggerPath)) {
        fs.unlinkSync(triggerPath);
        removedProject = true;
      }
    } catch (err) {
      process.stderr.write(String(err && err.message ? err.message : err) + "\n");
      process.exit(1);
    }
  }

  if (removedGlobal) {
    process.stdout.write(
      "Removed AIC from ~/.cursor/mcp.json. Restart Cursor to complete uninstall.\n",
    );
  } else {
    process.stdout.write("AIC was not found in ~/.cursor/mcp.json.\n");
  }
  if (removedProject) {
    process.stdout.write("Removed AIC hooks and rule from this project.\n");
  }
}

run();
