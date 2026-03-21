// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const gitignorePath = path.join(repoRoot, ".gitignore");
const raw = fs.readFileSync(gitignorePath, "utf8");
const lines = raw.split("\n").map((line) => line.trim());

const aicGlobLine = ".cursor/hooks/AIC-*.cjs";
const negationLine = "!.cursor/hooks/aic-dir.cjs";

const aicIndex = lines.indexOf(aicGlobLine);
const negationIndex = lines.indexOf(negationLine);

if (aicIndex === -1) {
  throw new Error(`missing ${aicGlobLine} in .gitignore`);
}
if (negationIndex === -1) {
  throw new Error(`missing ${negationLine} in .gitignore`);
}
if (negationIndex <= aicIndex) {
  throw new Error(
    `expected ${negationLine} after ${aicGlobLine}: aicIndex=${aicIndex} negationIndex=${negationIndex}`,
  );
}

const check = spawnSync("git", ["check-ignore", "-q", ".cursor/hooks/aic-dir.cjs"], {
  cwd: repoRoot,
  encoding: "utf8",
});

if (check.status !== 1) {
  throw new Error(
    `expected git check-ignore status 1 (path not ignored), got ${check.status}`,
  );
}

console.log("gitignore_aic_dir_trackable: ok");
