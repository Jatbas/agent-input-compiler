// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

// AIC-only paths; same list used for .gitignore, .prettierignore, .eslintignore.
export const AIC_IGNORE_ENTRIES: readonly string[] = [
  ".aic/",
  "aic.config.json",
  ".cursor/rules/AIC.mdc",
  ".cursor/hooks.json",
  ".cursor/hooks/AIC-*.cjs",
];

function hasIgnoreEntry(content: string, entry: string): boolean {
  return content.split("\n").some((line) => {
    const trimmed = line.trim();
    if (entry === ".aic/") return trimmed === ".aic/" || trimmed === ".aic";
    return trimmed === entry;
  });
}

function ensureIgnoreFile(
  projectRoot: AbsolutePath,
  filename: string,
  entries: readonly string[],
): void {
  const filePath = path.join(projectRoot, filename);
  const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const missing = entries.filter((e) => !hasIgnoreEntry(content, e));
  if (missing.length === 0) return;
  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const toAppend = missing.map((e) => `${e}\n`).join("");
  fs.writeFileSync(filePath, `${content}${separator}${toAppend}`, "utf8");
}

function ensureGitignore(projectRoot: AbsolutePath): void {
  ensureIgnoreFile(projectRoot, ".gitignore", AIC_IGNORE_ENTRIES);
}

export function ensurePrettierignore(projectRoot: AbsolutePath): void {
  ensureIgnoreFile(projectRoot, ".prettierignore", AIC_IGNORE_ENTRIES);
}

export function ensureEslintignore(projectRoot: AbsolutePath): void {
  ensureIgnoreFile(projectRoot, ".eslintignore", AIC_IGNORE_ENTRIES);
}

export function ensureAicDir(projectRoot: AbsolutePath): AbsolutePath {
  const aicDir = path.join(projectRoot, ".aic");
  fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
  ensureGitignore(projectRoot);
  return toAbsolutePath(aicDir);
}
