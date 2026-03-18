// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "aic-hook-scripts.json"), "utf8"),
);
const hooksDir = path.join(root, "hooks");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const onDisk = fs.readdirSync(hooksDir).filter((f) => /^aic-[a-z0-9-]+\.cjs$/.test(f));
onDisk.sort();

for (const name of onDisk) {
  assert(
    manifest.hookScriptNames.includes(name),
    `hooks/${name} not in aic-hook-scripts.json`,
  );
}

for (const name of manifest.hookScriptNames) {
  assert(fs.existsSync(path.join(hooksDir, name)), `manifest ${name} missing on disk`);
}

console.log("ok: claude_uninstall_manifest_drift");
