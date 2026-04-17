#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const crypto = require("node:crypto");

const PROJECT_ROOT = process.env.AIC_PROJECT_ROOT || process.cwd();
const SKILLS_ROOT = path.join(PROJECT_ROOT, ".claude", "skills");
const EVAL_DIR = path.join(PROJECT_ROOT, ".aic", "evals");

function usage() {
  process.stderr.write(
    [
      "usage: skill-eval <command> [args]",
      "  list <skill>                     list test cases",
      "  prepare <skill> <case-id>        stage input into .aic/evals/<eval-id>/ and print instructions",
      "  verify <eval-id> --output <p>    run the rubric against a produced output, report pass/fail",
      "  run <skill> <case-id>            prepare + verify (for agent-in-the-loop: output path is supplied via --output after produce)",
      "  cases <skill>                    print test-case directory paths",
      "  rubrics <skill>                  print every rubric's HARD check commands",
      "",
      "env: AIC_PROJECT_ROOT=<path>",
    ].join("\n") + "\n",
  );
  process.exit(2);
}

function skillTestCasesDir(skill) {
  return path.join(SKILLS_ROOT, skill, "test-cases");
}

function listCases(skill) {
  const dir = skillTestCasesDir(skill);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function caseDir(skill, caseId) {
  const p = path.join(skillTestCasesDir(skill), caseId);
  if (!fs.existsSync(p)) {
    process.stderr.write(`test case not found: ${skill}/${caseId} (looked in ${p})\n`);
    process.exit(2);
  }
  return p;
}

function readRubric(dir) {
  const p = path.join(dir, "rubric.md");
  if (!fs.existsSync(p)) {
    throw new Error(`rubric.md missing in ${dir}`);
  }
  const body = fs.readFileSync(p, "utf8");
  const hardChecks = extractFencedBlock(body, "hard-checks");
  const softChecks = extractFencedBlock(body, "soft-checks");
  const diffExpect = extractFencedBlock(body, "diff-expect");
  return { body, hardChecks, softChecks, diffExpect };
}

function extractFencedBlock(markdown, label) {
  const re = new RegExp(
    `<!--\\s*${label}\\s*-->\\s*\\n\`\`\`(?:[a-z]+)?\\n([\\s\\S]*?)\\n\`\`\``,
    "m",
  );
  const m = markdown.match(re);
  return m ? m[1].trim() : "";
}

function ensureEvalDir() {
  fs.mkdirSync(EVAL_DIR, { recursive: true, mode: 0o700 });
}

function newEvalId() {
  return crypto.randomUUID();
}

function evalStatePath(evalId) {
  return path.join(EVAL_DIR, `${evalId}.json`);
}

function cmdList(args) {
  const skill = args[0];
  if (!skill) usage();
  const cases = listCases(skill);
  if (cases.length === 0) {
    process.stderr.write(`no test cases for skill: ${skill}\n`);
    process.exit(1);
  }
  for (const c of cases) process.stdout.write(c + "\n");
}

function cmdPrepare(args) {
  const [skill, caseId] = args;
  if (!skill || !caseId) usage();
  const dir = caseDir(skill, caseId);
  const input = fs.readFileSync(path.join(dir, "input.md"), "utf8");
  const rubric = readRubric(dir);

  ensureEvalDir();
  const evalId = newEvalId();
  const stageDir = path.join(EVAL_DIR, evalId);
  fs.mkdirSync(stageDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(stageDir, "input.md"), input);
  fs.writeFileSync(path.join(stageDir, "rubric.md"), rubric.body);

  const state = {
    evalId,
    skill,
    caseId,
    caseDir: path.relative(PROJECT_ROOT, dir),
    stageDir: path.relative(PROJECT_ROOT, stageDir),
    createdAt: new Date().toISOString(),
    status: "staged",
  };
  fs.writeFileSync(evalStatePath(evalId), JSON.stringify(state, null, 2));

  process.stdout.write(
    [
      `eval-id: ${evalId}`,
      `skill:   ${skill}`,
      `case:    ${caseId}`,
      `input:   ${state.stageDir}/input.md`,
      `rubric:  ${state.stageDir}/rubric.md`,
      `expected:${state.caseDir}/expected.md`,
      "",
      "Next steps (agent-in-the-loop):",
      "  1. Read the input file and execute the skill against it.",
      "  2. Write the produced output to any path you choose.",
      `  3. Run: node skill-eval.cjs verify ${evalId} --output <your-output-path>`,
      "",
    ].join("\n"),
  );
}

function runCheckBlock(block, vars) {
  if (!block.trim()) return { passed: [], failed: [] };
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const passed = [];
  const failed = [];
  for (const line of lines) {
    const expanded = line
      .replace(/\$OUTPUT/g, vars.OUTPUT)
      .replace(/\$EXPECTED/g, vars.EXPECTED)
      .replace(/\$STAGE/g, vars.STAGE)
      .replace(/\$PROJECT_ROOT/g, vars.PROJECT_ROOT);
    try {
      cp.execSync(expanded, {
        stdio: "pipe",
        env: { ...process.env, AIC_PROJECT_ROOT: PROJECT_ROOT },
      });
      passed.push(expanded);
    } catch (err) {
      failed.push({ cmd: expanded, exit: err.status ?? -1 });
    }
  }
  return { passed, failed };
}

function cmdVerify(args) {
  const evalId = args[0];
  if (!evalId) usage();
  let outputPath = null;
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === "--output") {
      outputPath = args[i + 1];
      i += 1;
    }
  }
  if (!outputPath) {
    process.stderr.write("--output <path> is required\n");
    process.exit(2);
  }
  const absOutput = path.resolve(PROJECT_ROOT, outputPath);
  if (!fs.existsSync(absOutput)) {
    process.stderr.write(`output not found: ${absOutput}\n`);
    process.exit(1);
  }

  const statePath = evalStatePath(evalId);
  if (!fs.existsSync(statePath)) {
    process.stderr.write(`eval state not found: ${evalId}\n`);
    process.exit(2);
  }
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const caseAbs = path.resolve(PROJECT_ROOT, state.caseDir);
  const expectedPath = path.join(caseAbs, "expected.md");
  const rubric = readRubric(caseAbs);

  const vars = {
    OUTPUT: absOutput,
    EXPECTED: expectedPath,
    STAGE: path.resolve(PROJECT_ROOT, state.stageDir),
    PROJECT_ROOT,
  };

  const hard = runCheckBlock(rubric.hardChecks, vars);
  const soft = runCheckBlock(rubric.softChecks, vars);

  const passed = hard.failed.length === 0;
  const report = {
    evalId,
    skill: state.skill,
    caseId: state.caseId,
    outputPath: path.relative(PROJECT_ROOT, absOutput),
    passed,
    hardPassed: hard.passed.length,
    hardFailed: hard.failed,
    softPassed: soft.passed.length,
    softFailed: soft.failed,
    verifiedAt: new Date().toISOString(),
  };

  const next = { ...state, status: passed ? "passed" : "failed", report };
  fs.writeFileSync(statePath, JSON.stringify(next, null, 2));

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exit(passed ? 0 : 1);
}

function cmdCases(args) {
  const skill = args[0];
  if (!skill) usage();
  for (const c of listCases(skill)) {
    process.stdout.write(path.join("test-cases", c) + "\n");
  }
}

function cmdRubrics(args) {
  const skill = args[0];
  if (!skill) usage();
  for (const c of listCases(skill)) {
    const dir = path.join(skillTestCasesDir(skill), c);
    const r = readRubric(dir);
    process.stdout.write(
      `--- ${skill}/${c} ---\n${r.hardChecks || "(no HARD checks)"}\n\n`,
    );
  }
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  const handlers = {
    list: cmdList,
    prepare: cmdPrepare,
    verify: cmdVerify,
    cases: cmdCases,
    rubrics: cmdRubrics,
  };
  const handler = handlers[cmd];
  if (!handler) usage();
  handler(rest);
}

main();
