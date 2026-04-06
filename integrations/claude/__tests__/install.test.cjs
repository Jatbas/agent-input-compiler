// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const installScript = path.join(__dirname, "..", "install.cjs");

const AIC_SCRIPT_NAMES = [
  "aic-compile-helper.cjs",
  "aic-session-start.cjs",
  "aic-prompt-compile.cjs",
  "aic-subagent-inject.cjs",
  "aic-pre-compact.cjs",
  "aic-after-file-edit-tracker.cjs",
  "aic-stop-quality-check.cjs",
  "aic-block-no-verify.cjs",
  "aic-inject-conversation-id.cjs",
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

function legacy_project_local_cleanup() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-install-legacy-cleanup-"),
  );
  try {
    const projectDir = path.join(tmpDir, "project");
    fs.mkdirSync(projectDir, { recursive: true });
    const projectHooksDir = path.join(projectDir, ".claude", "hooks");
    fs.mkdirSync(projectHooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectHooksDir, "aic-session-start.cjs"),
      "// legacy",
      "utf8",
    );
    fs.writeFileSync(
      path.join(projectDir, ".claude", "settings.local.json"),
      '{"hooks":{}}',
      "utf8",
    );
    const homeDir = path.join(tmpDir, "home");
    fs.mkdirSync(homeDir, { recursive: true });
    execFileSync("node", [installScript], {
      cwd: projectDir,
      env: { ...process.env, HOME: homeDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const hooksPath = path.join(projectDir, ".claude", "hooks");
    if (fs.existsSync(hooksPath)) {
      const names = fs.readdirSync(hooksPath);
      if (names.length !== 0) {
        throw new Error(
          "Expected project .claude/hooks to be empty, got: " + names.join(", "),
        );
      }
    }
    const settingsLocalPath = path.join(projectDir, ".claude", "settings.local.json");
    if (fs.existsSync(settingsLocalPath)) {
      throw new Error("Expected .claude/settings.local.json to be removed");
    }
    console.log("legacy_project_local_cleanup: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function fresh_install_writes_mcp_server() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-install-mcp-test-"),
  );
  try {
    execFileSync("node", [installScript], {
      cwd: tmpDir,
      env: { ...process.env, HOME: tmpDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const servers = data.mcpServers;
    if (!servers || typeof servers !== "object") {
      throw new Error("Expected mcpServers to be present");
    }
    const aicKey = Object.keys(servers).find((k) => k.toLowerCase() === "aic");
    if (aicKey === undefined) {
      throw new Error("Expected mcpServers.aic to be present");
    }
    const entry = servers[aicKey];
    if (entry.command !== "npx") {
      throw new Error("Expected mcpServers.aic.command to be npx");
    }
    if (!Array.isArray(entry.args) || !entry.args.includes("@jatbas/aic@latest")) {
      throw new Error("Expected mcpServers.aic.args to include @jatbas/aic@latest");
    }
    console.log("fresh_install_writes_mcp_server: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function merge_preserves_existing_custom_mcp_server() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-install-mcp-preserve-"),
  );
  try {
    const globalClaudeDir = path.join(tmpDir, ".claude");
    fs.mkdirSync(globalClaudeDir, { recursive: true });
    const settingsPath = path.join(globalClaudeDir, "settings.json");
    const customEntry = { command: "node", args: ["/custom/server.js"] };
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ mcpServers: { aic: customEntry } }, null, 2) + "\n",
      "utf8",
    );
    execFileSync("node", [installScript], {
      cwd: tmpDir,
      env: { ...process.env, HOME: tmpDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const entry = data.mcpServers && data.mcpServers.aic;
    if (!entry || entry.command !== "node") {
      throw new Error("Expected existing custom aic entry to be preserved");
    }
    console.log("merge_preserves_existing_custom_mcp_server: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function claude_install_deploys_shared_as_aic_prefix() {
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
    const names = fs.readdirSync(globalHooksDir);
    if (!names.includes("aic-conversation-id.cjs")) {
      throw new Error("Expected aic-conversation-id.cjs to be deployed");
    }
    if (names.includes("conversation-id.cjs")) {
      throw new Error("Expected conversation-id.cjs not to be deployed under old name");
    }
    if (!names.includes("aic-session-model-cache.cjs")) {
      throw new Error("Expected aic-session-model-cache.cjs to be deployed");
    }
    if (names.includes("session-model-cache.cjs")) {
      throw new Error(
        "Expected session-model-cache.cjs not to be deployed under old name",
      );
    }
    if (!names.includes("aic-dir.cjs")) {
      throw new Error("Expected aic-dir.cjs to remain as aic-dir.cjs");
    }
    console.log("claude_install_deploys_shared_as_aic_prefix: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function claude_install_rewrites_require_to_aic_prefix() {
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
    const content = fs.readFileSync(
      path.join(globalHooksDir, "aic-session-start.cjs"),
      "utf8",
    );
    if (!content.includes('require("./aic-conversation-id.cjs")')) {
      throw new Error(
        "Expected installed aic-session-start.cjs to require ./aic-conversation-id.cjs",
      );
    }
    if (content.includes("../../shared/")) {
      throw new Error("Expected no ../../shared/ paths in installed hook");
    }
    console.log("claude_install_rewrites_require_to_aic_prefix: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function claude_install_migrates_old_style_shared_files() {
  const tmpDir = fs.mkdtempSync(
    path.join(require("node:os").tmpdir(), "aic-install-test-"),
  );
  try {
    const globalHooksDir = path.join(tmpDir, ".claude", "hooks");
    fs.mkdirSync(globalHooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalHooksDir, "conversation-id.cjs"),
      "// @aic-managed\n// Copyright (c) 2025 AIC Contributors\nold content",
      "utf8",
    );
    execFileSync("node", [installScript], {
      cwd: tmpDir,
      env: { ...process.env, HOME: tmpDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const names = fs.readdirSync(globalHooksDir);
    if (names.includes("conversation-id.cjs")) {
      throw new Error("Expected conversation-id.cjs removed after migrate install");
    }
    if (!names.includes("aic-conversation-id.cjs")) {
      throw new Error("Expected aic-conversation-id.cjs present after migrate install");
    }
    console.log("claude_install_migrates_old_style_shared_files: pass");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

fresh_install_creates_global_settings();
merge_preserves_non_aic_entries();
legacy_project_local_cleanup();
fresh_install_writes_mcp_server();
merge_preserves_existing_custom_mcp_server();
claude_install_deploys_shared_as_aic_prefix();
claude_install_rewrites_require_to_aic_prefix();
claude_install_migrates_old_style_shared_files();
