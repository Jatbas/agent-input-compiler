// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");

const PRESERVE_DB_NAMES = new Set(["aic.sqlite", "aic.sqlite-wal", "aic.sqlite-shm"]);

// Env overrides first; then legacy --keep-aic-database argv; else --remove-database inverts default keep.
function resolveGlobalKeepAicDatabase(argv, env) {
  const envVal = String(env.AIC_UNINSTALL_KEEP_AIC_DATABASE || "").toLowerCase();
  if (envVal === "0" || envVal === "false") {
    return false;
  }
  if (envVal === "1" || envVal === "true") {
    return true;
  }
  if (argv.some((a) => /^--keep-aic-database=(0|false)$/i.test(a))) {
    return false;
  }
  if (
    argv.includes("--keep-aic-database") ||
    argv.some((a) => /^--keep-aic-database=(1|true)$/i.test(a))
  ) {
    return true;
  }
  return !argv.includes("--remove-database");
}

function tryCleanGlobalAicDir(homeDir, keepAicDatabase) {
  const aicDir = path.join(homeDir, ".aic");
  if (!fs.existsSync(aicDir)) {
    return { changed: false, message: null };
  }
  if (!keepAicDatabase) {
    try {
      fs.rmSync(aicDir, { recursive: true, force: true });
      return {
        changed: true,
        message: "Removed ~/.aic including the database.",
      };
    } catch {
      return { changed: false, message: null };
    }
  }
  let removedAny = false;
  try {
    const entries = fs.readdirSync(aicDir);
    for (const name of entries) {
      if (PRESERVE_DB_NAMES.has(name)) {
        continue;
      }
      const full = path.join(aicDir, name);
      try {
        fs.rmSync(full, { recursive: true, force: true });
        removedAny = true;
      } catch {
        // Best effort per entry
      }
    }
  } catch {
    return { changed: false, message: null };
  }
  if (!removedAny) {
    return { changed: false, message: null };
  }
  return {
    changed: true,
    message: "Cleaned ~/.aic (kept SQLite database files).",
  };
}

module.exports = {
  resolveGlobalKeepAicDatabase,
  tryCleanGlobalAicDir,
};
