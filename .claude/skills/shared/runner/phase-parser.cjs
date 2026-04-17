"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PHASE_ROW = /^\|\s*([^|]+?)\s*\|\s*[`]?([^|`]+?)[`]?\s*\|\s*[`]?([^|`]+?)[`]?\s*\|/;
const DIVIDER = /^\|\s*-+\s*\|/;

function parsePhaseTable(markdown) {
  const lines = markdown.split("\n");
  const start = lines.findIndex(
    (l) =>
      l.trim().startsWith("## Process overview") ||
      l.trim() === "## Process overview (phase dispatch)",
  );
  if (start === -1) return null;

  const phases = [];
  let inTable = false;

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith("## ") && i > start) break;

    if (DIVIDER.test(line)) {
      inTable = true;
      continue;
    }

    if (!inTable) continue;
    if (!line.startsWith("|")) {
      if (line.trim() === "") continue;
      break;
    }

    const m = line.match(PHASE_ROW);
    if (!m) continue;

    const [, label, file, checkpoint] = m;
    if (label.toLowerCase() === "phase") continue;
    if (label.trim() === "—" || file.trim() === "—") continue;

    phases.push({
      label: label.trim(),
      file: file.trim(),
      checkpoint: checkpoint.trim(),
    });
  }

  return phases.length === 0 ? null : phases;
}

function loadSkillPhases(skillRoot) {
  const skillFile = path.join(skillRoot, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    throw new Error(`SKILL.md not found at ${skillFile}`);
  }
  const content = fs.readFileSync(skillFile, "utf8");
  const phases = parsePhaseTable(content);
  if (!phases) {
    throw new Error(
      `No parseable 'Process overview' table in ${skillFile}. ` +
        `Skills without phase tables run inline and do not use the runner.`,
    );
  }
  return phases;
}

module.exports = { parsePhaseTable, loadSkillPhases };
