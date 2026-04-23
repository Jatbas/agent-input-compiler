// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

export function isDefaultIgnoreGitScopePath(relativePath: string): boolean {
  if (relativePath === ".git") return true;
  if (relativePath.startsWith(".git/")) return true;
  if (relativePath.includes("/.git/")) return true;
  if (relativePath.endsWith("/.git")) return true;
  return false;
}
