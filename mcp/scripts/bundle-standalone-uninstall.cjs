// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

"use strict";

const path = require("node:path");
const esbuild = require("esbuild");

const scriptDir = __dirname;
const repoRoot = path.join(scriptDir, "..", "..");
const entryPath = path.join(repoRoot, "integrations", "standalone-uninstall-entry.cjs");
const outPath = path.join(repoRoot, "integrations", "aic-uninstall-standalone.cjs");

esbuild
  .build({
    absWorkingDir: repoRoot,
    allowOverwrite: true,
    bundle: true,
    entryPoints: [entryPath],
    format: "cjs",
    outfile: outPath,
    platform: "node",
  })
  .then(() => {
    console.log("ok");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
