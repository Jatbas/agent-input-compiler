#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const { loadSkillPhases } = require("../runner/phase-parser.cjs");
const {
  initRun,
  readState,
  writeState,
  markPhaseStarted,
  markPhaseComplete,
  markPhaseFailed,
  statePath,
} = require("../runner/run-state.cjs");

const SHARED_SCRIPTS = path.resolve(__dirname);
const PROJECT_ROOT = process.env.AIC_PROJECT_ROOT || process.cwd();
const SKILLS_ROOT = path.join(PROJECT_ROOT, ".claude", "skills");

function usage() {
  process.stderr.write(
    [
      "usage: skill-run <command> [args]",
      "  init <skill>                         start a run, emit first phase prompt",
      "  next <run-id>                        print current phase's prompt + gates",
      "  advance <run-id> [--artifact <p>...] verify gates, move to next phase",
      "  fail <run-id> <reason>               mark the current phase failed",
      "  status <run-id>                      print JSON state",
      "  resume <run-id>                      re-emit current phase prompt",
      "",
      "env: AIC_PROJECT_ROOT=<path> (defaults to cwd)",
    ].join("\n") + "\n",
  );
  process.exit(2);
}

function skillRootFor(skill) {
  const dir = path.join(SKILLS_ROOT, skill);
  if (!fs.existsSync(dir)) {
    process.stderr.write(`skill not found: ${skill} (looked in ${dir})\n`);
    process.exit(2);
  }
  return dir;
}

function readPhaseFile(skillRoot, relativeFile) {
  const abs = path.join(skillRoot, relativeFile);
  if (!fs.existsSync(abs)) {
    throw new Error(`phase file not found: ${abs}`);
  }
  return fs.readFileSync(abs, "utf8");
}

function emitPhase(state, skillRoot) {
  const idx = state.currentPhase;
  const phase = state.phases[idx];
  const body = readPhaseFile(skillRoot, phase.file);

  const header = [
    `--- skill-run ---`,
    `runId: ${state.runId}`,
    `skill: ${state.skill}`,
    `phase: ${idx + 1}/${state.phases.length} — ${phase.label}`,
    `checkpoint: ${phase.checkpoint}`,
    `file: ${phase.file}`,
    `status: ${phase.status}`,
    `gate: before calling 'advance', emit the checkpoint line and produce artifacts.`,
    `-----------------`,
    "",
  ].join("\n");

  process.stdout.write(header + body + "\n");
}

function cmdInit(args) {
  const skill = args[0];
  if (!skill) usage();

  const skillRoot = skillRootFor(skill);
  const phases = loadSkillPhases(skillRoot);

  const state = initRun({ projectRoot: PROJECT_ROOT, skill, skillRoot, phases });
  const started = writeState(PROJECT_ROOT, markPhaseStarted(state, 0));
  logCheckpoint(state.skill, "runner", "run-initialized", "complete");

  emitPhase(started, skillRoot);
  process.stderr.write(
    `\nrun-id: ${started.runId}\nstate: ${statePath(PROJECT_ROOT, started.runId)}\n`,
  );
}

function cmdNext(args) {
  const runId = args[0];
  if (!runId) usage();
  const state = readState(PROJECT_ROOT, runId);
  if (state.status === "complete") {
    process.stdout.write(`run ${runId} already complete\n`);
    return;
  }
  if (state.status === "failed") {
    process.stderr.write(
      `run ${runId} is in FAILED status. Use 'resume' after fixing the gate, or 'fail' to explicitly abort.\n`,
    );
    process.exit(1);
  }
  const skillRoot = skillRootFor(state.skill);
  const cur = state.phases[state.currentPhase];
  if (cur.status === "pending") {
    const started = writeState(PROJECT_ROOT, markPhaseStarted(state, state.currentPhase));
    emitPhase(started, skillRoot);
  } else {
    emitPhase(state, skillRoot);
  }
}

function parseAdvanceArgs(args) {
  const runId = args[0];
  if (!runId) usage();
  const artifacts = [];
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === "--artifact") {
      const v = args[i + 1];
      if (!v) usage();
      artifacts.push(v);
      i += 1;
    }
  }
  return { runId, artifacts };
}

