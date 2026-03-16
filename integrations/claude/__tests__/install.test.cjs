// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const installScript = path.join(__dirname, "..", "install.cjs");

const AIC_SCRIPT_NAMES = [
  "aic-session-start.cjs",
  "aic-prompt-compile.cjs",
  "aic-subagent-inject.cjs",
  "aic-pre-compact.cjs",
  "aic-after-file-edit-tracker.cjs",
  "aic-stop-quality-check.cjs",
  "aic-block-no-verify.cjs",
  "aic-session-end.cjs",
];

function fresh_install_creates_global_settings() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-install-test-"),
  );
  try {
    execFileSync("node", [installScript], {
      cwd: tmpDir,
      env: { ...process.env, HOME: tmpDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const globalHooksDir = path.join(tmpDir, ".claude", "hooks");
    if (!fs.existsSync(globalHooksDir)) {
      throw new Error("Expected .claude/hooks/ to exist");
    }
    for (const name of AIC_SCRIPT_NAMES) {
      const p = path.join(globalHooksDir, name);
      if (!fs.existsSync(p)) {
        throw new Error("Expected hook script: " + name);
      }
    }
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    if (!fs.existsSync(settingsPath)) {
      throw new Error("Expected .claude/settings.json to exist");
    }
    const raw = fs.readFileSync(settingsPath, "utf8");
    const data = JSON.parse(raw);
    if (!data.hooks || typeof data.hooks !== "object") {
      throw new Error("Expected settings to have hooks object");
    }
    const eventKeys = Object.keys(data.hooks);
    if (eventKeys.length === 0) {
      throw new Error("Expected at least one hook event key");
    }
    let foundAicWithGlobalPath = false;
    for (const key of eventKeys) {
      const arr = data.hooks[key] || [];
      for (const wrapper of arr) {
        const hooks = wrapper.hooks || [];
        for (const hook of hooks) {
          const cmd = String(hook.command || "");
          if (
            cmd.includes("aic-") &&
            (cmd.includes(".claude/hooks/") || cmd.includes("$HOME/.claude/hooks"))
          ) {
            foundAicWithGlobalPath = true;
            break;
          }
        }
        if (foundAicWithGlobalPath) break;
      }
      if (foundAicWithGlobalPath) break;
    }
    if (!foundAicWithGlobalPath) {
      throw new Error(
        "Expected at least one command to contain aic- and .claude/hooks/ or $HOME/.claude/hooks",
      );
    }
    console.log("fresh_install_creates_global_settings: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function merge_preserves_non_aic_entries() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-install-merge-test-"),
  );
  try {
    const globalClaudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(globalClaudeDir, { recursive: true });
    const settingsPath = path.join(globalClaudeDir, "settings.json");
    const nonAicPayload = {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: "node /some/custom-script.cjs",
                timeout: 5,
              },
            ],
          },
        ],
      },
    };
    fs.writeFileSync(settingsPath, JSON.stringify(nonAicPayload, null, 2) + "\n", "utf8");
    execFileSync("node", [installScript], {
      cwd: tmpDir,
      env: { ...process.env, HOME: tmpDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const raw = fs.readFileSync(settingsPath, "utf8");
    const data = JSON.parse(raw);
    const sessionStart = data.hooks?.SessionStart || [];
    const commands = sessionStart.flatMap((w) =>
      (w.hooks || []).map((h) => String(h.command || "")),
    );
    const hasCustom = commands.some((c) => c.includes("custom-script.cjs"));
    if (!hasCustom) {
      throw new Error("Expected non-AIC entry (custom-script.cjs) to be preserved");
    }
    const hasAic = commands.some((c) => c.includes("aic-"));
    if (!hasAic) {
      throw new Error("Expected AIC hook entries to be present");
    }
    console.log("merge_preserves_non_aic_entries: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

fresh_install_creates_global_settings();
merge_preserves_non_aic_entries();
