"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const SPDX_MARKER = "SPDX-License-Identifier: Apache-2.0";

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
  walkDir(path.join(ROOT, "integrations", "cursor", "hooks"), /\.cjs$/, out);
  walkDir(path.join(ROOT, "mcp", "scripts"), /\.cjs$/, out);
  const commitlint = path.join(ROOT, "commitlint.config.cjs");
  if (fs.existsSync(commitlint)) out.push(commitlint);
  return out;
}

function hasHeader(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const head = content.slice(0, 512);
  return head.includes(SPDX_MARKER);
}

const files = collectFiles();
const missing = files.filter((f) => !hasHeader(f));
if (missing.length > 0) {
  missing.forEach((f) => console.log(f));
  process.exit(1);
}
process.exit(0);
