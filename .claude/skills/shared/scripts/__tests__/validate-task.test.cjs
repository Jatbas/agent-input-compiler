// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 AIC Contributors
//
// Regression tests for validate-task.sh placement feasibility checks.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "..", "validate-task.sh");

function writeTask(
  root,
  steps,
  architectureNotes = "",
  acceptanceCriteria = "- [ ] `server_wiring` passes.",
) {
  const taskDir = path.join(root, "documentation", "tasks");
  const serverDir = path.join(root, "mcp", "src");
  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(serverDir, { recursive: true });
  fs.writeFileSync(
    path.join(serverDir, "server.ts"),
    [
      'const server = new McpServer({ name: "aic", version: packageVersion });',
      "const compileHandler = createCompileHandler();",
    ].join("\n"),
    "utf8",
  );
  const taskPath = path.join(taskDir, "999-fixture.md");
  fs.writeFileSync(
    taskPath,
    [
      "# Task 999: Fixture",
      "",
      "## Goal",
      "",
      "Fix composition-root wiring.",
      "",
      "## Architecture Notes",
      "",
      architectureNotes,
      "",
      "## Behavior Change",
      "",
      "Before: wiring is absent.",
      "",
      "After: wiring is present.",
      "",
      "## Files",
      "",
      "| Action | Path |",
      "| ------ | ---- |",
      "| Modify | `mcp/src/server.ts` |",
      "",
      "## Steps",
      "",
      steps,
      "",
      "## Tests",
      "",
      "| Test case | Description |",
      "| --------- | ----------- |",
      "| server_wiring | Validates wiring placement. |",
      "",
      "## Acceptance Criteria",
      "",
      acceptanceCriteria,
      "",
    ].join("\n"),
    "utf8",
  );
  return taskPath;
}

function runValidate(taskPath) {
  const root = path.dirname(path.dirname(path.dirname(taskPath)));
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    stdout = execFileSync("bash", [SCRIPT, taskPath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    exitCode = err.status;
    stdout = err.stdout ? err.stdout.toString() : "";
    stderr = err.stderr ? err.stderr.toString() : "";
  }
  return { exitCode, stdout, stderr };
}

function withTempTask(steps, architectureNotes, assertion, acceptanceCriteria) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aic-validate-task-"));
  try {
    const taskPath = writeTask(root, steps, architectureNotes, acceptanceCriteria);
    assertion(runValidate(taskPath));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("fails impossible createMcpServer return placement", () => {
  withTempTask(
    "1. After `createMcpServer` construction returns `server`, pass `listWorkspaceRoots` into `createCompileHandler`.",
    "",
    (result) => {
      assert.equal(result.exitCode, 1);
      assert.match(result.stdout, /composition-root placement impossible/);
    },
  );
});

test("requires placement bullet for ordered server wiring", () => {
  withTempTask(
    '1. Inside `createMcpServer`, insert `listWorkspaceRoots` after `const server = new McpServer({ name: "aic", version: packageVersion });` and before `const compileHandler = createCompileHandler(`.',
    "",
    (result) => {
      assert.equal(result.exitCode, 1);
      assert.match(result.stdout, /composition-root placement missing/);
    },
  );
});

test("passes ordered server wiring with placement bullet", () => {
  withTempTask(
    '1. Inside `createMcpServer`, insert `listWorkspaceRoots` after `const server = new McpServer({ name: "aic", version: packageVersion });` and before `const compileHandler = createCompileHandler(`.',
    '- **Composition root placement:** target function `createMcpServer`; after-anchor `const server = new McpServer({ name: "aic", version: packageVersion });`; before-anchor `const compileHandler = createCompileHandler(`; insertion point is between those anchors.',
    (result) => {
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /validate-task: .* clean/);
    },
  );
});

test("fails acceptance criteria with only generic toolchain checks", () => {
  withTempTask(
    "1. Add the behavior change to `mcp/src/server.ts`.",
    "",
    (result) => {
      assert.equal(result.exitCode, 1);
      assert.match(result.stdout, /acceptance proof missing/);
    },
    ["- [ ] `pnpm lint` passes.", "- [ ] `pnpm test` passes."].join("\n"),
  );
});

test("fails task-specific acceptance without proof artifact", () => {
  withTempTask(
    "1. Add the behavior change to `mcp/src/server.ts`.",
    "",
    (result) => {
      assert.equal(result.exitCode, 1);
      assert.match(result.stdout, /acceptance criteria without proof artifact/);
    },
    "- [ ] Runtime fallback rejects invalid defaults.",
  );
});

test("passes task-specific acceptance with proof artifact", () => {
  withTempTask(
    "1. Add the behavior change to `mcp/src/server.ts`.",
    "",
    (result) => {
      assert.equal(result.exitCode, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /validate-task: .* clean/);
    },
    "- [ ] Runtime fallback rejects invalid defaults. Proof: `fallback_candidate_skips_invalid_default` passes and payload field `fallbackApplied` is observed.",
  );
});
