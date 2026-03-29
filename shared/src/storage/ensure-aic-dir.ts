// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import type { AbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";

const ignoreEntriesPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "aic-ignore-entries.json",
);
const parsed: unknown = JSON.parse(fs.readFileSync(ignoreEntriesPath, "utf8"));
if (
  typeof parsed !== "object" ||
  parsed === null ||
  !("lines" in parsed) ||
  !Array.isArray((parsed as { lines: unknown }).lines) ||
  !(parsed as { lines: unknown[] }).lines.every((x) => typeof x === "string")
) {
  throw new ConfigError("aic-ignore-entries.json: expected top-level lines string array");
}

// AIC-only paths; same list used for .gitignore, .prettierignore, .eslintignore.
export const AIC_IGNORE_ENTRIES: readonly string[] = (parsed as { lines: string[] })
  .lines;

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

const CONFIG_FILENAME = "aic.config.json";

function readDevMode(projectRoot: AbsolutePath): boolean {
  try {
    const raw = fs.readFileSync(path.join(projectRoot, CONFIG_FILENAME), "utf8");
    const data: unknown = JSON.parse(raw);
    return (
      typeof data === "object" &&
      data !== null &&
      "devMode" in data &&
      (data as { devMode: unknown }).devMode === true
    );
  } catch {
    return false;
  }
}

function ensureGitignore(projectRoot: AbsolutePath): void {
  const entries = readDevMode(projectRoot)
    ? AIC_IGNORE_ENTRIES.filter((e) => e !== CONFIG_FILENAME)
    : AIC_IGNORE_ENTRIES;
  ensureIgnoreFile(projectRoot, ".gitignore", entries);
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
