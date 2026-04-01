// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const installScript = path.join(__dirname, "..", "install.cjs");
const sharedDir = path.join(__dirname, "..", "..", "shared");
const manifestPath = path.join(__dirname, "..", "aic-hook-scripts.json");

function runInstall(tmpHome, tmpProjectDir) {
  execFileSync("node", [installScript], {
    cwd: tmpProjectDir,
    env: { ...process.env, HOME: tmpHome, CLAUDE_PROJECT_DIR: tmpProjectDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sharedDeployedName(name) {
  return name.startsWith("aic-") ? name : "aic-" + name;
}

function claude_install_shared_utils_present() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-claude-verify-h-"));
  const tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-claude-verify-p-"));
  try {
    runInstall(tmpHome, tmpProjectDir);
    const sharedNames = fs
      .readdirSync(sharedDir)
      .filter(
        (name) =>
          name.endsWith(".cjs") && fs.statSync(path.join(sharedDir, name)).isFile(),
      );
    for (const name of sharedNames) {
      const deployed = sharedDeployedName(name);
      assert(
        fs.existsSync(path.join(tmpHome, ".claude", "hooks", deployed)),
        `expected shared hook copy: ${deployed} (from ${name})`,
      );
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const { hookScriptNames } = manifest;
    for (const name of hookScriptNames) {
      assert(
        fs.existsSync(path.join(tmpHome, ".claude", "hooks", name)),
        `expected manifest hook: ${name}`,
      );
    }
    console.log("ok: claude_install_shared_utils_present");
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProjectDir, { recursive: true, force: true });
  }
}

claude_install_shared_utils_present();
