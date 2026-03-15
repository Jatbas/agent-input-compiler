// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");

const { run } = require(
  path.join(__dirname, "..", "hooks", "aic-stop-quality-check.cjs"),
);

function tempPath(sessionId) {
  return path.join(
    os.tmpdir(),
    "aic-cc-edited-" + String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_") + ".json",
  );
}

function cleanupTemp(sessionId) {
  try {
    fs.unlinkSync(tempPath(sessionId));
  } catch {
    // ignore
  }
}

function temp_missing_exit_0() {
  cleanupTemp("s1");
  const out = run(JSON.stringify({ session_id: "s1", cwd: process.cwd() }));
  if (out !== "") {
    throw new Error(`Expected "", got ${JSON.stringify(out)}`);
  }
  console.log("temp_missing_exit_0: pass");
}

function no_ts_js_files_exit_0() {
  cleanupTemp("s2");
  fs.writeFileSync(tempPath("s2"), "[]", "utf8");
  const out = run(JSON.stringify({ session_id: "s2", cwd: process.cwd() }));
  if (out !== "") {
    throw new Error(`Expected "" for empty array, got ${JSON.stringify(out)}`);
  }
  cleanupTemp("s2");
  console.log("no_ts_js_files_exit_0: pass");
}

function block_on_lint_failure() {
  const projectRoot = process.cwd();
  const fixturesDir = path.join(__dirname, "..", "fixtures");
  fs.mkdirSync(fixturesDir, { recursive: true });
  const badFile = path.join(fixturesDir, "bad-lint.ts");
  fs.writeFileSync(badFile, "const x = 1;\n", "utf8");
  const sessionId = "s3lint";
  cleanupTemp(sessionId);
  fs.writeFileSync(tempPath(sessionId), JSON.stringify([badFile]), "utf8");
  try {
    const out = run(JSON.stringify({ session_id: sessionId, cwd: projectRoot }));
    if (out === "") {
      throw new Error("Expected block output, got ''");
    }
    const obj = JSON.parse(out);
    if (obj.decision !== "block" || typeof obj.reason !== "string") {
      throw new Error(`Expected { decision: 'block', reason }, got ${out}`);
    }
    if (obj.reason.indexOf("lint") === -1 && obj.reason.indexOf("Fix") === -1) {
      throw new Error(`Reason should mention lint or Fix: ${obj.reason}`);
    }
  } finally {
    cleanupTemp(sessionId);
    try {
      fs.unlinkSync(badFile);
      fs.rmdirSync(fixturesDir);
    } catch {
      // ignore
    }
  }
  console.log("block_on_lint_failure: pass");
}

function pass_when_clean() {
  cleanupTemp("s4");
  const projectRoot = process.cwd();
  const cleanFile = path.join(projectRoot, "shared", "src", "core", "types", "paths.ts");
  if (!fs.existsSync(cleanFile)) {
    console.log("pass_when_clean: skip (paths.ts not found)");
    return;
  }
  fs.writeFileSync(tempPath("s4"), JSON.stringify([cleanFile]), "utf8");
  const out = run(JSON.stringify({ session_id: "s4", cwd: projectRoot }));
  cleanupTemp("s4");
  if (out !== "") {
    throw new Error(`Expected "" when clean, got ${JSON.stringify(out)}`);
  }
  console.log("pass_when_clean: pass");
}

temp_missing_exit_0();
no_ts_js_files_exit_0();
block_on_lint_failure();
pass_when_clean();
console.log("All tests passed.");
