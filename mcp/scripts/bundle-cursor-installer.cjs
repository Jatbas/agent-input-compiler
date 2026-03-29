// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const scriptDir = __dirname;
const repoRoot = path.join(scriptDir, "..", "..");
const destRoot = path.join(scriptDir, "..", "integrations");

const filter = (src) => !src.includes("__tests__");

const cursorSrc = path.join(repoRoot, "integrations", "cursor");
const cursorDest = path.join(destRoot, "cursor");
const sharedSrc = path.join(repoRoot, "integrations", "shared");
const sharedDest = path.join(destRoot, "shared");
const claudeSrc = path.join(repoRoot, "integrations", "claude");
const claudeDest = path.join(destRoot, "claude");
const cleanGlobalSrc = path.join(repoRoot, "integrations", "clean-global-aic-dir.cjs");
const cleanGlobalDest = path.join(destRoot, "clean-global-aic-dir.cjs");

fs.mkdirSync(destRoot, { recursive: true });
fs.cpSync(cursorSrc, cursorDest, { recursive: true, force: true, filter });
fs.cpSync(sharedSrc, sharedDest, { recursive: true, force: true, filter });
fs.cpSync(claudeSrc, claudeDest, { recursive: true, force: true, filter });
fs.copyFileSync(cleanGlobalSrc, cleanGlobalDest);
