"use strict";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "integrations", "cursor", "aic-hook-scripts.json"),
    "utf8",
  ),
);
const AIC_SCRIPT_NAMES = manifest.hookScriptNames;
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

function collectHookCommands(hooksJson) {
  const out = [];
  const hooks = hooksJson.hooks || {};
  for (const key of Object.keys(hooks)) {
    const arr = hooks[key];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      out.push(String(e.command || ""));
    }
  }
  return out;
}

function cursor_global_removal_top_level_aic() {
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
    const out = runUninstall({ ...process.env, HOME: tmpDir }, [], tmpDir);
    assert(out.includes("~/.cursor/mcp.json"), "stdout mentions global mcp");
    const obj = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    assert(
      !Object.prototype.hasOwnProperty.call(obj, "aic"),
      "aic key removed from mcp.json",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function cursor_global_removal_mcp_servers() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    const cursorDir = path.join(tmpDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    const mcpPath = path.join(cursorDir, "mcp.json");
    fs.writeFileSync(
      mcpPath,
      JSON.stringify(
        { mcpServers: { aic: { command: "npx", args: ["x"] } }, other: 1 },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    runUninstall({ ...process.env, HOME: tmpDir }, [], tmpDir);
    const obj = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
    assert(findAicKey(obj.mcpServers) === undefined, "aic removed from mcpServers");
    assert(obj.other === 1, "preserves unrelated keys");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function findAicKey(servers) {
  if (!servers || typeof servers !== "object") return undefined;
  return Object.keys(servers).find((k) => k.toLowerCase() === "aic");
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
    runUninstall({ ...process.env, HOME: tmpDir }, [], tmpDir);
    const out2 = runUninstall({ ...process.env, HOME: tmpDir }, [], tmpDir);
    assert(
      out2.includes("Nothing to remove") && out2.includes("No need to restart"),
      "second run reports nothing to remove",
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
    const out = runUninstall({ ...process.env, HOME: tmpDir }, [], tmpDir);
    assert(out.includes("hooks and trigger rule"), "project hooks removed message");
    const hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
    const cmds = collectHookCommands(hooksJson);
    const hasAic = cmds.some((c) => /AIC-[a-z0-9-]+\.cjs/.test(c));
    assert(!hasAic, "no AIC commands left in hooks.json");
    for (const name of AIC_SCRIPT_NAMES) {
      assert(!fs.existsSync(path.join(hooksDir, name)), `script ${name} removed`);
    }
    assert(!fs.existsSync(triggerPath), "AIC.mdc removed");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function cursor_combined_global_and_project() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-home-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-proj-"));
  try {
    const homeCursor = path.join(tmpHome, ".cursor");
    fs.mkdirSync(homeCursor, { recursive: true });
    fs.writeFileSync(
      path.join(homeCursor, "mcp.json"),
      JSON.stringify({ mcpServers: { AIC: { command: "npx" } } }, null, 2) + "\n",
      "utf8",
    );
    runInstaller(tmpProject);
    const out = runUninstall(
      {
        ...process.env,
        HOME: tmpHome,
        AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
      },
      [],
      repoRoot,
    );
    assert(out.includes("~/.cursor/mcp.json"), "global mcp mentioned");
    assert(out.includes("hooks and trigger rule"), "project hooks mentioned");
    const obj = JSON.parse(fs.readFileSync(path.join(homeCursor, "mcp.json"), "utf8"));
    assert(
      findAicKey(obj.mcpServers) === undefined,
      "global aic cleared after combined run",
    );
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function cursor_corrupt_hooks_json_still_removes_scripts() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, ".cursor", "hooks.json"), "{ not json\n", "utf8");
    const scriptName = AIC_SCRIPT_NAMES[0];
    fs.writeFileSync(path.join(hooksDir, scriptName), "// x\n", "utf8");
    runUninstall({ ...process.env, HOME: tmpDir }, [], tmpDir);
    assert(
      !fs.existsSync(path.join(hooksDir, scriptName)),
      "script removed despite bad hooks.json",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function cursor_project_root_env() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-home-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-proj-"));
  try {
    runInstaller(tmpProject);
    const out = runUninstall(
      {
        ...process.env,
        HOME: tmpHome,
        AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
      },
      [],
      repoRoot,
    );
    assert(out.includes("hooks and trigger rule"), "cleaned project via env root");
    assert(
      !fs.existsSync(path.join(tmpProject, ".cursor", "rules", "AIC.mdc")),
      "trigger removed from env-specified project",
    );
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function cursor_project_mcp_removed() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-h2-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-p2-"));
  try {
    const pc = path.join(tmpProject, ".cursor");
    fs.mkdirSync(pc, { recursive: true });
    fs.writeFileSync(
      path.join(pc, "mcp.json"),
      JSON.stringify({ mcpServers: { aic: { url: "http://x" } } }, null, 2) + "\n",
      "utf8",
    );
    const out = runUninstall(
      { ...process.env, HOME: tmpHome, AIC_UNINSTALL_PROJECT_ROOT: tmpProject },
      [],
      repoRoot,
    );
    assert(out.includes("project's Cursor MCP"), "project mcp message");
    const parsed = JSON.parse(fs.readFileSync(path.join(pc, "mcp.json"), "utf8"));
    assert(findAicKey(parsed.mcpServers) === undefined, "project mcp stripped");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

cursor_global_removal_top_level_aic();
console.log("ok: cursor_global_removal_top_level_aic");
cursor_global_removal_mcp_servers();
console.log("ok: cursor_global_removal_mcp_servers");
cursor_idempotent();
console.log("ok: cursor_idempotent");
cursor_project_cleanup();
console.log("ok: cursor_project_cleanup");
cursor_combined_global_and_project();
console.log("ok: cursor_combined_global_and_project");
cursor_corrupt_hooks_json_still_removes_scripts();
console.log("ok: cursor_corrupt_hooks_json_still_removes_scripts");
cursor_project_root_env();
console.log("ok: cursor_project_root_env");
cursor_project_mcp_removed();
console.log("ok: cursor_project_mcp_removed");
