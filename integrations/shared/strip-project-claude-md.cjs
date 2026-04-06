// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");

const CLAUDE_MD_OPENING_LINE_RE = new RegExp(
  "^\\s*<!--\\s*BEGIN AIC MANAGED SECTION — do not edit between these markers\\s*-->\\s*$",
);
const CLAUDE_MD_CLOSING_LINE_RE = new RegExp(
  "^\\s*<!--\\s*END AIC MANAGED SECTION\\s*-->\\s*$",
);

function normalizeLf(text) {
  return String(text).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function findValidManagedPairLines(lines) {
  const openIdx = lines.findIndex((line) => CLAUDE_MD_OPENING_LINE_RE.test(line));
  if (openIdx < 0) return { valid: false };
  const closeIdx = lines.findIndex(
    (line, idx) => idx > openIdx && CLAUDE_MD_CLOSING_LINE_RE.test(line),
  );
  if (closeIdx < 0) return { valid: false };
  return { valid: true, openIdx, closeIdx };
}

function tryRemoveEmptyClaudeDir(claudeDir) {
  try {
    if (!fs.existsSync(claudeDir)) return;
    if (fs.readdirSync(claudeDir).length === 0) {
      fs.rmSync(claudeDir, { recursive: false });
    }
  } catch {
    // best effort
  }
}

function tryStripProjectClaudeMd(claudeMdPath, canonicalBodyUtf8) {
  const parts = [];
  if (!fs.existsSync(claudeMdPath)) {
    return { changed: false, parts };
  }
  const raw = fs.readFileSync(claudeMdPath, "utf8");
  const normalizedFile = normalizeLf(raw);
  const canonicalNorm = normalizeLf(canonicalBodyUtf8);

  const lines = normalizedFile.split("\n");
  const pair = findValidManagedPairLines(lines);

  if (pair.valid) {
    const before = lines.slice(0, pair.openIdx).join("\n");
    const after = lines.slice(pair.closeIdx + 1).join("\n");
    const segs = [];
    if (before.length > 0) segs.push(before);
    if (after.length > 0) segs.push(after);
    const remainder = segs.join("\n").trim();

    if (remainder === "") {
      fs.unlinkSync(claudeMdPath);
      parts.push("Removed .claude/CLAUDE.md.");
      tryRemoveEmptyClaudeDir(path.dirname(claudeMdPath));
      return { changed: true, parts };
    }

    const remNorm = normalizeLf(remainder);
    if (remNorm.trim() === canonicalNorm.trim()) {
      fs.unlinkSync(claudeMdPath);
      parts.push("Removed .claude/CLAUDE.md.");
      tryRemoveEmptyClaudeDir(path.dirname(claudeMdPath));
      return { changed: true, parts };
    }

    const out =
      remainder.endsWith("\n") || remainder.length === 0 ? remainder : `${remainder}\n`;
    fs.writeFileSync(claudeMdPath, out, "utf8");
    parts.push("Removed AIC managed block from .claude/CLAUDE.md.");
    tryRemoveEmptyClaudeDir(path.dirname(claudeMdPath));
    return { changed: true, parts };
  }

  if (normalizedFile.trim() === canonicalNorm.trim()) {
    fs.unlinkSync(claudeMdPath);
    parts.push("Removed .claude/CLAUDE.md.");
    tryRemoveEmptyClaudeDir(path.dirname(claudeMdPath));
    return { changed: true, parts };
  }

  return { changed: false, parts };
}

module.exports = { tryStripProjectClaudeMd };
