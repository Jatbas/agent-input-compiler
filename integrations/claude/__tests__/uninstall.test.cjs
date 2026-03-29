// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");

const installScript = path.join(__dirname, "..", "install.cjs");
const uninstallScript = path.join(__dirname, "..", "uninstall.cjs");

function runInstall(env, cwd) {
  execFileSync("node", [installScript], {
    cwd: cwd ?? path.dirname(installScript),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runUninstall(env, cwd, args) {
  const extra = Array.isArray(args) ? args : [];
  return execFileSync("node", [uninstallScript, ...extra], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    cwd: cwd ?? repoRoot(),
  });
}

function repoRoot() {
  return path.join(__dirname, "..", "..", "..");
}

function envTmpHome(tmpDir) {
  return {
    ...process.env,
    HOME: tmpDir,
    AIC_PROJECT_ROOT: tmpDir,
    CURSOR_PROJECT_DIR: tmpDir,
    CLAUDE_PROJECT_DIR: tmpDir,
  };
}

function envHomeProject(tmpHome, tmpProject) {
  return {
    ...process.env,
    HOME: tmpHome,
    AIC_UNINSTALL_PROJECT_ROOT: tmpProject,
    AIC_PROJECT_ROOT: tmpProject,
    CURSOR_PROJECT_DIR: tmpProject,
    CLAUDE_PROJECT_DIR: tmpProject,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function claude_uninstall_removes_hooks_and_files() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-test-"));
  try {
    const globalClaudeDir = path.join(tmpDir, ".claude");
    const hooksDir = path.join(globalClaudeDir, "hooks");
    const settingsPath = path.join(globalClaudeDir, "settings.json");
    fs.mkdirSync(hooksDir, { recursive: true });
    const minimalSettings = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: 'node "$HOME/.claude/hooks/aic-session-start.cjs"',
                timeout: 30,
              },
            ],
          },
        ],
      },
    };
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(minimalSettings, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(hooksDir, "aic-session-start.cjs"),
      "// placeholder\n",
      "utf8",
    );
    const out = runUninstall(envTmpHome(tmpDir), tmpDir, ["--global"]);
    assert(out.includes("settings.json"), "mentions settings");
    assert(out.includes("hooks/"), "mentions hooks dir");
    const raw = fs.readFileSync(settingsPath, "utf8");
    const data = JSON.parse(raw);
    const allCommands = [];
    for (const key of Object.keys(data.hooks || {})) {
      const wrappers = data.hooks[key] || [];
      for (const w of wrappers) {
        for (const h of w.hooks || []) {
          allCommands.push(String(h.command || ""));
        }
      }
    }
    const hasAic = allCommands.some((c) => /aic-[a-z0-9-]+\.cjs/i.test(c));
    assert(!hasAic, "no AIC commands in settings.json after uninstall");
    assert(
      !fs.existsSync(path.join(hooksDir, "aic-session-start.cjs")),
      "hook script removed",
    );
    console.log("claude_uninstall_removes_hooks_and_files: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function claude_idempotent() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-idem-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-idem-p-"));
  try {
    runInstall({ HOME: tmpHome, CLAUDE_PROJECT_DIR: tmpProject }, tmpProject);
    runUninstall(envTmpHome(tmpHome), tmpHome, ["--global"]);
    const out2 = runUninstall(envTmpHome(tmpHome), tmpHome, ["--global"]);
    assert(
      out2.includes("Nothing to remove") && out2.includes("No need to restart"),
      "second uninstall reports nothing to remove",
    );
    console.log("claude_idempotent: pass");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function claude_settings_only_no_scripts_line() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-claude-set-"));
  try {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  {
                    type: "command",
                    command: "node ~/.claude/hooks/aic-prompt-compile.cjs",
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const out = runUninstall(envTmpHome(tmpDir), tmpDir, ["--global"]);
    assert(out.includes("settings.json"), "settings cleaned");
    assert(!out.includes("~/.claude/hooks/."), "no scripts line when no files removed");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log("claude_settings_only_no_scripts_line: pass");
}

function claude_files_only_no_settings_line() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-claude-files-"));
  try {
    const hooksDir = path.join(tmpDir, ".claude", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".claude", "settings.json"),
      JSON.stringify({ hooks: {} }, null, 2) + "\n",
      "utf8",
    );
    fs.writeFileSync(path.join(hooksDir, "aic-session-start.cjs"), "//\n", "utf8");
    const out = runUninstall(envTmpHome(tmpDir), tmpDir, ["--global"]);
    assert(out.includes("hooks/"), "scripts removed line");
    assert(!out.includes("settings.json"), "no settings line when settings unchanged");
    assert(!fs.existsSync(path.join(hooksDir, "aic-session-start.cjs")), "file gone");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log("claude_files_only_no_settings_line: pass");
}

function claude_strips_multiple_events() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-claude-multi-"));
  try {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              { hooks: [{ type: "command", command: "node x/aic-session-start.cjs" }] },
            ],
            UserPromptSubmit: [
              { hooks: [{ type: "command", command: "node x/aic-prompt-compile.cjs" }] },
            ],
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    runUninstall(envTmpHome(tmpDir), tmpDir, ["--global"]);
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const cmds = [];
    for (const k of Object.keys(data.hooks || {})) {
      for (const w of data.hooks[k] || []) {
        for (const h of w.hooks || []) cmds.push(h.command || "");
      }
    }
    assert(!cmds.some((c) => /aic-.*\.cjs/i.test(c)), "all events stripped");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log("claude_strips_multiple_events: pass");
}

