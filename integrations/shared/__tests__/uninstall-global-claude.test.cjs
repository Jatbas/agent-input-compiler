// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { tryUninstallGlobalClaude } = require("../uninstall-global-claude.cjs");

function uninstall_removes_shared_aic_cjs_files() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    const hooksDir = path.join(tmpDir, ".claude", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    // Plant a named hook and a shared utility file
    fs.writeFileSync(path.join(hooksDir, "aic-session-start.cjs"), "", "utf8");
    fs.writeFileSync(path.join(hooksDir, "aic-conversation-id.cjs"), "", "utf8");
    fs.writeFileSync(path.join(hooksDir, "aic-session-model-cache.cjs"), "", "utf8");
    // Minimal settings.json so tryRemoveFromSettings does not throw
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify({ hooks: {}, mcpServers: {} }), "utf8");
    tryUninstallGlobalClaude(tmpDir);
    const remaining = fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir) : [];
    const aicFiles = remaining.filter((n) => /^aic-[a-z0-9-]+\.cjs$/.test(n));
    assert.strictEqual(
      aicFiles.length,
      0,
      "expected no aic-*.cjs files after uninstall, found: " + aicFiles.join(","),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function uninstall_does_not_remove_unrelated_files() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-uninstall-"));
  try {
    const hooksDir = path.join(tmpDir, ".claude", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, "custom-hook.js"), "", "utf8");
    fs.writeFileSync(path.join(hooksDir, "aic-conversation-id.cjs"), "", "utf8");
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify({ hooks: {}, mcpServers: {} }), "utf8");
    tryUninstallGlobalClaude(tmpDir);
    const remaining = fs.existsSync(hooksDir) ? fs.readdirSync(hooksDir) : [];
    assert(remaining.includes("custom-hook.js"), "non-AIC file must not be deleted");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const cases = [
  uninstall_removes_shared_aic_cjs_files,
  uninstall_does_not_remove_unrelated_files,
];

let failed = 0;
for (const fn of cases) {
  try {
    fn();
    console.log("OK", fn.name);
  } catch (err) {
    console.error("FAIL", fn.name, err.message);
    failed += 1;
  }
}
process.exit(failed > 0 ? 1 : 0);
