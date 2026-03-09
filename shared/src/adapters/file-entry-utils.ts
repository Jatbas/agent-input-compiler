// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as path from "node:path";
import type { FileEntry } from "@jatbas/aic-core/core/types/repo-map.js";
import type { Bytes } from "@jatbas/aic-core/core/types/units.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import type { RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";

export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".ico",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".webm",
  ".zip",
  ".gz",
  ".tar",
  ".rar",
  ".7z",
  ".bz2",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".sqlite",
  ".db",
  ".sqlite3",
  ".wasm",
  ".map",
]);

export const EXTENSION_TO_LANGUAGE: Readonly<Record<string, string>> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".mdx": "markdown",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".css": "css",
  ".scss": "scss",
  ".html": "html",
  ".xml": "xml",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".rb": "ruby",
  ".swift": "swift",
  ".kt": "kotlin",
  ".sql": "sql",
  ".graphql": "graphql",
  ".proto": "protobuf",
  ".vue": "vue",
  ".svelte": "svelte",
};

export function languageFromExtension(ext: string): string {
  return EXTENSION_TO_LANGUAGE[ext] ?? (ext.length > 1 ? ext.slice(1) : "unknown");
}

export function isBinaryExtension(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext);
}

export function buildFileEntry(
  relativePath: RelativePath,
  sizeBytes: Bytes,
  lastModified: ISOTimestamp,
): FileEntry | null {
  const ext = path.extname(relativePath).toLowerCase();
  if (isBinaryExtension(ext)) return null;
  const language = languageFromExtension(ext);
  const estimatedTokens = toTokenCount(Math.ceil(sizeBytes / 4));
  return { path: relativePath, language, sizeBytes, estimatedTokens, lastModified };
}
