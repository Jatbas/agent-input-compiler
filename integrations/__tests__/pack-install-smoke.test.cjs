// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

"use strict";

const { execFileSync, execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const sharedDir = path.join(repoRoot, "shared");
const mcpDir = path.join(repoRoot, "mcp");

const cursorManifest = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "integrations", "cursor", "aic-hook-scripts.json"),
    "utf8",
  ),
);
const claudeManifest = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, "integrations", "claude", "aic-hook-scripts.json"),
    "utf8",
  ),
);

const sharedCjsFiles = fs
  .readdirSync(path.join(repoRoot, "integrations", "shared"))
  .filter((f) => f.endsWith(".cjs"));

const CURSOR_NON_DEPLOYABLE_SMOKE = new Set(["install.cjs", "uninstall.cjs"]);
const cursorLocalUtilFiles = fs
  .readdirSync(path.join(repoRoot, "integrations", "cursor"))
  .filter(
    (f) =>
      f.endsWith(".cjs") &&
      !CURSOR_NON_DEPLOYABLE_SMOKE.has(f) &&
      fs.statSync(path.join(repoRoot, "integrations", "cursor", f)).isFile(),
  );

// Bundle output paths — file lists are read after bundle scripts run (see try block)
const bundledSharedDir = path.join(repoRoot, "mcp", "integrations", "shared");
const bundledIntegrationsDir = path.join(repoRoot, "mcp", "integrations");

// mcp/package.json files field — every positive entry must resolve in the installed package
const mcpPkg = JSON.parse(fs.readFileSync(path.join(mcpDir, "package.json"), "utf8"));
const mcpFilesField = (mcpPkg.files || []).filter((f) => !f.startsWith("!"));

function assert(condition, label) {
  if (!condition) throw new Error("FAIL: " + label);
}

function assertFileExists(base, rel, label) {
  const full = path.join(base, rel);
  assert(fs.existsSync(full), label + " — " + rel + " missing");
}

const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "aic-pack-smoke-"));
const tarballs = path.join(tmpBase, "tarballs");
const projectDir = path.join(tmpBase, "project");
fs.mkdirSync(tarballs);
fs.mkdirSync(projectDir);

