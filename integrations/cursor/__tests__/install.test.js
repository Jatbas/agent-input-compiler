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
  "AIC-subagent-compile.cjs",
  "subagent-start-model-id.cjs",
  "AIC-stop-quality-check.cjs",
];

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const installScript = path.join(repoRoot, "integrations", "cursor", "install.cjs");

const hookManifest = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "integrations", "cursor", "aic-hook-scripts.json"),
    "utf8",
  ),
);
const sharedDirForCount = path.join(repoRoot, "integrations", "shared");
const sharedEntriesForCount = fs.readdirSync(sharedDirForCount);
const expectedHookFileCount =
  hookManifest.hookScriptNames.length +
  sharedEntriesForCount.reduce((acc, name) => {
    if (!name.endsWith(".cjs")) return acc;
    const src = path.join(sharedDirForCount, name);
    return fs.statSync(src).isFile() ? acc + 1 : acc;
  }, 0);

function runInstaller(cwd, env = {}) {
  execFileSync("node", [installScript], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
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
    assert(
      names.length === expectedHookFileCount,
      `${expectedHookFileCount} files in .cursor/hooks`,
    );
    for (const name of AIC_SCRIPT_NAMES) {
      assert(names.includes(name), `script ${name} present`);
    }
    const compileContextPath = path.join(hooksDir, "AIC-compile-context.cjs");
    const compileContextContent = fs.readFileSync(compileContextPath, "utf8");
    assert(
      !compileContextContent.includes("../../shared/"),
      "installed hook has no ../../shared/ require path",
    );
    assert(
      compileContextContent.includes('require("./session-model-cache.cjs")'),
      "installed hook uses local require for session-model-cache",
    );
    const hooksJsonPath = path.join(tmpDir, ".cursor", "hooks.json");
    assert(fs.existsSync(hooksJsonPath), ".cursor/hooks.json exists");
    const hooksJson = JSON.parse(fs.readFileSync(hooksJsonPath, "utf8"));
    assert(hooksJson.version === 1, "hooks.json version 1");
    assert(
      hooksJson.hooks && typeof hooksJson.hooks === "object",
      "hooks object present",
    );
    assert(
      Array.isArray(hooksJson.hooks.subagentStart) &&
        hooksJson.hooks.subagentStart.length > 0 &&
        hooksJson.hooks.subagentStart.some((e) =>
          (e.command || "").includes("AIC-subagent-compile.cjs"),
        ),
      "hooks.json has subagentStart with AIC-subagent-compile.cjs",
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

function install_expected_scripts() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-install-expected-"));
  try {
    runInstaller(tmpDir);
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    const names = fs.readdirSync(hooksDir);
    assert(
      names.length === expectedHookFileCount,
      `${expectedHookFileCount} files in .cursor/hooks`,
    );
    for (const name of AIC_SCRIPT_NAMES) {
      assert(names.includes(name), `script ${name} present`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function install_test_js_expected_hook_count_tracks_manifest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-install-manifest-"));
  try {
    runInstaller(tmpDir);
    const hooksDir = path.join(tmpDir, ".cursor", "hooks");
    const names = fs.readdirSync(hooksDir);
    assert(
      names.length === expectedHookFileCount,
      `${expectedHookFileCount} files in .cursor/hooks (manifest + shared *.cjs)`,
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function install_idempotent() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-install-"));
  try {
    runInstaller(tmpDir);
    const scriptPath = path.join(tmpDir, ".cursor", "hooks", "AIC-session-init.cjs");
    const sharedPath = path.join(tmpDir, ".cursor", "hooks", "session-model-cache.cjs");
    const hooksJsonPath = path.join(tmpDir, ".cursor", "hooks.json");
    const triggerPath = path.join(tmpDir, ".cursor", "rules", "AIC.mdc");
    const content1 = fs.readFileSync(scriptPath, "utf8");
    const shared1 = fs.readFileSync(sharedPath, "utf8");
    const json1 = fs.readFileSync(hooksJsonPath, "utf8");
    const mdc1 = fs.readFileSync(triggerPath, "utf8");
    runInstaller(tmpDir);
    const content2 = fs.readFileSync(scriptPath, "utf8");
    const shared2 = fs.readFileSync(sharedPath, "utf8");
    const json2 = fs.readFileSync(hooksJsonPath, "utf8");
    const mdc2 = fs.readFileSync(triggerPath, "utf8");
    assert(content1 === content2, "script content unchanged after second run");
    assert(shared1 === shared2, "shared file content unchanged after second run");
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

function install_heals_workspace_aic_when_global_has_aic() {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-fake-home-"));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-install-"));
  try {
    const globalCursor = path.join(fakeHome, ".cursor");
    fs.mkdirSync(globalCursor, { recursive: true });
    fs.writeFileSync(
      path.join(globalCursor, "mcp.json"),
      JSON.stringify({
        mcpServers: { aic: { command: "npx", args: ["-y", "@jatbas/aic@latest"] } },
      }) + "\n",
      "utf8",
    );
    const projCursor = path.join(tmpDir, ".cursor");
    fs.mkdirSync(projCursor, { recursive: true });
    fs.writeFileSync(
      path.join(projCursor, "mcp.json"),
      JSON.stringify({
        mcpServers: {
          AIC: { command: "npx", args: ["-y", "@jatbas/aic@latest"] },
          other: { command: "echo", args: [] },
        },
      }) + "\n",
      "utf8",
    );
    runInstaller(tmpDir, { HOME: fakeHome, USERPROFILE: fakeHome });
    const after = JSON.parse(fs.readFileSync(path.join(projCursor, "mcp.json"), "utf8"));
    assert(
      after.mcpServers && Object.keys(after.mcpServers).length === 1,
      "only one mcp server left",
    );
    assert(after.mcpServers.other !== undefined, "non-aic server preserved");
    assert(
      Object.keys(after.mcpServers).every((k) => k.toLowerCase() !== "aic"),
      "aic key removed case-insensitively",
    );
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function install_keeps_workspace_aic_when_global_has_no_aic() {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-fake-home-"));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-install-"));
  try {
    const globalCursor = path.join(fakeHome, ".cursor");
    fs.mkdirSync(globalCursor, { recursive: true });
    fs.writeFileSync(
      path.join(globalCursor, "mcp.json"),
      JSON.stringify({ mcpServers: { otherGlobal: { command: "x" } } }) + "\n",
      "utf8",
    );
    const projCursor = path.join(tmpDir, ".cursor");
    fs.mkdirSync(projCursor, { recursive: true });
    const before = {
      mcpServers: { aic: { command: "npx", args: ["-y", "@jatbas/aic"] } },
    };
    fs.writeFileSync(
      path.join(projCursor, "mcp.json"),
      JSON.stringify(before, null, 2) + "\n",
      "utf8",
    );
    runInstaller(tmpDir, { HOME: fakeHome, USERPROFILE: fakeHome });
    const after = JSON.parse(fs.readFileSync(path.join(projCursor, "mcp.json"), "utf8"));
    assert(
      after.mcpServers && after.mcpServers.aic !== undefined,
      "workspace aic kept when global has no aic",
    );
  } finally {
    fs.rmSync(fakeHome, { recursive: true, force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const tests = [
  ["install_creates_all_artifacts", install_creates_all_artifacts],
  [
    "install_test_js_expected_hook_count_tracks_manifest",
    install_test_js_expected_hook_count_tracks_manifest,
  ],
  ["install_expected_scripts", install_expected_scripts],
  ["install_idempotent", install_idempotent],
  ["install_merges_hooks_json", install_merges_hooks_json],
  ["install_removes_stale_scripts", install_removes_stale_scripts],
  [
    "install_heals_workspace_aic_when_global_has_aic",
    install_heals_workspace_aic_when_global_has_aic,
  ],
  [
    "install_keeps_workspace_aic_when_global_has_no_aic",
    install_keeps_workspace_aic_when_global_has_no_aic,
  ],
];
for (const [name, fn] of tests) {
  fn();
  console.log("ok:", name);
}
