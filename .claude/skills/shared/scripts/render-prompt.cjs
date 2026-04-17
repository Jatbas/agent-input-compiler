#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function renderTemplate(template, vars) {
  const missing = new Set();
  const out = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return String(vars[name]);
    missing.add(name);
    return match;
  });
  return { out, missing: [...missing] };
}

function cli() {
  const [, , templatePath, ...kv] = process.argv;
  if (!templatePath) {
    process.stderr.write(
      "usage: render-prompt.cjs <template.md> KEY=value [KEY=value ...]\n",
    );
    process.exit(2);
  }
  const abs = path.resolve(templatePath);
  if (!fs.existsSync(abs)) {
    process.stderr.write(`template not found: ${abs}\n`);
    process.exit(2);
  }
  const template = fs.readFileSync(abs, "utf8");
  const vars = {};
  for (const entry of kv) {
    const eq = entry.indexOf("=");
    if (eq === -1) {
      process.stderr.write(`bad KEY=value: ${entry}\n`);
      process.exit(2);
    }
    vars[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
  const { out, missing } = renderTemplate(template, vars);
  if (missing.length > 0) {
    process.stderr.write(
      `render-prompt: unsubstituted placeholders: ${missing.join(", ")}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(out);
}

if (require.main === module) cli();

module.exports = { renderTemplate };
