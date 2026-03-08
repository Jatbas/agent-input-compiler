// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "#core/types/paths.js";
import { toAbsolutePath } from "#core/types/paths.js";

function hasAicEntry(content: string): boolean {
  return content.split("\n").some((line) => {
    const trimmed = line.trim();
    return trimmed === ".aic/" || trimmed === ".aic";
  });
}

function ensureGitignore(projectRoot: AbsolutePath): void {
  const gitignorePath = path.join(projectRoot, ".gitignore");
  const entry = ".aic/";
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    if (hasAicEntry(content)) return;
    const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(gitignorePath, `${content}${separator}${entry}\n`, "utf8");
  } else {
    fs.writeFileSync(gitignorePath, `${entry}\n`, "utf8");
  }
}

export function ensureAicDir(projectRoot: AbsolutePath): AbsolutePath {
  const aicDir = path.join(projectRoot, ".aic");
  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  ensureGitignore(projectRoot);
  return toAbsolutePath(aicDir);
}
