// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");
const { tryStripProjectClaudeMd } = require("./strip-project-claude-md.cjs");

function loadIgnoreLineSet() {
  const { lines } = require("./aic-ignore-entries.json");
  return new Set(lines);
}

function tryRemoveIgnoreLines(filePath, lineSet) {
  if (!fs.existsSync(filePath)) return false;
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  const next = lines.filter((line) => !lineSet.has(line.trim()));
  if (next.length === lines.length) return false;
  const body = next.join("\n");
  const withNl = body.endsWith("\n") || body.length === 0 ? body : `${body}\n`;
  fs.writeFileSync(filePath, withNl, "utf8");
  return true;
}

function tryUninstallProjectAic(projectRoot, options) {
  if (options.keepProjectArtifacts) {
    return { changed: false, parts: [] };
  }
  const parts = [];
  let changed = false;
  const cfg = path.join(projectRoot, "aic.config.json");
  if (fs.existsSync(cfg)) {
    fs.unlinkSync(cfg);
    changed = true;
    parts.push("Removed aic.config.json from the project.");
  }
  const aicDir = path.join(projectRoot, ".aic");
  const homeDir = options.homeDir;
  const globalAicPath =
    homeDir !== undefined && homeDir !== null && String(homeDir).length > 0
      ? path.join(String(homeDir), ".aic")
      : null;
  const projectAicIsGlobalHome =
    globalAicPath !== null && path.resolve(aicDir) === path.resolve(globalAicPath);
  if (fs.existsSync(aicDir) && !projectAicIsGlobalHome) {
    fs.rmSync(aicDir, { recursive: true, force: true });
    changed = true;
    parts.push("Removed project .aic/ directory.");
  }
  const lineSet = loadIgnoreLineSet();
  for (const name of [".gitignore", ".prettierignore", ".eslintignore"]) {
    const fp = path.join(projectRoot, name);
    if (tryRemoveIgnoreLines(fp, lineSet)) {
      changed = true;
      parts.push(`Removed AIC ignore entries from ${name}.`);
    }
  }
  const claudeMd = path.join(projectRoot, ".claude", "CLAUDE.md");
  const { body: canonicalBody } = require("./claude-md-canonical-body.json");
  const strip = tryStripProjectClaudeMd(claudeMd, canonicalBody);
  if (strip.changed) {
    changed = true;
    parts.push(...strip.parts);
  }
  return { changed, parts };
}

module.exports = { tryUninstallProjectAic };
