// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

execFileSync(
  process.execPath,
  [path.join(repoRoot, "mcp", "scripts", "bundle-standalone-uninstall.cjs")],
  { cwd: repoRoot, encoding: "utf8" },
);

const t = fs.mkdtempSync(path.join(os.tmpdir(), "aic-standalone-u-"));
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "aic-standalone-h-"));
try {
  fs.copyFileSync(
    path.join(repoRoot, "integrations", "aic-uninstall-standalone.cjs"),
    path.join(t, "aic-uninstall-standalone.cjs"),
  );
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-standalone-p-"));
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(t, "aic-uninstall-standalone.cjs"), "--project-root", projectDir],
      {
        env: { ...process.env, HOME: tmpHome },
        encoding: "utf8",
      },
    );
    if (!out.includes("Nothing to remove")) {
      throw new Error("expected stdout to mention nothing to remove");
    }
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(t, { recursive: true, force: true });
  fs.rmSync(tmpHome, { recursive: true, force: true });
}

console.log("standalone_uninstall_smoke: pass");
