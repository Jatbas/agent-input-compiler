// @aic-managed
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

const fs = require("fs");

function readStdinSync() {
  const chunks = [];
  let size = 0;
  const buf = Buffer.alloc(64 * 1024);
  let n;
  while ((n = fs.readSync(0, buf, 0, buf.length, null)) > 0) {
    chunks.push(buf.slice(0, n));
    size += n;
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

module.exports = { readStdinSync };
