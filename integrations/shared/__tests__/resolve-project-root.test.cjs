// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const path = require("path");
const { resolveProjectRoot } = require("../resolve-project-root.cjs");

function cursor_env() {
  const actual = resolveProjectRoot(null, {
    env: { CURSOR_PROJECT_DIR: "/cursor/project" },
  });
  assert.strictEqual(actual, path.resolve("/cursor/project"));
}

function cursor_useAicProjectRoot() {
  const actual = resolveProjectRoot(null, {
    env: { AIC_PROJECT_ROOT: "/aic/root" },
    useAicProjectRoot: true,
  });
  assert.strictEqual(actual, path.resolve("/aic/root"));
}

function claude_cwd() {
  const actual = resolveProjectRoot({ cwd: "/claude/cwd" });
  assert.strictEqual(actual, path.resolve("/claude/cwd"));
}

function claude_env_fallback() {
  const saved = process.env.CLAUDE_PROJECT_DIR;
  try {
    process.env.CLAUDE_PROJECT_DIR = "/claude/env";
    const actual = resolveProjectRoot({ cwd: "" });
    assert.strictEqual(actual, path.resolve("/claude/env"));
  } finally {
    if (saved !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = saved;
    } else {
      delete process.env.CLAUDE_PROJECT_DIR;
    }
  }
}

function toolInput_override_cursor() {
  const actual = resolveProjectRoot(null, {
    env: {},
    toolInputOverride: "/override",
  });
  assert.strictEqual(actual, path.resolve("/override"));
}

function toolInput_override_claude() {
  const actual = resolveProjectRoot(
    { cwd: "/cwd" },
    { toolInputOverride: " /override " },
  );
  assert.strictEqual(actual, path.resolve("/override"));
}

function trim_cwd() {
  const actual = resolveProjectRoot({ cwd: "  /trim/me  " });
  assert.strictEqual(actual, path.resolve("/trim/me"));
}

const cases = [
  cursor_env,
  cursor_useAicProjectRoot,
  claude_cwd,
  claude_env_fallback,
  toolInput_override_cursor,
  toolInput_override_claude,
  trim_cwd,
];

let failed = 0;
for (const fn of cases) {
  try {
    fn();
    console.log("OK", fn.name);
  } catch (err) {
    console.error("FAIL", fn.name, err.message);
    failed += 1;
  }
}
if (failed > 0) process.exit(1);