function verifyArtifacts(artifacts) {
  const missing = artifacts.filter((a) => !fs.existsSync(path.resolve(PROJECT_ROOT, a)));
  return { ok: missing.length === 0, missing };
}

function cmdAdvance(args) {
  const { runId, artifacts } = parseAdvanceArgs(args);
  const state = readState(PROJECT_ROOT, runId);
  if (state.status !== "in_progress") {
    process.stderr.write(`run ${runId} not in progress (status=${state.status})\n`);
    process.exit(1);
  }
  const phase = state.phases[state.currentPhase];
  const check = verifyArtifacts(artifacts);
  if (!check.ok) {
    const next = writeState(
      PROJECT_ROOT,
      markPhaseFailed(
        state,
        state.currentPhase,
        `missing artifacts: ${check.missing.join(", ")}`,
      ),
    );
    logCheckpoint(state.skill, phase.checkpoint, "artifact-check", "failed");
    process.stderr.write(
      `ADVANCE REJECTED: missing artifacts: ${check.missing.join(", ")}\n`,
    );
    process.stderr.write(`state: ${statePath(PROJECT_ROOT, next.runId)}\n`);
    process.exit(1);
  }

  const advanced = writeState(
    PROJECT_ROOT,
    markPhaseComplete(state, state.currentPhase, artifacts),
  );
  logCheckpoint(state.skill, phase.checkpoint, phase.file, "complete");

  if (advanced.status === "complete") {
    process.stdout.write(
      `run ${advanced.runId} complete (${advanced.phases.length} phases)\n`,
    );
    return;
  }
  const skillRoot = skillRootFor(advanced.skill);
  const started = writeState(
    PROJECT_ROOT,
    markPhaseStarted(advanced, advanced.currentPhase),
  );
  emitPhase(started, skillRoot);
}

function cmdFail(args) {
  const [runId, ...rest] = args;
  if (!runId || rest.length === 0) usage();
  const reason = rest.join(" ");
  const state = readState(PROJECT_ROOT, runId);
  const next = writeState(
    PROJECT_ROOT,
    markPhaseFailed(state, state.currentPhase, reason),
  );
  logCheckpoint(
    state.skill,
    state.phases[state.currentPhase].checkpoint,
    "manual-fail",
    "failed",
  );
  process.stderr.write(`run ${next.runId} marked FAILED: ${reason}\n`);
}

function cmdStatus(args) {
  const runId = args[0];
  if (!runId) usage();
  const state = readState(PROJECT_ROOT, runId);
  process.stdout.write(JSON.stringify(state, null, 2) + "\n");
}

function cmdResume(args) {
  const runId = args[0];
  if (!runId) usage();
  const state = readState(PROJECT_ROOT, runId);
  const skillRoot = skillRootFor(state.skill);
  if (state.status === "complete") {
    process.stdout.write(`run ${runId} already complete\n`);
    return;
  }
  if (state.status === "failed") {
    const cur = state.phases[state.currentPhase];
    const reopened = writeState(PROJECT_ROOT, {
      ...state,
      status: "in_progress",
      phases: state.phases.map((p, i) =>
        i === state.currentPhase ? { ...p, status: "in_progress" } : p,
      ),
    });
    logCheckpoint(state.skill, cur.checkpoint, "resume", "reopened");
    emitPhase(reopened, skillRoot);
    return;
  }
  emitPhase(state, skillRoot);
}

function logCheckpoint(skill, phase, artifact, status) {
  try {
    cp.execFileSync(
      path.join(SHARED_SCRIPTS, "checkpoint-log.sh"),
      [skill, phase, artifact, status],
      { stdio: "ignore", env: { ...process.env, AIC_PROJECT_ROOT: PROJECT_ROOT } },
    );
  } catch {
    // checkpoint logging is best-effort; never block a run on it
  }
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const handlers = {
    init: cmdInit,
    next: cmdNext,
    advance: cmdAdvance,
    fail: cmdFail,
    status: cmdStatus,
    resume: cmdResume,
  };
  const handler = handlers[cmd];
  if (!handler) usage();
  handler(rest);
}

main();