try {
  execFileSync(
    "node",
    [path.join(mcpDir, "scripts", "bundle-standalone-uninstall.cjs")],
    {
      cwd: repoRoot,
    },
  );
  execFileSync("node", [path.join(mcpDir, "scripts", "bundle-cursor-installer.cjs")], {
    cwd: repoRoot,
  });

  const bundledSharedFiles = fs.existsSync(bundledSharedDir)
    ? fs.readdirSync(bundledSharedDir).filter((f) => {
        const full = path.join(bundledSharedDir, f);
        return fs.statSync(full).isFile();
      })
    : [];
  const bundledTopLevelCjs = fs.existsSync(bundledIntegrationsDir)
    ? fs.readdirSync(bundledIntegrationsDir).filter((f) => {
        return (
          f.endsWith(".cjs") && fs.statSync(path.join(bundledIntegrationsDir, f)).isFile()
        );
      })
    : [];
  const bundledSubdirs = fs.existsSync(bundledIntegrationsDir)
    ? fs
        .readdirSync(bundledIntegrationsDir)
        .filter((f) => fs.statSync(path.join(bundledIntegrationsDir, f)).isDirectory())
    : [];

  execSync("pnpm pack --pack-destination " + JSON.stringify(tarballs), {
    cwd: sharedDir,
    stdio: "pipe",
  });
  execSync("pnpm pack --pack-destination " + JSON.stringify(tarballs), {
    cwd: mcpDir,
    stdio: "pipe",
  });

  const tarballFiles = fs.readdirSync(tarballs).filter((f) => f.endsWith(".tgz"));
  assert(
    tarballFiles.length === 2,
    "pack_produces_two_tarballs (got " + tarballFiles.length + ")",
  );

  const coreTgz = tarballFiles.find((f) => f.includes("aic-core"));
  const mcpTgz = tarballFiles.find((f) => f.endsWith(".tgz") && f !== coreTgz);
  assert(coreTgz, "pack_core_tarball_exists");
  assert(mcpTgz, "pack_mcp_tarball_exists");
  console.log("pack_produces_tarballs: pass");

  execSync("npm init -y", { cwd: projectDir, stdio: "pipe" });
  const installCmd =
    "npm install " +
    JSON.stringify(path.join(tarballs, coreTgz)) +
    " " +
    JSON.stringify(path.join(tarballs, mcpTgz));
  execSync(installCmd, { cwd: projectDir, stdio: "pipe" });
  console.log("tarball_installs_cleanly: pass");

  const pkgBase = path.join(projectDir, "node_modules", "@jatbas", "aic");
  const coreBase = path.join(projectDir, "node_modules", "@jatbas", "aic-core");

  const serverJs = fs.readFileSync(path.join(pkgBase, "dist", "server.js"), "utf8");
  assert(serverJs.startsWith("#!/usr/bin/env"), "server_entry_has_shebang");
  console.log("server_entry_has_shebang: pass");

  const binPath = path.join(projectDir, "node_modules", ".bin", "aic");
  assert(
    fs.existsSync(binPath) || fs.lstatSync(binPath).isSymbolicLink(),
    "bin_link_exists",
  );
  console.log("bin_link_exists: pass");

  assertFileExists(pkgBase, "integrations/cursor/install.cjs", "cursor_install");
  assertFileExists(pkgBase, "integrations/cursor/uninstall.cjs", "cursor_uninstall");
  assertFileExists(
    pkgBase,
    "integrations/cursor/aic-hook-scripts.json",
    "cursor_manifest",
  );
  assertFileExists(
    pkgBase,
    "integrations/cursor/hooks.json.template",
    "cursor_hooks_template",
  );
  assertFileExists(pkgBase, "integrations/claude/install.cjs", "claude_install");
  assertFileExists(pkgBase, "integrations/claude/uninstall.cjs", "claude_uninstall");
  assertFileExists(
    pkgBase,
    "integrations/claude/aic-hook-scripts.json",
    "claude_manifest",
  );
  assertFileExists(
    pkgBase,
    "integrations/claude/settings.json.template",
    "claude_settings_tmpl",
  );
  assertFileExists(
    pkgBase,
    "integrations/aic-uninstall-standalone.cjs",
    "standalone_uninstall",
  );
  assertFileExists(pkgBase, "integrations/clean-global-aic-dir.cjs", "clean_global");
  console.log("integration_scripts_present: pass");

  // Dynamic: every top-level .cjs from the bundle must appear in the installed package
  const installedTopLevel = fs
    .readdirSync(path.join(pkgBase, "integrations"))
    .filter((f) => {
      return (
        f.endsWith(".cjs") && fs.statSync(path.join(pkgBase, "integrations", f)).isFile()
      );
    });
  for (const name of bundledTopLevelCjs) {
    assert(installedTopLevel.includes(name), "top_level_cjs_" + name);
  }
  assert(
    installedTopLevel.length === bundledTopLevelCjs.length,
    "top_level_cjs_count (" +
      installedTopLevel.length +
      " vs expected " +
      bundledTopLevelCjs.length +
      ")",
  );
  console.log("top_level_integration_files_match_bundle: pass");

  // Dynamic: every subdirectory from the bundle must appear in the installed package
  const installedSubdirs = fs
    .readdirSync(path.join(pkgBase, "integrations"))
    .filter((f) => fs.statSync(path.join(pkgBase, "integrations", f)).isDirectory());
  for (const name of bundledSubdirs) {
    assert(installedSubdirs.includes(name), "integration_subdir_" + name);
  }
  assert(
    installedSubdirs.length === bundledSubdirs.length,
    "integration_subdir_count (" +
      installedSubdirs.length +
      " vs expected " +
      bundledSubdirs.length +
      ")",
  );
  console.log("integration_subdirs_match_bundle: pass");

  // Verify every positive entry in mcp/package.json files field resolves in the installed pkg
  for (const entry of mcpFilesField) {
    const resolved = path.join(pkgBase, entry);
    assert(
      fs.existsSync(resolved),
      "package_files_field_entry_" + entry + " (missing in installed package)",
    );
  }
  console.log("package_files_field_entries_present: pass");

  const installedCursorHooks = fs.readdirSync(
    path.join(pkgBase, "integrations", "cursor", "hooks"),
  );
  assert(
    installedCursorHooks.length === cursorManifest.hookScriptNames.length,
    "cursor_hooks_count (" +
      installedCursorHooks.length +
      " vs expected " +
      cursorManifest.hookScriptNames.length +
      ")",
  );
  for (const name of cursorManifest.hookScriptNames) {
    assert(installedCursorHooks.includes(name), "cursor_hook_" + name);
  }
  console.log("cursor_hooks_match_manifest: pass");

  const installedClaudeHooks = fs.readdirSync(
    path.join(pkgBase, "integrations", "claude", "hooks"),
  );
  assert(
    installedClaudeHooks.length === claudeManifest.hookScriptNames.length,
    "claude_hooks_count (" +
      installedClaudeHooks.length +
      " vs expected " +
      claudeManifest.hookScriptNames.length +
      ")",
  );
  for (const name of claudeManifest.hookScriptNames) {
    assert(installedClaudeHooks.includes(name), "claude_hook_" + name);
  }
  console.log("claude_hooks_match_manifest: pass");

  const installedShared = fs.readdirSync(path.join(pkgBase, "integrations", "shared"));
  assert(
    installedShared.length === bundledSharedFiles.length,
    "shared_utils_count (" +
      installedShared.length +
      " vs expected " +
      bundledSharedFiles.length +
      ")",
  );
  for (const name of sharedCjsFiles) {
    assert(installedShared.includes(name), "shared_util_" + name);
  }
  console.log("shared_utils_match_bundle: pass");

  assertFileExists(
    pkgBase,
    "integrations/claude/plugin/.claude-plugin/plugin.json",
    "plugin_json",
  );
  assertFileExists(
    pkgBase,
    "integrations/claude/plugin/.claude-plugin/marketplace.json",
    "plugin_marketplace",
  );
  assertFileExists(pkgBase, "integrations/claude/plugin/.mcp.json", "plugin_mcp");
  assertFileExists(
    pkgBase,
    "integrations/claude/plugin/hooks/hooks.json",
    "plugin_hooks",
  );

  const pluginScripts = fs.readdirSync(
    path.join(pkgBase, "integrations", "claude", "plugin", "scripts"),
  );
  assert(
    pluginScripts.length === claudeManifest.hookScriptNames.length,
    "plugin_scripts_count (" +
      pluginScripts.length +
      " vs " +
      claudeManifest.hookScriptNames.length +
      ")",
  );
  console.log("claude_plugin_structure: pass");

  function findRecursive(dir, predicate) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (predicate(entry.name, full)) results.push(full);
      if (entry.isDirectory()) results.push(...findRecursive(full, predicate));
    }
    return results;
  }

  const junk = findRecursive(pkgBase, (name) => {
    return (
      name === "__tests__" ||
      name === "fixtures" ||
      name.endsWith(".test.ts") ||
      name.endsWith(".test.js") ||
      name.endsWith(".test.cjs")
    );
  });
  assert(junk.length === 0, "no_test_artifacts_in_package: found " + junk.join(", "));
  console.log("no_test_artifacts_in_package: pass");

  assert(fs.existsSync(path.join(coreBase, "dist", "index.js")), "aic_core_index_js");
  assert(fs.existsSync(path.join(coreBase, "dist", "index.d.ts")), "aic_core_index_dts");
  assert(
    fs.existsSync(path.join(coreBase, "dist", "storage", "aic-ignore-entries.json")),
    "aic_core_ignore_entries",
  );
  console.log("aic_core_package_layout: pass");

  // Verify the published binary actually runs (init is the cheapest CLI subcommand)
  const initDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-bin-init-"));
  try {
    execFileSync(process.execPath, [path.join(pkgBase, "dist", "server.js"), "init"], {
      cwd: initDir,
      encoding: "utf8",
      env: { ...process.env, HOME: tmpBase },
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert(
      fs.existsSync(path.join(initDir, "aic.config.json")),
      "binary_init_creates_config",
    );
  } finally {
    fs.rmSync(initDir, { recursive: true, force: true });
  }
  console.log("binary_execution_from_package: pass");

  execFileSync(
    process.execPath,
    [path.join(pkgBase, "integrations", "cursor", "install.cjs")],
    { cwd: projectDir, encoding: "utf8", env: { ...process.env, HOME: tmpBase } },
  );
  assertFileExists(projectDir, ".cursor/hooks.json", "cursor_install_hooks_json");
  assertFileExists(projectDir, ".cursor/rules/AIC.mdc", "cursor_install_rule");
  const installedHooksDir = path.join(projectDir, ".cursor", "hooks");
  const installedHookFiles = fs.readdirSync(installedHooksDir);
  const expectedTotal =
    cursorManifest.hookScriptNames.length +
    sharedCjsFiles.length +
    cursorLocalUtilFiles.length;
  assert(
    installedHookFiles.length === expectedTotal,
    "cursor_install_hook_file_count (" +
      installedHookFiles.length +
      " vs expected " +
      expectedTotal +
      ")",
  );
  console.log("cursor_install_from_package: pass");

  const tmpClaudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-pack-claude-h-"));
  try {
    execFileSync(
      process.execPath,
      [path.join(pkgBase, "integrations", "claude", "install.cjs")],
      {
        cwd: projectDir,
        encoding: "utf8",
        env: { ...process.env, HOME: tmpClaudeHome },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    assertFileExists(tmpClaudeHome, ".claude/settings.json", "claude_install_settings");
    const claudeHooksDir = path.join(tmpClaudeHome, ".claude", "hooks");
    assert(fs.existsSync(claudeHooksDir), "claude_install_hooks_dir_exists");
    const claudeHookFiles = fs.readdirSync(claudeHooksDir);
    for (const name of claudeManifest.hookScriptNames) {
      assert(claudeHookFiles.includes(name), "claude_installed_hook_" + name);
    }
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpClaudeHome, ".claude", "settings.json"), "utf8"),
    );
    assert(
      settings.hooks && typeof settings.hooks === "object",
      "claude_install_settings_has_hooks",
    );
    console.log("claude_install_from_package: pass");

    execFileSync(
      process.execPath,
      [
        path.join(pkgBase, "integrations", "claude", "uninstall.cjs"),
        "--project-root",
        projectDir,
        "--global",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, HOME: tmpClaudeHome },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const settingsAfter = JSON.parse(
      fs.readFileSync(path.join(tmpClaudeHome, ".claude", "settings.json"), "utf8"),
    );
    const hooksAfter = settingsAfter.hooks || {};
    const hasAicHook = Object.values(hooksAfter).some(
      (arr) =>
        Array.isArray(arr) &&
        arr.some((h) => {
          const matcher = typeof h === "string" ? h : h && h.matcher ? h.matcher : "";
          return matcher.includes("aic-");
        }),
    );
    assert(!hasAicHook, "claude_uninstall_removes_hooks");
    if (fs.existsSync(claudeHooksDir)) {
      const remainingHooks = fs.readdirSync(claudeHooksDir);
      const remainingAicShared = remainingHooks.filter((n) =>
        /^aic-[a-z0-9-]+\.cjs$/.test(n),
      );
      assert(
        remainingAicShared.length === 0,
        "claude_uninstall_removes_aic_shared_files (" +
          remainingAicShared.join(",") +
          " remain)",
      );
    }
    console.log("claude_uninstall_from_package: pass");
  } finally {
    fs.rmSync(tmpClaudeHome, { recursive: true, force: true });
  }

  execFileSync(
    process.execPath,
    [
      path.join(pkgBase, "integrations", "cursor", "uninstall.cjs"),
      "--project-root",
      projectDir,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, HOME: tmpBase },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const hooksJsonAfter = JSON.parse(
    fs.readFileSync(path.join(projectDir, ".cursor", "hooks.json"), "utf8"),
  );
  const allCmds = Object.values(hooksJsonAfter.hooks || {}).flatMap((arr) =>
    Array.isArray(arr)
      ? arr.map((e) => (typeof e === "string" ? e : e.command || ""))
      : [],
  );
  const hasAicCmd = allCmds.some((c) => c.includes("AIC-") || c.includes("aic-"));
  assert(!hasAicCmd, "cursor_uninstall_clears_aic_hooks");
  const hooksDir = path.join(projectDir, ".cursor", "hooks");
  if (fs.existsSync(hooksDir)) {
    const remainingHooks = fs.readdirSync(hooksDir);
    const aicHooks = remainingHooks.filter((n) => n.startsWith("AIC-"));
    assert(
      aicHooks.length === 0,
      "cursor_uninstall_removes_aic_scripts (found: " + aicHooks.join(", ") + ")",
    );
  }
  assert(
    !fs.existsSync(path.join(projectDir, ".cursor", "rules", "AIC.mdc")),
    "cursor_uninstall_removes_rule",
  );
  console.log("cursor_uninstall_from_package: pass");

  console.log("\nAll pack-install smoke tests passed.");
} finally {
  fs.rmSync(tmpBase, { recursive: true, force: true });
}
