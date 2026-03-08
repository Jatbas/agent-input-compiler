"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const SPDX_MARKER = "SPDX-License-Identifier: Apache-2.0";
const HEADER =
  "// SPDX-License-Identifier: Apache-2.0\n// Copyright (c) 2025 AIC Contributors\n\n";

function walkDir(dir, extRe, out) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === "repos") continue;
      walkDir(full, extRe, out);
    } else if (extRe.test(e.name)) {
      out.push(full);
    }
  }
}

function collectFiles() {
  const out = [];
  walkDir(path.join(ROOT, "shared", "src"), /\.ts$/, out);
  walkDir(path.join(ROOT, "mcp", "src"), /\.ts$/, out);
  walkDir(path.join(ROOT, ".cursor"), /\.cjs$/, out);
  walkDir(path.join(ROOT, ".claude"), /\.cjs$/, out);
  walkDir(path.join(ROOT, "mcp", "hooks"), /\.cjs$/, out);
  walkDir(path.join(ROOT, "mcp", "scripts"), /\.cjs$/, out);
  const commitlint = path.join(ROOT, "commitlint.config.cjs");
  if (fs.existsSync(commitlint)) out.push(commitlint);
  return out;
}

function hasHeader(content) {
  const head = content.slice(0, 512);
  return head.includes(SPDX_MARKER);
}

function addHeader(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (hasHeader(content)) return;
  fs.writeFileSync(filePath, HEADER + content, "utf8");
}

const files = collectFiles();
files.forEach(addHeader);
