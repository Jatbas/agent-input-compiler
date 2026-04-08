"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const PLUGIN_SCRIPT_NAMES = [
  "aic-compile-helper.cjs",
  "aic-after-file-edit-tracker.cjs",
  "aic-block-no-verify.cjs",
  "aic-pre-compact.cjs",
  "aic-subagent-inject.cjs",
  "aic-subagent-stop.cjs",
  "aic-stop-quality-check.cjs",
  "aic-session-end.cjs",
  "aic-session-start.cjs",
  "aic-prompt-compile.cjs",
  "aic-inject-conversation-id.cjs",
];

const claudeRoot = path.join(__dirname, "..");
const scriptsDir = path.join(claudeRoot, "plugin", "scripts");

for (const name of PLUGIN_SCRIPT_NAMES) {
  const filePath = path.join(scriptsDir, name);
  const content = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !content.includes("../../../shared"),
    `expected no ../../../shared in ${name}`,
  );
  const expected = `// @aic-managed\nmodule.exports = require("../../hooks/${name}");`;
  assert.strictEqual(content.trim(), expected);
}

for (const name of PLUGIN_SCRIPT_NAMES) {
  const loaded = require(path.join(scriptsDir, name));
  assert.ok(loaded !== null && typeof loaded === "object");
  if (name === "aic-compile-helper.cjs") {
    assert.strictEqual(typeof loaded.callAicCompile, "function");
  } else {
    assert.strictEqual(typeof loaded.run, "function");
  }
}

console.log("ok: plugin_scripts_reexport");
