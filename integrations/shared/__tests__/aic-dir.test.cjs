// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { getAicDir, ensureAicDir, appendJsonl } = require("../aic-dir.cjs");

function getAicDir_returns_join() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-dir-"));
  try {
    assert.strictEqual(getAicDir(projectRoot), path.join(projectRoot, ".aic"));
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function ensureAicDir_creates_with_0o700() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-dir-"));
  try {
    ensureAicDir(projectRoot);
    assert.strictEqual(fs.existsSync(path.join(projectRoot, ".aic")), true);
    const mode = fs.statSync(path.join(projectRoot, ".aic")).mode & 0o777;
    assert.strictEqual(mode, 0o700);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function ensureAicDir_idempotent() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-dir-"));
  try {
    ensureAicDir(projectRoot);
    ensureAicDir(projectRoot);
    assert.strictEqual(fs.existsSync(path.join(projectRoot, ".aic")), true);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

function appendJsonl_appends_line() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aic-dir-"));
  try {
    appendJsonl(projectRoot, "test.jsonl", { a: 1 });
    const filePath = path.join(projectRoot, ".aic", "test.jsonl");
    assert.strictEqual(fs.readFileSync(filePath, "utf8"), '{"a":1}\n');
    appendJsonl(projectRoot, "test.jsonl", { b: 2 });
    assert.strictEqual(fs.readFileSync(filePath, "utf8"), '{"a":1}\n{"b":2}\n');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

const cases = [
  getAicDir_returns_join,
  ensureAicDir_creates_with_0o700,
  ensureAicDir_idempotent,
  appendJsonl_appends_line,
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
process.exit(failed > 0 ? 1 : 0);
