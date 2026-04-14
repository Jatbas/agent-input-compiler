// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

// stop hook — runs eslint and tsc on edited files from afterFileEdit temp file;
// if either fails, returns followup_message so Cursor auto-submits a fix request.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { readStdinSync } = require("../../shared/read-stdin-sync.cjs");
const { readEditedFiles } = require("../../shared/edited-files-cache.cjs");
const { isCursorNativeHookPayload } = require("../is-cursor-native-hook-payload.cjs");

function runEslint(paths) {
  if (paths.length === 0) return { exitCode: 0, stderr: "" };
  try {
    execSync("npx", ["eslint", "--max-warnings", "0", "--", ...paths], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { exitCode: 0, stderr: "" };
  } catch (err) {
    const stderr = (err.stderr ?? err.message ?? "").toString();
    return { exitCode: err.status ?? 1, stderr };
  }
}

function runTsc() {
  const tsconfig = path.join(process.cwd(), "tsconfig.json");
  if (!fs.existsSync(tsconfig)) return { exitCode: 0, stderr: "" };
  try {
    execSync("npx", ["tsc", "--noEmit"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
    });
    return { exitCode: 0, stderr: "" };
  } catch (err) {
    const stderr = (err.stderr ?? err.message ?? "").toString();
    return { exitCode: err.status ?? 1, stderr };
  }
}

try {
  const raw = readStdinSync();
  const input = raw.trim() ? JSON.parse(raw) : {};
  if (!isCursorNativeHookPayload(input)) {
    process.stdout.write("{}");
    process.exit(0);
  }
  const key =
    input.conversation_id ??
    input.conversationId ??
    input.session_id ??
    input.sessionId ??
    process.env.AIC_CONVERSATION_ID ??
    "default";
  const paths = readEditedFiles("cursor", key);
  const filtered = paths.filter((p) => typeof p === "string" && fs.existsSync(p));
  if (filtered.length === 0) {
    process.stdout.write("{}");
    process.exit(0);
  }
  const eslintResult = runEslint(filtered);
  const tscResult = runTsc();
  if (eslintResult.exitCode !== 0 || tscResult.exitCode !== 0) {
    const parts = [];
    if (eslintResult.exitCode !== 0) parts.push("lint");
    if (tscResult.exitCode !== 0) parts.push("typecheck");
    const msg =
      "Fix " +
      parts.join(" and ") +
      " errors on the files you edited. Run pnpm lint and pnpm typecheck.";
    process.stdout.write(JSON.stringify({ followup_message: msg }));
  } else {
    process.stdout.write("{}");
  }
} catch {
  process.stdout.write("{}");
}
process.exit(0);
