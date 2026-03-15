// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const installScript = path.join(__dirname, "..", "install.cjs");

function fresh_install_creates_settings() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-install-test-"),
  );
  try {
    execFileSync("node", [installScript], {
      cwd: tmpDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const settingsPath = path.join(tmpDir, ".claude", "settings.local.json");
    if (!fs.existsSync(settingsPath)) {
      throw new Error("Expected .claude/settings.local.json to exist");
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
    let foundCommandWithPath = false;
    for (const key of eventKeys) {
      const arr = data.hooks[key] || [];
      for (const wrapper of arr) {
        const hooks = wrapper.hooks || [];
        for (const hook of hooks) {
          const cmd = String(hook.command || "");
          if (
            cmd.includes("integrations") &&
            cmd.includes("claude") &&
            cmd.includes("hooks")
          ) {
            foundCommandWithPath = true;
            break;
          }
        }
        if (foundCommandWithPath) break;
      }
      if (foundCommandWithPath) break;
    }
    if (!foundCommandWithPath) {
      throw new Error(
        "Expected at least one command to contain path to integrations/claude/hooks",
      );
    }
    console.log("fresh_install_creates_settings: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function merge_preserves_non_aic_entries() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-install-merge-test-"),
  );
  try {
    const claudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    const settingsPath = path.join(claudeDir, "settings.local.json");
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
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir },
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
    console.log("merge_preserves_non_aic_entries: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

fresh_install_creates_settings();
merge_preserves_non_aic_entries();
