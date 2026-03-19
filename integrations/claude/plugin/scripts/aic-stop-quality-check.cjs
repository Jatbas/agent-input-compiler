// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// Stop hook — runs eslint and tsc on edited files from T06 temp file; outputs decision: "block" on failure (CC §6.5).

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { readStdinSync } = require("../../../shared/read-stdin-sync.cjs");
const { readEditedFiles } = require("../../../shared/edited-files-cache.cjs");

function runEslint(paths, cwd) {
  if (paths.length === 0) return { exitCode: 0, stderr: "" };
  const eslintBin = path.join(cwd, "node_modules", ".bin", "eslint");
  const args = ["--max-warnings", "0", "--", ...paths];
  const cmd = fs.existsSync(eslintBin) ? eslintBin : "npx";
  const runArgs = fs.existsSync(eslintBin) ? args : ["eslint", ...args];
  try {
    execSync(cmd, runArgs, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
    });
    return { exitCode: 0, stderr: "" };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stderr: (err.stderr ?? err.message ?? "").toString(),
    };
  }
}

function runTsc(cwd) {
  if (!fs.existsSync(path.join(cwd, "tsconfig.json"))) return { exitCode: 0, stderr: "" };
  const tscBin = path.join(cwd, "node_modules", ".bin", "tsc");
  const useLocal = fs.existsSync(tscBin);
  const cmd = useLocal ? tscBin : "npx";
  const runArgs = useLocal ? ["--noEmit"] : ["tsc", "--noEmit"];
  try {
    execSync(cmd, runArgs, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
    });
    return { exitCode: 0, stderr: "" };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stderr: (err.stderr ?? err.message ?? "").toString(),
    };
  }
}

function run(stdinStr) {
  try {
    let parsed = {};
    try {
      parsed =
        typeof stdinStr === "string" && stdinStr.trim() ? JSON.parse(stdinStr) : {};
    } catch {
      return "";
    }
    const sessionId = parsed.session_id ?? parsed.input?.session_id ?? "default";
    const cwdRaw = (parsed.cwd ?? parsed.input?.cwd ?? "").trim();
    const projectRoot = cwdRaw ? cwdRaw : process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const paths = readEditedFiles("claude_code", sessionId);
    const filtered = paths.filter(
      (p) =>
        typeof p === "string" &&
        fs.existsSync(p) &&
        (p.endsWith(".ts") || p.endsWith(".js")),
    );
    if (filtered.length === 0) return "";
    const eslintResult = runEslint(filtered, projectRoot);
    const tscResult = runTsc(projectRoot);
    if (eslintResult.exitCode !== 0 || tscResult.exitCode !== 0) {
      const parts = [];
      if (eslintResult.exitCode !== 0) parts.push("lint");
      if (tscResult.exitCode !== 0) parts.push("typecheck");
      const reason =
        "Fix lint/typecheck errors:\n" +
        (eslintResult.stderr ? eslintResult.stderr + "\n" : "") +
        (tscResult.stderr ? tscResult.stderr : "");
      return JSON.stringify({ decision: "block", reason });
    }
    return "";
  } catch {
    return "";
  }
}

if (require.main === module) {
  const raw = readStdinSync();
  process.stdout.write(run(raw));
  process.exit(0);
}

module.exports = { run };
