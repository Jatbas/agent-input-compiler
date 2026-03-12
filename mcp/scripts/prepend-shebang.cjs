// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const path = require("node:path");
const fs = require("node:fs");

const targetPath = path.join(__dirname, "..", "dist", "server.js");
const shebang = "#!/usr/bin/env -S node --max-old-space-size=4096\n";
const content = fs.readFileSync(targetPath, "utf8");
if (content.startsWith("#!")) {
  return;
}
fs.writeFileSync(targetPath, shebang + content, "utf8");
