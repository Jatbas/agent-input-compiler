"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function stateDir(projectRoot) {
  return path.join(projectRoot, ".aic", "skill-runs");
}

function ensureStateDir(projectRoot) {
  const dir = stateDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function statePath(projectRoot, runId) {
  return path.join(stateDir(projectRoot), `${runId}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function newRunId() {
  return crypto.randomUUID();
}

function initRun({ projectRoot, skill, skillRoot, phases, metadata = {} }) {
  ensureStateDir(projectRoot);
  const runId = newRunId();
  const state = {
    runId,
    skill,
    skillRoot: path.relative(projectRoot, skillRoot),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: "in_progress",
    currentPhase: 0,
    metadata,
    phases: phases.map((p) => ({
      label: p.label,
      file: p.file,
      checkpoint: p.checkpoint,
      status: "pending",
      artifacts: [],
      startedAt: null,
      completedAt: null,
      failures: [],
    })),
  };
  fs.writeFileSync(statePath(projectRoot, runId), JSON.stringify(state, null, 2));
  return state;
}

function readState(projectRoot, runId) {
  const p = statePath(projectRoot, runId);
  if (!fs.existsSync(p)) {
    throw new Error(`No run state found for runId=${runId} at ${p}`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeState(projectRoot, state) {
  const next = { ...state, updatedAt: nowIso() };
  fs.writeFileSync(statePath(projectRoot, next.runId), JSON.stringify(next, null, 2));
  return next;
}

function markPhaseStarted(state, idx) {
  const phases = state.phases.map((p, i) =>
    i === idx ? { ...p, status: "in_progress", startedAt: nowIso() } : p,
  );
  return { ...state, currentPhase: idx, phases };
}

function markPhaseComplete(state, idx, artifacts) {
  const phases = state.phases.map((p, i) =>
    i === idx
      ? {
          ...p,
          status: "complete",
          artifacts: [...p.artifacts, ...artifacts],
          completedAt: nowIso(),
        }
      : p,
  );
  const nextIdx = idx + 1;
  const done = nextIdx >= phases.length;
  return {
    ...state,
    phases,
    currentPhase: done ? idx : nextIdx,
    status: done ? "complete" : "in_progress",
  };
}

function markPhaseFailed(state, idx, reason) {
  const phases = state.phases.map((p, i) =>
    i === idx
      ? { ...p, status: "failed", failures: [...p.failures, { at: nowIso(), reason }] }
      : p,
  );
  return { ...state, phases, status: "failed" };
}

module.exports = {
  stateDir,
  statePath,
  initRun,
  readState,
  writeState,
  markPhaseStarted,
  markPhaseComplete,
  markPhaseFailed,
  nowIso,
  newRunId,
};
