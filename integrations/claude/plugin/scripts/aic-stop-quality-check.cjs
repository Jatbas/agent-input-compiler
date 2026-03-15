// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors
// Stop hook — runs eslint and tsc on edited files from T06 temp file; outputs decision: "block" on failure (CC §6.5).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

function readStdinSync() {
  const chunks = [];
  let size = 0;
  const buf = Buffer.alloc(64 * 1024);
  let n;
  while ((n = fs.readSync(0, buf, 0, buf.length, null)) > 0) {
    chunks.push(buf.slice(0, n));
    size += n;
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

function getTempPath(sessionId) {
  return path.join(
    os.tmpdir(),
    "aic-cc-edited-" + String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_") + ".json",
  );
}

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
    const tmpPath = getTempPath(sessionId);
    if (!fs.existsSync(tmpPath)) return "";
    let paths = [];
    try {
      const data = JSON.parse(fs.readFileSync(tmpPath, "utf8"));
      paths = Array.isArray(data) ? data : [];
    } catch {
      return "";
    }
    paths = paths.filter(
      (p) =>
        typeof p === "string" &&
        fs.existsSync(p) &&
        (p.endsWith(".ts") || p.endsWith(".js")),
    );
    if (paths.length === 0) return "";
    const eslintResult = runEslint(paths, projectRoot);
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
