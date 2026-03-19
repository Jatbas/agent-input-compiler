// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");

const INPUT = '{"test":true}\n';

function readStdinSync_returns_piped_input() {
  const modulePath = path.resolve(__dirname, "../read-stdin-sync.cjs");
  const script =
    "const {readStdinSync}=require(" +
    JSON.stringify(modulePath) +
    "); process.stdout.write(readStdinSync());";
  const result = spawnSync("node", ["-e", script], {
    stdio: ["pipe", "pipe", "pipe"],
    input: INPUT,
  });
  assert.strictEqual(result.status, 0, "child process should exit 0");
  assert.strictEqual(
    result.stdout.toString("utf8"),
    INPUT,
    "stdout should equal piped input",
  );
}

const cases = [readStdinSync_returns_piped_input];

let failed = 0;
for (const fn of cases) {
  try {
    fn();
    console.log("OK", fn.name);
  } catch (err) {
    console.error("FAIL", fn.name, err.message);
    failed += 1;
  }
}
process.exit(failed > 0 ? 1 : 0);
