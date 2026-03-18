// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const installScript = path.join(__dirname, "..", "install.cjs");
const uninstallScript = path.join(__dirname, "..", "uninstall.cjs");

function runInstall(env, cwd) {
  execFileSync("node", [installScript], {
    cwd: cwd ?? path.dirname(installScript),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runUninstall(env, cwd) {
  return execFileSync("node", [uninstallScript], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    cwd: cwd ?? repoRoot(),
  });
}

function repoRoot() {
  return path.join(__dirname, "..", "..", "..");
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
    const out = runUninstall({ HOME: tmpDir }, tmpDir);
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
    runUninstall({ HOME: tmpHome }, tmpHome);
    const out2 = runUninstall({ HOME: tmpHome }, tmpHome);
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
    const out = runUninstall({ HOME: tmpDir }, tmpDir);
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
    const out = runUninstall({ HOME: tmpDir }, tmpDir);
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
    runUninstall({ HOME: tmpDir }, tmpDir);
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

claude_uninstall_removes_hooks_and_files();
claude_idempotent();
claude_settings_only_no_scripts_line();
claude_files_only_no_settings_line();
claude_strips_multiple_events();
