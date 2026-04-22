// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 AIC Contributors
//
// Regression test for architectural-invariants.sh. Each fixture under
// fixtures/ asserts exactly one defect class triggers; audit-replay/
// fixtures prove the gate would have blocked the real 2026-04-23
// diagnostic-numbers defects at plan time.
//
// Runs with the repo-wide convention:  node --test .claude/skills/shared/scripts/__tests__/
//
// The script appends a JSONL record per run to <cwd>/.aic/gate-log.jsonl.
// Every test isolates cwd to a fresh temp dir so assertions read only that
// run's record.

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SCRIPT = path.resolve(__dirname, "..", "architectural-invariants.sh");
const FIXTURES = path.resolve(__dirname, "fixtures");
const AUDIT_REPLAY = path.resolve(__dirname, "audit-replay");

function runGate(fixtureRelPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aic-invariants-"));
  const absFixture = path.isAbsolute(fixtureRelPath)
    ? fixtureRelPath
    : path.resolve(fixtureRelPath);
  let stdout = "";
  let stderr = "";
  let exitCode = 0;
  try {
    stdout = execFileSync("bash", [SCRIPT, absFixture], {
      cwd: tmp,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    exitCode = err.status;
    stdout = err.stdout ? err.stdout.toString() : "";
    stderr = err.stderr ? err.stderr.toString() : "";
  }
  const logPath = path.join(tmp, ".aic", "gate-log.jsonl");
  let record = null;
  if (fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, "utf8").trim().split("\n");
    if (lines.length > 0 && lines[lines.length - 1]) {
      record = JSON.parse(lines[lines.length - 1]);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return { exitCode, stdout, stderr, record };
}

function fixture(name) {
  return path.join(FIXTURES, `${name}.md`);
}

function auditReplay(name) {
  return path.join(AUDIT_REPLAY, `${name}.md`);
}

test("clean fixture passes with zero triggers", () => {
  const r = runGate(fixture("clean"));
  assert.equal(r.exitCode, 0, "clean fixture should exit 0");
  assert.deepEqual(r.record.triggers_fired, []);
  assert.equal(r.record.missing_bullets.length, 0);
  assert.equal(r.record.critic_required, false);
  assert.equal(r.record.status, "ok");
});

test("DRY-01 fires on underscore-separated literal and fails without bullet", () => {
  const r = runGate(fixture("dry-01-underscore"));
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.record.triggers_fired, ["DRY-01"]);
  assert.deepEqual(r.record.missing_bullets, ["DRY-01"]);
});

test("DRY-01 fires on bare 6+ digit literal (broader-regex case)", () => {
  const r = runGate(fixture("dry-01-bare-digits"));
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.record.triggers_fired, ["DRY-01"]);
});

test("DRY-01 passes when **Source-of-truth probe:** bullet is present", () => {
  const r = runGate(fixture("dry-01-satisfied"));
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.record.triggers_fired, ["DRY-01"]);
  assert.deepEqual(r.record.missing_bullets, []);
});

test("SRP-01 fires on formatter Modify + arithmetic verbs in Steps", () => {
  const r = runGate(fixture("srp-01"));
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.record.triggers_fired, ["SRP-01"]);
});

test("LABEL-01 fires on formatter Modify + user-visible string with %", () => {
  const r = runGate(fixture("label-01"));
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.record.triggers_fired, ["LABEL-01"]);
});

test("BRAND-01 fires on branded-type mention", () => {
  const r = runGate(fixture("brand-01"));
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.record.triggers_fired, ["BRAND-01"]);
});

test("DIP-01 fires on new X() outside server.ts", () => {
  const r = runGate(fixture("dip-01"));
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.record.triggers_fired, ["DIP-01"]);
});

test("OCP-01 fires on pipeline Modify when Goal does not start with Add/Introduce/Create", () => {
  const r = runGate(fixture("ocp-01"));
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.record.triggers_fired, ["OCP-01"]);
});

