// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const os = require("node:os");

const {
  parseKeepAicDatabase,
  tryCleanGlobalAicDir,
} = require("../clean-global-aic-dir.cjs");
const { tryUninstallGlobalClaude } = require("../shared/uninstall-global-claude.cjs");
const { tryUninstallProjectAic } = require("../shared/uninstall-project-aic.cjs");
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
  const home = os.homedir();
  const envRoot =
    process.env.AIC_UNINSTALL_PROJECT_ROOT != null &&
    String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim() !== ""
      ? path.resolve(String(process.env.AIC_UNINSTALL_PROJECT_ROOT).trim())
      : null;
  const projectRoot =
    projectRootFromArgv() ??
    envRoot ??
    resolveProjectRootShared(null, { env: process.env, useAicProjectRoot: true });
  const keepProjectArtifacts = parseKeepProjectArtifacts(process.argv);
  const globalClaude = tryUninstallGlobalClaude(home);
  const projectAic = tryUninstallProjectAic(projectRoot, {
    keepProjectArtifacts,
    homeDir: home,
  });
  const keepDb = parseKeepAicDatabase(process.argv, process.env);
  const globalAic = tryCleanGlobalAicDir(home, keepDb);
  const changed = globalClaude.changed || projectAic.changed || globalAic.changed;
  if (!changed) {
    process.stdout.write("Nothing to remove. No need to restart Claude Code.\n");
    return;
  }
  const parts = [...globalClaude.parts, ...projectAic.parts];
  if (globalAic.message) {
    parts.push(globalAic.message);
  }
  parts.push("Restart Claude Code (or reload) to complete uninstall.");
  process.stdout.write(parts.join(" ") + "\n");
}

run();