function claude_global_aic_clean_preserves_sqlite() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-claude-gic-"));
  try {
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "cache.txt"), "c", "utf8");
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "db", "utf8");
    const out = runUninstall(envTmpHome(tmpDir), tmpDir, ["--global"]);
    assert(out.includes("kept SQLite database files"), "mentions db preserved");
    assert(!fs.existsSync(path.join(aicDir, "cache.txt")), "cache removed");
    assert(
      fs.readFileSync(path.join(aicDir, "aic.sqlite"), "utf8") === "db",
      "db intact",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log("claude_global_aic_clean_preserves_sqlite: pass");
}

function claude_global_aic_no_keep_db_wipes_dir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-claude-gic2-"));
  try {
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "db", "utf8");
    const out = runUninstall(envTmpHome(tmpDir), tmpDir, [
      "--global",
      "--remove-database",
    ]);
    assert(out.includes("including the database"), "mentions full removal");
    assert(!fs.existsSync(aicDir), ".aic dir gone");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log("claude_global_aic_no_keep_db_wipes_dir: pass");
}

function claude_uninstall_removes_mcp_server() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-mcp-"));
  try {
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        { mcpServers: { aic: { command: "npx", args: ["-y", "@jatbas/aic@latest"] } } },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const out = runUninstall(envTmpHome(tmpDir), tmpDir, ["--global"]);
    assert(out.includes("mcpServers"), "mentions mcpServers");
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const servers = data.mcpServers || {};
    const aicKey = Object.keys(servers).find((k) => k.toLowerCase() === "aic");
    assert(aicKey === undefined, "mcpServers.aic removed after uninstall");
    console.log("claude_uninstall_removes_mcp_server: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function claude_uninstall_removes_project_artifacts() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cl-pa-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cl-pa-p-"));
  try {
    fs.writeFileSync(path.join(tmpProject, "aic.config.json"), "{}\n", "utf8");
    fs.mkdirSync(path.join(tmpProject, ".aic"), { recursive: true });
    fs.writeFileSync(path.join(tmpProject, ".aic", "foo.txt"), "x", "utf8");
    fs.writeFileSync(path.join(tmpProject, ".gitignore"), ".aic/\n", "utf8");
    const inner = fs.readFileSync(
      path.join(repoRoot(), "integrations", "shared", "claude-md-canonical-body.txt"),
      "utf8",
    );
    const mdBody = inner.endsWith("\n") ? inner : `${inner}\n`;
    fs.mkdirSync(path.join(tmpProject, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpProject, ".claude", "CLAUDE.md"),
      `<!-- BEGIN AIC MANAGED SECTION — do not edit between these markers -->\n${mdBody}<!-- END AIC MANAGED SECTION -->\n`,
      "utf8",
    );
    runUninstall(envHomeProject(tmpHome, tmpProject), repoRoot(), []);
    assert(!fs.existsSync(path.join(tmpProject, "aic.config.json")), "config removed");
    assert(!fs.existsSync(path.join(tmpProject, ".aic")), ".aic removed");
    const gi = fs.readFileSync(path.join(tmpProject, ".gitignore"), "utf8");
    assert(!gi.includes(".aic/"), "ignore line removed");
    assert(
      !fs.existsSync(path.join(tmpProject, ".claude", "CLAUDE.md")),
      "claude md removed",
    );
    console.log("claude_uninstall_removes_project_artifacts: pass");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function claude_uninstall_keep_project_artifacts_skips_project_files() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cl-kp-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cl-kp-p-"));
  try {
    fs.writeFileSync(path.join(tmpProject, "aic.config.json"), "{}\n", "utf8");
    fs.mkdirSync(path.join(tmpProject, ".aic"), { recursive: true });
    fs.writeFileSync(path.join(tmpProject, ".aic", "keep.txt"), "k", "utf8");
    runUninstall(envHomeProject(tmpHome, tmpProject), repoRoot(), [
      "--keep-project-artifacts",
    ]);
    assert(fs.existsSync(path.join(tmpProject, "aic.config.json")), "config kept");
    assert(fs.existsSync(path.join(tmpProject, ".aic", "keep.txt")), ".aic kept");
    console.log("claude_uninstall_keep_project_artifacts_skips_project_files: pass");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
}

function claude_remove_database_without_global_warns_stderr() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cl-rdb-"));
  try {
    const aicDir = path.join(tmpDir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true });
    fs.writeFileSync(path.join(aicDir, "aic.sqlite"), "db", "utf8");
    const r = spawnSync(process.execPath, [uninstallScript, "--remove-database"], {
      cwd: repoRoot(),
      env: envTmpHome(tmpDir),
      encoding: "utf8",
    });
    assert(r.status === 0, "exit 0");
    assert(
      String(r.stderr).includes("--remove-database") &&
        String(r.stderr).includes("--global"),
      "stderr warns",
    );
    assert(fs.existsSync(path.join(aicDir, "aic.sqlite")), ".aic sqlite kept");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log("claude_remove_database_without_global_warns_stderr: pass");
}

