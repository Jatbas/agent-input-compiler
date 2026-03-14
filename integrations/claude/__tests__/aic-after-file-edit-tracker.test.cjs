// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");

const hooksDir = path.join(__dirname, "..", "hooks");
const { run } = require(path.join(hooksDir, "aic-after-file-edit-tracker.cjs"));

function tempPath(sessionId) {
  const sanitized = String(sessionId).replace(/[^a-zA-Z0-9*-]/g, "_");
  return path.join(os.tmpdir(), "aic-cc-edited-" + sanitized + ".json");
}

function cleanupTemp(sessionId) {
  const p = tempPath(sessionId);
  try {
    fs.unlinkSync(p);
  } catch {
    // ignore
  }
}

function temp_file_created_on_first_invocation() {
  cleanupTemp("s1");
  run(JSON.stringify({ session_id: "s1", tool_input: { path: "/abs/foo.ts" } }));
  const p = tempPath("s1");
  if (!fs.existsSync(p)) {
    throw new Error("Temp file not created");
  }
  const content = JSON.parse(fs.readFileSync(p, "utf8"));
  const expected = path.resolve("/abs/foo.ts");
  if (!Array.isArray(content) || content.length !== 1 || content[0] !== expected) {
    throw new Error(`Expected [${expected}], got ${JSON.stringify(content)}`);
  }
  cleanupTemp("s1");
  console.log("temp_file_created_on_first_invocation: pass");
}

function temp_file_appended_avoid_duplicate() {
  cleanupTemp("s1dup");
  run(
    JSON.stringify({
      session_id: "s1dup",
      tool_input: { path: "/same/path.ts" },
    }),
  );
  run(
    JSON.stringify({
      session_id: "s1dup",
      tool_input: { path: "/same/path.ts" },
    }),
  );
  const p = tempPath("s1dup");
  let content = JSON.parse(fs.readFileSync(p, "utf8"));
  if (content.length !== 1) {
    throw new Error(`Expected length 1 after duplicate, got ${content.length}`);
  }
  run(
    JSON.stringify({
      session_id: "s1dup",
      tool_input: { path: "/other/file.js" },
    }),
  );
  content = JSON.parse(fs.readFileSync(p, "utf8"));
  if (content.length !== 2) {
    throw new Error(`Expected length 2 after second path, got ${content.length}`);
  }
  cleanupTemp("s1dup");
  console.log("temp_file_appended_avoid_duplicate: pass");
}

function output_empty_json() {
  const out = run(JSON.stringify({ session_id: "s2", tool_input: { path: "/a/b.js" } }));
  if (out !== "{}") {
    throw new Error(`Expected "{}", got ${JSON.stringify(out)}`);
  }
  console.log("output_empty_json: pass");
}

function missing_path_no_op() {
  cleanupTemp("s3");
  const out = run(JSON.stringify({ session_id: "s3" }));
  if (out !== "{}") {
    throw new Error(`Expected "{}", got ${JSON.stringify(out)}`);
  }
  const p = tempPath("s3");
  if (fs.existsSync(p)) {
    throw new Error("Temp file should not exist when path is missing");
  }
  console.log("missing_path_no_op: pass");
}

function session_id_sanitized() {
  cleanupTemp("s4/with/slash");
  run(
    JSON.stringify({
      session_id: "s4/with/slash",
      tool_input: { path: "/only.ts" },
    }),
  );
  const p = tempPath("s4/with/slash");
  if (!fs.existsSync(p)) {
    throw new Error(
      `Temp file not found at ${p} (sanitized name: aic-cc-edited-s4_with_slash.json)`,
    );
  }
  const content = JSON.parse(fs.readFileSync(p, "utf8"));
  const expected = path.resolve("/only.ts");
  if (!Array.isArray(content) || content.length !== 1 || content[0] !== expected) {
    throw new Error(`Expected [${expected}], got ${JSON.stringify(content)}`);
  }
  cleanupTemp("s4/with/slash");
  console.log("session_id_sanitized: pass");
}

temp_file_created_on_first_invocation();
temp_file_appended_avoid_duplicate();
output_empty_json();
missing_path_no_op();
session_id_sanitized();
console.log("All tests passed.");
