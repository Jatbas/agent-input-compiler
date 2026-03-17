// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const installScript = path.join(__dirname, "..", "install.cjs");
const uninstallScript = path.join(__dirname, "..", "uninstall.cjs");

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

function runInstall(env) {
  execFileSync("node", [installScript], {
    cwd: path.dirname(installScript),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runUninstall(env) {
  return execFileSync("node", [uninstallScript], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function claude_uninstall_removes_hooks_and_files() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-uninstall-test-"),
  );
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
    runUninstall({ HOME: tmpDir });
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
    const hasAic = allCommands.some((c) => /aic-[a-z0-9-]+\.cjs/.test(c));
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
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-uninstall-idem-"),
  );
  try {
    runInstall({ HOME: tmpDir });
    runUninstall({ HOME: tmpDir });
    const out2 = runUninstall({ HOME: tmpDir });
    assert(
      out2.includes("not found") || out2.includes("was not found"),
      "second uninstall reports not found",
    );
    console.log("claude_idempotent: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

claude_uninstall_removes_hooks_and_files();
claude_idempotent();
