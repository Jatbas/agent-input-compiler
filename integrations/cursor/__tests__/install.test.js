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

function runInstaller(cwd) {
  execFileSync("node", [installScript], { cwd, encoding: "utf8" });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function install_creates_all_artifacts() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-install-"));
  try {
    runInstaller(tmpDir);
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    assert(fs.existsSync(hooksDir), ".cursor/hooks exists");
    const names = fs.readdirSync(hooksDir);
    assert(names.length === 10, "10 scripts in .cursor/hooks");
    for (const name of AIC_SCRIPT_NAMES) {
      assert(names.includes(name), `script ${name} present`);
    }
    const hooksJsonPath = path.join(tmpDir, ".cursor", "hooks.json");
    assert(fs.existsSync(hooksJsonPath), ".cursor/hooks.json exists");
    const hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
    assert(hooksJson.version === 1, "hooks.json version 1");
    assert(
      hooksJson.hooks && typeof hooksJson.hooks === "object",
      "hooks object present",
    );
    const triggerPath = path.join(tmpDir, ".cursor", "rules", "AIC.mdc");
    assert(fs.existsSync(triggerPath), ".cursor/rules/AIC.mdc exists");
    const triggerContent = fs.readFileSync(triggerPath, "utf8");
    assert(triggerContent.includes(tmpDir), "AIC.mdc contains projectRoot");
    assert(/AIC rule version:\s*\S+/.test(triggerContent), "AIC.mdc contains version");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function install_idempotent() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-install-"));
  try {
    runInstaller(tmpDir);
    const scriptPath = path.join(tmpDir, ".cursor", "hooks", "AIC-session-init.cjs");
    const hooksJsonPath = path.join(tmpDir, ".cursor", "hooks.json");
    const triggerPath = path.join(tmpDir, ".cursor", "rules", "AIC.mdc");
    const content1 = fs.readFileSync(scriptPath, "utf8");
    const json1 = fs.readFileSync(hooksJsonPath, "utf8");
    const mdc1 = fs.readFileSync(triggerPath, "utf8");
    runInstaller(tmpDir);
    const content2 = fs.readFileSync(scriptPath, "utf8");
    const json2 = fs.readFileSync(hooksJsonPath, "utf8");
    const mdc2 = fs.readFileSync(triggerPath, "utf8");
    assert(content1 === content2, "script content unchanged after second run");
    assert(json1 === json2, "hooks.json unchanged after second run");
    assert(mdc1 === mdc2, "AIC.mdc unchanged after second run");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function install_merges_hooks_json() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-install-"));
  try {
    const cursorDir = path.join(tmpDir, ".cursor");
    fs.mkdirSync(cursorDir, { recursive: true });
    const existingHooks = {
      version: 1,
      hooks: {
        sessionStart: [{ command: "node .cursor/hooks/custom-session.cjs" }],
      },
    };
    fs.writeFileSync(
      path.join(cursorDir, "hooks.json"),
      JSON.stringify(existingHooks, null, 2) + "\n",
      "utf8",
    );
    runInstaller(tmpDir);
    const hooksJson = JSON.parse(
      fs.readFileSync(path.join(cursorDir, "hooks.json"), "utf8"),
    );
    const sessionStart = hooksJson.hooks.sessionStart || [];
    const hasCustom = sessionStart.some((e) =>
      (e.command || "").includes("custom-session.cjs"),
    );
    const hasAic = sessionStart.some((e) =>
      (e.command || "").includes("AIC-session-init.cjs"),
    );
    assert(hasCustom, "non-AIC entry preserved");
    assert(hasAic, "AIC entries merged from template");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function install_removes_stale_scripts() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-install-"));
  try {
    runInstaller(tmpDir);
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    const stalePath = path.join(hooksDir, "AIC-old-removed.cjs");
    fs.writeFileSync(stalePath, "stale", "utf8");
    assert(fs.existsSync(stalePath), "stale file created");
    runInstaller(tmpDir);
    assert(!fs.existsSync(stalePath), "stale AIC script removed");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const tests = [
  ["install_creates_all_artifacts", install_creates_all_artifacts],
  ["install_idempotent", install_idempotent],
  ["install_merges_hooks_json", install_merges_hooks_json],
  ["install_removes_stale_scripts", install_removes_stale_scripts],
];
for (const [name, fn] of tests) {
  fn();
  console.log("ok:", name);
}
