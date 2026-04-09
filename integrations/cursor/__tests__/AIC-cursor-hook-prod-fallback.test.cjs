// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const hooksDir = path.join(__dirname, "..", "hooks");

function readHook(name) {
  return fs.readFileSync(path.join(hooksDir, name), "utf8");
}

function isDev_check_present(hookName) {
  const src = readHook(hookName);
  assert.ok(
    src.includes("fs.existsSync(serverScript)"),
    `${hookName}: missing isDev check 'fs.existsSync(serverScript)'`,
  );
  console.log(`isDev_check_present (${hookName}): pass`);
}

function prod_fallback_present(hookName) {
  const src = readHook(hookName);
  assert.ok(
    src.includes("npx -y @jatbas/aic"),
    `${hookName}: missing prod fallback 'npx -y @jatbas/aic'`,
  );
  console.log(`prod_fallback_present (${hookName}): pass`);
}

function dev_path_retained(hookName) {
  const src = readHook(hookName);
  assert.ok(src.includes("npx tsx"), `${hookName}: missing dev path 'npx tsx'`);
  console.log(`dev_path_retained (${hookName}): pass`);
}

function server_cmd_used_in_execsync(hookName) {
  const src = readHook(hookName);
  assert.ok(
    src.includes("execSync(serverCmd"),
    `${hookName}: execSync must use 'serverCmd' variable, not hardcoded string`,
  );
  console.log(`server_cmd_used_in_execsync (${hookName}): pass`);
}

const hooks = [
  "AIC-compile-context.cjs",
  "AIC-subagent-compile.cjs",
  "AIC-subagent-stop.cjs",
];

for (const hook of hooks) {
  isDev_check_present(hook);
  prod_fallback_present(hook);
  dev_path_retained(hook);
  server_cmd_used_in_execsync(hook);
}

console.log("All AIC-cursor-hook-prod-fallback tests passed.");