test("SCOPE-01 fires on storage Modify + SQL in Steps", () => {
  const r = runGate(fixture("scope-01"));
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.record.triggers_fired, ["SCOPE-01"]);
});

test("PERSIST-01 fires on formatter + storage together", () => {
  const r = runGate(fixture("persist-01"));
  assert.equal(r.exitCode, 1);
  assert.deepEqual(r.record.triggers_fired, ["PERSIST-01"]);
});

test("**Gate-exempt:** with allowed reason passes even when trigger fires", () => {
  const r = runGate(fixture("gate-exempt-valid"));
  assert.equal(r.exitCode, 0);
  assert.deepEqual(r.record.triggers_fired, ["BRAND-01"]);
  assert.deepEqual(r.record.exempted, ["BRAND-01"]);
  assert.deepEqual(r.record.missing_bullets, []);
});

test("**Gate-exempt:** with disallowed reason fails the gate", () => {
  const r = runGate(fixture("gate-exempt-invalid-reason"));
  assert.equal(r.exitCode, 1);
  assert.match(r.stdout, /invalid reason/);
});

test("**Gate-exempt:** with unknown check-id fails the gate", () => {
  const r = runGate(fixture("gate-exempt-invalid-check"));
  assert.equal(r.exitCode, 1);
  assert.match(r.stdout, /invalid check-id/);
});

test("critic_required is true whenever any trigger fires", () => {
  const allTriggers = [
    "srp-01",
    "label-01",
    "brand-01",
    "persist-01",
    "dry-01-underscore",
    "dip-01",
    "ocp-01",
    "scope-01",
  ];
  for (const name of allTriggers) {
    const r = runGate(fixture(name));
    assert.equal(
      r.record.critic_required,
      true,
      `${name} should set critic_required=true`,
    );
  }
});

test("critic_required is false only when no trigger fires", () => {
  const r = runGate(fixture("clean"));
  assert.equal(r.record.critic_required, false);
});

test("DRY-01 satisfied (bullet present) still sets critic_required=true", () => {
  const r = runGate(fixture("dry-01-satisfied"));
  assert.equal(r.record.critic_required, true);
});

test("audit-replay AR-01: 123_500 duplication would have been caught", () => {
  const r = runGate(auditReplay("ar-01-dry-123500-duplication"));
  assert.equal(r.exitCode, 1, "gate must block the task");
  assert.ok(
    r.record.triggers_fired.includes("DRY-01"),
    "DRY-01 must fire on the 123_500 literal",
  );
  assert.ok(
    r.record.triggers_fired.includes("SRP-01"),
    "SRP-01 must fire on formatter + arithmetic",
  );
});

test("audit-replay AR-02: Percentage used as 0-100 would have been caught", () => {
  const r = runGate(auditReplay("ar-02-brand-percentage-as-0-100"));
  assert.equal(r.exitCode, 1);
  assert.ok(
    r.record.triggers_fired.includes("BRAND-01"),
    "BRAND-01 must fire on Percentage mention so the planner quotes the invariant",
  );
  assert.equal(r.record.critic_required, true);
});

test("audit-replay AR-03: persisted/displayed split would have been caught", () => {
  const r = runGate(auditReplay("ar-03-persist-budget-utilisation-split"));
  assert.equal(r.exitCode, 1);
  assert.ok(
    r.record.triggers_fired.includes("PERSIST-01"),
    "PERSIST-01 must fire on formatter + storage together",
  );
});

test("audit-replay AR-04: hero-line subject/object mismatch would have been caught", () => {
  const r = runGate(auditReplay("ar-04-label-hero-line-subject-object"));
  assert.equal(r.exitCode, 1);
  assert.ok(
    r.record.triggers_fired.includes("LABEL-01"),
    "LABEL-01 must fire on formatter + user-visible string with %",
  );
});
