// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");
const path = require("path");
const os = require("os");

function readAicPrewarmPrompt(fileKey) {
  const full = path.join(os.tmpdir(), `aic-prompt-${fileKey}`);
  let content;
  try {
    content = fs.readFileSync(full, "utf8");
  } catch {
    return "";
  }
  return content.trim().replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, "");
}

module.exports = { readAicPrewarmPrompt };
