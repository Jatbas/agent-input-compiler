"use strict";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const installScript = path.join(repoRoot, "integrations", "cursor", "install.cjs");
const uninstallScript = path.join(repoRoot, "integrations", "cursor", "uninstall.cjs");

function runInstaller(cwd) {
  execFileSync("node", [installScript], { cwd, encoding: "utf8" });
}

function runUninstall(env, args = [], cwd) {
  return execFileSync("node", [uninstallScript, ...args], {
    encoding: "utf8",
    env: env ?? process.env,
    cwd: cwd ?? repoRoot,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cursor_global_removal() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    const cursorDir = path.join(tmpDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    const mcpPath = path.join(cursorDir, "mcp.json");
    fs.writeFileSync(
      mcpPath,
      JSON.stringify(
        { aic: { command: "npx", args: ["-y", "@jatbas/aic@latest"] } },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    runUninstall({ ...process.env, HOME: tmpDir });
    const obj = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    assert(
      !Object.prototype.hasOwnProperty.call(obj, "aic"),
      "aic key removed from mcp.json",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function cursor_idempotent() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    const cursorDir = path.join(tmpDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    const mcpPath = path.join(cursorDir, "mcp.json");
    fs.writeFileSync(
      mcpPath,
      JSON.stringify(
        { aic: { command: "npx", args: ["-y", "@jatbas/aic@latest"] } },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    runUninstall({ ...process.env, HOME: tmpDir });
    const out2 = runUninstall({ ...process.env, HOME: tmpDir });
    assert(
      out2.includes("not found") || out2.includes("was not found"),
      "second run reports not found or already clean",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function cursor_project_cleanup() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    runInstaller(tmpDir);
    const hooksJsonPath = path.join(tmpDir, ".cursor", "hooks.json");
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    const triggerPath = path.join(tmpDir, ".cursor", "rules", "AIC.mdc");
    assert(fs.existsSync(hooksJsonPath), "hooks.json exists after install");
    assert(fs.existsSync(triggerPath), "AIC.mdc exists after install");
    runUninstall(process.env, ["--project"], tmpDir);
    const hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
    const allCommands = Object.values(hooksJson.hooks || {}).flat();
    const hasAic = allCommands.some((e) =>
      (e.command || "").match(/AIC-[a-z0-9-]+\.cjs/),
    );
    assert(!hasAic, "no AIC commands left in hooks.json");
    for (const name of AIC_SCRIPT_NAMES) {
      assert(!fs.existsSync(path.join(hooksDir, name)), `script ${name} removed`);
    }
    assert(!fs.existsSync(triggerPath), "AIC.mdc removed");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

cursor_global_removal();
console.log("ok: cursor_global_removal");
cursor_idempotent();
console.log("ok: cursor_idempotent");
cursor_project_cleanup();
console.log("ok: cursor_project_cleanup");