function claude_dev_mode_skips_uninstall() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cl-dv-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cl-dv-p-"));
  try {
    const settingsPath = path.join(tmpHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        { mcpServers: { aic: { command: "npx", args: ["-y", "@jatbas/aic@latest"] } } },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpProject, "aic.config.json"),
      JSON.stringify({ devMode: true }) + "\n",
      "utf8",
    );
    const out = runUninstall(envHomeProject(tmpHome, tmpProject), repoRoot(), []);
    assert(
      out.includes("Skipping uninstall") && out.includes("devMode: true"),
      "skip msg",
    );
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const servers = data.mcpServers || {};
    const aicKey = Object.keys(servers).find((k) => k.toLowerCase() === "aic");
    assert(aicKey !== undefined, "global settings untouched");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
  console.log("claude_dev_mode_skips_uninstall: pass");
}

function claude_dev_mode_force_uninstalls() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cl-dvf-h-"));
  const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "aic-cl-dvf-p-"));
  try {
    const settingsPath = path.join(tmpHome, ".claude", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        { mcpServers: { aic: { command: "npx", args: ["-y", "@jatbas/aic@latest"] } } },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmpProject, "aic.config.json"),
      JSON.stringify({ devMode: true }) + "\n",
      "utf8",
    );
    const out = runUninstall(envHomeProject(tmpHome, tmpProject), repoRoot(), [
      "--force",
      "--global",
    ]);
    assert(out.includes("Force-uninstalling AIC development project"), "force line");
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const servers = data.mcpServers || {};
    const aicKey = Object.keys(servers).find((k) => k.toLowerCase() === "aic");
    assert(aicKey === undefined, "aic stripped with force+global");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  }
  console.log("claude_dev_mode_force_uninstalls: pass");
}

claude_uninstall_removes_hooks_and_files();
claude_idempotent();
claude_settings_only_no_scripts_line();
claude_files_only_no_settings_line();
claude_strips_multiple_events();
claude_global_aic_clean_preserves_sqlite();
claude_global_aic_no_keep_db_wipes_dir();
claude_uninstall_removes_mcp_server();
claude_uninstall_removes_project_artifacts();
claude_uninstall_keep_project_artifacts_skips_project_files();
claude_remove_database_without_global_warns_stderr();
claude_dev_mode_skips_uninstall();
claude_dev_mode_force_uninstalls();
