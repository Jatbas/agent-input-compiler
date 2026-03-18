// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "aic-hook-scripts.json"), "utf8"),
);
const template = JSON.parse(
  fs.readFileSync(path.join(root, "hooks.json.template"), "utf8"),
);
const hooksDir = path.join(root, "hooks");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function collectScriptNamesFromTemplate(obj, acc) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "string") {
    const m = obj.match(/AIC-[a-z0-9-]+\.cjs/g);
    if (m) m.forEach((s) => acc.add(s));
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((x) => collectScriptNamesFromTemplate(x, acc));
    return;
  }
  if (typeof obj === "object") {
    Object.keys(obj).forEach((k) => collectScriptNamesFromTemplate(obj[k], acc));
  }
}

const fromTemplate = new Set();
collectScriptNamesFromTemplate(template, fromTemplate);

for (const name of fromTemplate) {
  assert(
    manifest.hookScriptNames.includes(name),
    `hooks.json.template references ${name} missing from aic-hook-scripts.json`,
  );
}

for (const name of manifest.hookScriptNames) {
  assert(
    fs.existsSync(path.join(hooksDir, name)),
    `manifest lists ${name} but hooks/${name} missing`,
  );
}

console.log("ok: cursor_uninstall_manifest_drift");
