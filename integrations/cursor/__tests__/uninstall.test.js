"use strict";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
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

function envWithTmpHome(tmpDir) {
  return {
    ...process.env,
    HOME: tmpDir,
    AIC_PROJECT_ROOT: tmpDir,
    CURSOR_PROJECT_DIR: tmpDir,
  };
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
    const out = runUninstall(envWithTmpHome(tmpDir), ["--global"], tmpDir);
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
    runUninstall(envWithTmpHome(tmpDir), ["--global"], tmpDir);
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
    runUninstall(envWithTmpHome(tmpDir), ["--global"], tmpDir);
    const out2 = runUninstall(envWithTmpHome(tmpDir), ["--global"], tmpDir);
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
    const out = runUninstall(envWithTmpHome(tmpDir), [], tmpDir);
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
        AIC_PROJECT_ROOT: tmpProject,
        CURSOR_PROJECT_DIR: tmpProject,
      },
      ["--global"],
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
    runUninstall(envWithTmpHome(tmpDir), [], tmpDir);
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
        AIC_PROJECT_ROOT: tmpProject,
        CURSOR_PROJECT_DIR: tmpProject,
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

function cursor_global_aic_clean_preserves_sqlite() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "cache.txt"), "c", "utf8");
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "db", "utf8");
    const out = runUninstall(envWithTmpHome(tmpDir), ["--global"], tmpDir);
    assert(out.includes("kept SQLite database files"), "mentions db preserved");
    assert(!fs.existsSync(path.join(aicDir, "cache.txt")), "cache removed");
    assert(
      fs.readFileSync(path.join(aicDir, "aic.sqlite"), "utf8") === "db",
      "db intact",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function cursor_global_aic_no_keep_db_wipes_dir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "db", "utf8");
    const out = runUninstall(
      envWithTmpHome(tmpDir),
      ["--global", "--remove-database"],
      tmpDir,
    );
    assert(out.includes("including the database"), "mentions full removal");
    assert(!fs.existsSync(aicDir), ".aic dir gone");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function cursor_global_aic_env_no_keep_db_wipes_dir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "x.txt"), "x", "utf8");
    runUninstall(
      {
        ...envWithTmpHome(tmpDir),
        AIC_UNINSTALL_KEEP_AIC_DATABASE: "0",
      },
      ["--global"],
      tmpDir,
    );
    assert(!fs.existsSync(aicDir), ".aic removed via env");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
      {
        ...process.env,
        HOME: tmpHome,
        AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
        AIC_PROJECT_ROOT: tmpProject,
        CURSOR_PROJECT_DIR: tmpProject,
      },
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

