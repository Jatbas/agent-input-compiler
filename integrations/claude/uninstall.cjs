// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const os = require("node:os");

const {
  resolveGlobalKeepAicDatabase,
  tryCleanGlobalAicDir,
} = require("../clean-global-aic-dir.cjs");
const { tryUninstallGlobalClaude } = require("../shared/uninstall-global-claude.cjs");
const { tryUninstallProjectAic } = require("../shared/uninstall-project-aic.cjs");
const { isDevModeTrue } = require("../shared/read-project-dev-mode.cjs");
const {
  resolveProjectRoot: resolveProjectRootShared,
} = require("../shared/resolve-project-root.cjs");

function projectRootFromArgv() {
  const argv = process.argv;
  const idx = argv.findIndex(
    (a) => a === "--project-root" || a.startsWith("--project-root="),
  );
  if (idx === -1) return null;
  const arg = argv[idx];
  const eq = arg.indexOf("=");
  if (eq !== -1) return path.resolve(arg.slice(eq + 1));
  if (idx + 1 < argv.length) return path.resolve(argv[idx + 1]);
  return null;
}

function parseKeepProjectArtifacts(argv) {
  return argv.includes("--keep-project-artifacts");
}

function run() {
  const argv = process.argv;
  const home = os.homedir();
  const globalCleanup = argv.includes("--global");
  const force = argv.includes("--force");
  const removeDatabase = argv.includes("--remove-database");
  const envRoot =
    process.env.AIC_UNINSTALL_PROJECT_ROOT != null &&
    String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim() !== ""
      ? path.resolve(String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim())
      : null;
  const projectRoot =
    projectRootFromArgv() ??
    envRoot ??
    resolveProjectRootShared(null, { env: process.env, useAicProjectRoot: true });
  const devMode = isDevModeTrue(projectRoot);
  if (devMode && !force) {
    process.stdout.write(
      "This is an AIC development project (devMode: true in aic.config.json). Skipping uninstall.\n",
    );
    return "devmode-skip";
  }
  if (force && devMode) {
    process.stdout.write("Force-uninstalling AIC development project.\n");
  }
  if (removeDatabase && !globalCleanup) {
    process.stderr.write(
      "Warning: --remove-database only applies with --global. Ignored.\n",
    );
  }
  const keepProjectArtifacts = parseKeepProjectArtifacts(argv);
  const projectAic = tryUninstallProjectAic(projectRoot, {
    keepProjectArtifacts,
    homeDir: home,
  });
  let globalClaude = { changed: false, parts: [] };
  let globalAic = { changed: false, message: null };
  if (globalCleanup) {
    globalClaude = tryUninstallGlobalClaude(home);
    const keepDb = resolveGlobalKeepAicDatabase(argv, process.env);
    globalAic = tryCleanGlobalAicDir(home, keepDb);
  }
  const changed = globalClaude.changed || projectAic.changed || globalAic.changed;
  if (!changed) {
    process.stdout.write("Nothing to remove. No need to restart Claude Code.\n");
    return "unchanged";
  }
  const parts = [...globalClaude.parts, ...projectAic.parts];
  if (globalAic.message) {
    parts.push(globalAic.message);
  }
  parts.push("Restart Claude Code (or reload) to complete uninstall.");
  process.stdout.write(parts.join(" ") + "\n");
  return "changed";
}

module.exports = { run };

if (require.main === module) {
  if (run() === "devmode-skip") process.exit(0);
}
