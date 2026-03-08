// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "#core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "#core/types/paths.js";
import type { InclusionTier } from "#core/types/enums.js";

const EMPTY_EXTENSIONS: readonly FileExtension[] = [];
const ENV_EXAMPLE_SUFFIXES: readonly string[] = [".example", ".sample", ".template"];

const VALUE_LINE_RE = /^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

function isEnvExamplePath(path: RelativePath): boolean {
  const segments = path.split("/");
  const basename = segments.length > 0 ? (segments[segments.length - 1] ?? path) : path;
  const lower = basename.toLowerCase();
  if (!lower.startsWith(".env")) return false;
  return ENV_EXAMPLE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function redactLine(line: string): string {
  if (line.length === 0 || line.startsWith("#")) return line;
  const match = line.match(VALUE_LINE_RE);
  if (match === null) return line;
  const prefix = match[1];
  const key = match[2];
  return `${prefix ?? ""}${key}=***`;
}

export class EnvExampleRedactor implements ContentTransformer {
  readonly id = "env-example-redactor";
  readonly fileExtensions: readonly FileExtension[] = EMPTY_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string {
    if (content.length === 0) return content;
    if (!isEnvExamplePath(filePath)) return content;
    const lines = content.split("\n");
    const redacted = lines.map(redactLine);
    return redacted.join("\n");
  }
}