function cursor_uninstall_cleans_global_claude() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-cc-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-pr-"));
  try {
    const claudeDir = path.join(tmpHome, ".claude");
    fs.mkdirSync(path.join(claudeDir, "hooks"), { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, "settings.json"),
      JSON.stringify({ mcpServers: { aic: { command: "npx", args: ["x"] } } }, null, 2) +
        "\n",
      "utf8",
    );
    const out = runUninstall(
      {
        ...process.env,
        HOME: tmpHome,
        AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
        AIC_PROJECT_ROOT: tmpProject,
        CURSOR_PROJECT_DIR: tmpProject,
      },
      ["--global"],
      repoRoot,
    );
    assert(out.includes("mcpServers"), "stdout mentions claude mcp strip");
    const data = JSON.parse(
      fs.readFileSync(path.join(claudeDir, "settings.json"), "utf8"),
    );
    const servers = data.mcpServers || {};
    const aicKey = Object.keys(servers).find((k) => k.toLowerCase() === "aic");
    assert(aicKey === undefined, "global claude mcpServers aic removed");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function cursor_uninstall_removes_project_artifacts() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-pa-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-pa-p-"));
  try {
    fs.writeFileSync(path.join(tmpProject, "aic.config.json"), "{}\n", "utf8");
    fs.mkdirSync(path.join(tmpProject, ".aic"), { recursive: true });
    fs.writeFileSync(path.join(tmpProject, ".aic", "foo.txt"), "x", "utf8");
    fs.writeFileSync(path.join(tmpProject, ".gitignore"), ".aic/\n", "utf8");
    const inner = fs.readFileSync(
      path.join(repoRoot, "integrations", "shared", "claude-md-canonical-body.txt"),
      "utf8",
    );
    const mdBody = inner.endsWith("\n") ? inner : `${inner}\n`;
    fs.mkdirSync(path.join(tmpProject, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpProject, ".claude", "CLAUDE.md"),
      `<!-- BEGIN AIC MANAGED SECTION — do not edit between these markers -->\n${mdBody}<!-- END AIC MANAGED SECTION -->\n`,
      "utf8",
    );
    runUninstall(
      {
        ...process.env,
        HOME: tmpHome,
        AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
        AIC_PROJECT_ROOT: tmpProject,
        CURSOR_PROJECT_DIR: tmpProject,
      },
      [],
      repoRoot,
    );
    assert(!fs.existsSync(path.join(tmpProject, "aic.config.json")), "config removed");
    assert(!fs.existsSync(path.join(tmpProject, ".aic")), ".aic removed");
    const gi = fs.readFileSync(path.join(tmpProject, ".gitignore"), "utf8");
    assert(!gi.includes(".aic/"), "ignore line removed");
    assert(
      !fs.existsSync(path.join(tmpProject, ".claude", "CLAUDE.md")),
      "claude md removed",
    );
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function cursor_uninstall_keep_project_artifacts_skips_project_files() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-kp-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-kp-p-"));
  try {
    fs.writeFileSync(path.join(tmpProject, "aic.config.json"), "{}\n", "utf8");
    fs.mkdirSync(path.join(tmpProject, ".aic"), { recursive: true });
    fs.writeFileSync(path.join(tmpProject, ".aic", "keep.txt"), "k", "utf8");
    runUninstall(
      {
        ...process.env,
        HOME: tmpHome,
        AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
        AIC_PROJECT_ROOT: tmpProject,
        CURSOR_PROJECT_DIR: tmpProject,
      },
      ["--keep-project-artifacts"],
      repoRoot,
    );
    assert(fs.existsSync(path.join(tmpProject, "aic.config.json")), "config kept");
    assert(fs.existsSync(path.join(tmpProject, ".aic", "keep.txt")), ".aic kept");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function cursor_keep_project_artifacts_still_cleans_cursor_project() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-kpc-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-kpc-p-"));
  try {
    runInstaller(tmpProject);
    fs.writeFileSync(
      path.join(tmpProject, "aic.config.json"),
      JSON.stringify({ devMode: false }) + "\n",
      "utf8",
    );
    const pc = path.join(tmpProject, ".cursor");
    fs.writeFileSync(
      path.join(pc, "mcp.json"),
      JSON.stringify({ mcpServers: { aic: { command: "npx" } } }, null, 2) + "\n",
      "utf8",
    );
    runUninstall(
      {
        ...process.env,
        HOME: tmpHome,
        AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
        AIC_PROJECT_ROOT: tmpProject,
        CURSOR_PROJECT_DIR: tmpProject,
      },
      ["--keep-project-artifacts"],
      repoRoot,
    );
    assert(
      fs.existsSync(path.join(tmpProject, "aic.config.json")),
      "config kept with flag",
    );
    const parsed = JSON.parse(fs.readFileSync(path.join(pc, "mcp.json"), "utf8"));
    assert(findAicKey(parsed.mcpServers) === undefined, "project MCP still stripped");
    const hooksJson = JSON.parse(fs.readFileSync(path.join(pc, "hooks.json"), "utf8"));
    const cmds = collectHookCommands(hooksJson);
    assert(!cmds.some((c) => /AIC-[a-z0-9-]+\.cjs/.test(c)), "AIC hook commands removed");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function cursor_remove_database_without_global_warns_stderr() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-rdb-"));
  try {
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "db", "utf8");
    const r = spawnSync(process.execPath, [uninstallScript, "--remove-database"], {
      cwd: tmpDir,
      env: envWithTmpHome(tmpDir),
      encoding: "utf8",
    });
    assert(r.status === 0, "exit 0");
    assert(
      String(r.stderr).includes("--remove-database") &&
        String(r.stderr).includes("--global"),
      "stderr warns about --global",
    );
    assert(
      fs.existsSync(path.join(aicDir, "aic.sqlite")),
      "~/.aic untouched without --global",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function cursor_dev_mode_skips_uninstall() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-dv-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-dv-p-"));
  try {
    const cursorDir = path.join(tmpHome, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorDir, "mcp.json"),
      JSON.stringify({ mcpServers: { aic: { command: "npx" } } }, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpProject, "aic.config.json"),
      JSON.stringify({ devMode: true }) + "\n",
      "utf8",
    );
    const out = runUninstall(
      {
        ...process.env,
        HOME: tmpHome,
        AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
        AIC_PROJECT_ROOT: tmpProject,
        CURSOR_PROJECT_DIR: tmpProject,
      },
      [],
      repoRoot,
    );
    assert(
      out.includes("Skipping uninstall") && out.includes("devMode: true"),
      "skip message",
    );
    const obj = JSON.parse(fs.readFileSync(path.join(cursorDir, "mcp.json"), "utf8"));
    assert(findAicKey(obj.mcpServers) !== undefined, "global MCP untouched on skip");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function cursor_dev_mode_force_uninstalls() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-dvf-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-curs-dvf-p-"));
  try {
    const cursorDir = path.join(tmpHome, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(
      path.join(cursorDir, "mcp.json"),
      JSON.stringify({ mcpServers: { aic: { command: "npx" } } }, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpProject, "aic.config.json"),
      JSON.stringify({ devMode: true }) + "\n",
      "utf8",
    );
    const out = runUninstall(
      {
        ...process.env,
        HOME: tmpHome,
        AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
        AIC_PROJECT_ROOT: tmpProject,
        CURSOR_PROJECT_DIR: tmpProject,
      },
      ["--force", "--global"],
      repoRoot,
    );
    assert(out.includes("Force-uninstalling AIC development project"), "force warning");
    const obj = JSON.parse(fs.readFileSync(path.join(cursorDir, "mcp.json"), "utf8"));
    assert(findAicKey(obj.mcpServers) === undefined, "global MCP removed with force");
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
cursor_global_aic_clean_preserves_sqlite();
console.log("ok: cursor_global_aic_clean_preserves_sqlite");
cursor_global_aic_no_keep_db_wipes_dir();
console.log("ok: cursor_global_aic_no_keep_db_wipes_dir");
cursor_global_aic_env_no_keep_db_wipes_dir();
console.log("ok: cursor_global_aic_env_no_keep_db_wipes_dir");
cursor_project_mcp_removed();
console.log("ok: cursor_project_mcp_removed");
cursor_uninstall_cleans_global_claude();
console.log("ok: cursor_uninstall_cleans_global_claude");
cursor_uninstall_removes_project_artifacts();
console.log("ok: cursor_uninstall_removes_project_artifacts");
cursor_uninstall_keep_project_artifacts_skips_project_files();
console.log("ok: cursor_uninstall_keep_project_artifacts_skips_project_files");
cursor_keep_project_artifacts_still_cleans_cursor_project();
console.log("ok: cursor_keep_project_artifacts_still_cleans_cursor_project");
cursor_remove_database_without_global_warns_stderr();
console.log("ok: cursor_remove_database_without_global_warns_stderr");
cursor_dev_mode_skips_uninstall();
console.log("ok: cursor_dev_mode_skips_uninstall");
cursor_dev_mode_force_uninstalls();
console.log("ok: cursor_dev_mode_force_uninstalls");
