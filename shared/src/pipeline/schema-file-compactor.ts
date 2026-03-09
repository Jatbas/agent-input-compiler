// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

const EMPTY_EXTENSIONS: readonly FileExtension[] = [];
const SCHEMA_METADATA_KEYS: readonly string[] = [
  "description",
  "title",
  "examples",
  "$comment",
  "default",
];

function getExtension(path: RelativePath): string {
  if (path.endsWith(".d.ts")) return ".d.ts";
  const idx = path.lastIndexOf(".");
  return idx >= 0 ? path.slice(idx) : "";
}

function isJsonSchemaRoot(obj: unknown): boolean {
  if (obj === null || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return "$schema" in o || "$ref" in o;
}

function stripJsonSchemaMetadata(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(stripJsonSchemaMetadata);
  const o = obj as Record<string, unknown>;
  const entries = Object.entries(o).filter(
    ([key]) => !SCHEMA_METADATA_KEYS.includes(key),
  );
  const next = entries.map(([k, v]) => [k, stripJsonSchemaMetadata(v)] as const);
  return Object.fromEntries(next);
}

function compactJsonSchema(content: string): string {
  try {
    const parsed = JSON.parse(content.trim()) as unknown;
    if (!isJsonSchemaRoot(parsed)) return content;
    return JSON.stringify(stripJsonSchemaMetadata(parsed));
  } catch {
    return content;
  }
}

function isSchemaPath(path: RelativePath): boolean {
  const ext = getExtension(path).toLowerCase();
  return ext === ".graphql" || ext === ".gql" || ext === ".prisma" || ext === ".proto";
}

function stripLineComments(content: string, lineCommentStart: string): string {
  const lines = content.split("\n");
  const kept = lines.filter((line) => !line.trim().startsWith(lineCommentStart));
  return kept.join("\n");
}

function stripBlockComments(content: string, open: string, close: string): string {
  const openLen = open.length;
  const closeLen = close.length;
  function dropFrom(pos: number): string {
    const openIdx = content.indexOf(open, pos);
    if (openIdx === -1) return content.slice(pos);
    const closeIdx = content.indexOf(close, openIdx + openLen);
    if (closeIdx === -1) return content.slice(pos, openIdx) + content.slice(openIdx);
    return content.slice(pos, openIdx) + dropFrom(closeIdx + closeLen);
  }
  return dropFrom(0);
}

const EMPTY_STRING_ARR: readonly string[] = [];

function collapseBlankLines(content: string): string {
  const lines = content.split("\n");
  type Acc = { readonly result: readonly string[]; readonly prevEmpty: boolean };
  const folded = lines.reduce<Acc>(
    (acc, line) => {
      const empty = line.trim().length === 0;
      const skip = empty && acc.prevEmpty;
      return {
        result: skip ? acc.result : [...acc.result, line],
        prevEmpty: empty,
      };
    },
    { result: EMPTY_STRING_ARR, prevEmpty: false },
  );
  return folded.result.join("\n");
}

function stripGraphqlHashToEol(content: string): string {
  const lines = content.split("\n");
  const stripped = lines.map((line) => {
    const hashIdx = line.indexOf("#");
    if (hashIdx === -1) return line;
    return line.slice(0, hashIdx).trimEnd();
  });
  return stripped.join("\n");
}

function compactGraphql(content: string): string {
  const noBlocks = stripBlockComments(content, '"""', '"""');
  const noHashLines = stripLineComments(noBlocks, "#");
  const noHashEol = stripGraphqlHashToEol(noHashLines);
  const trimmed = noHashEol.trim();
  return collapseBlankLines(trimmed);
}

function compactPrisma(content: string): string {
  const lines = content.split("\n");
  const noLineComments = lines.filter(
    (line) => !line.trim().startsWith("//") && !line.trim().startsWith("///"),
  );
  const rejoined = noLineComments.join("\n");
  const noBlock = stripBlockComments(rejoined, "/*", "*/");
  return noBlock.trim();
}

function compactProto(content: string): string {
  const noLine = stripLineComments(content, "//");
  const noBlock = stripBlockComments(noLine, "/*", "*/");
  return noBlock.trim();
}

export class SchemaFileCompactor implements ContentTransformer {
  readonly id = "schema-file-compactor";
  readonly fileExtensions: readonly FileExtension[] = EMPTY_EXTENSIONS;

  transform(content: string, _tier: InclusionTier, filePath: RelativePath): string {
    if (content.length === 0) return content;
    const jsonResult = compactJsonSchema(content);
    if (jsonResult !== content) return jsonResult;
    if (!isSchemaPath(filePath)) return content;
    const ext = getExtension(filePath).toLowerCase();
    if (ext === ".graphql" || ext === ".gql") return compactGraphql(content);
    if (ext === ".prisma") return compactPrisma(content);
    if (ext === ".proto") return compactProto(content);
    return content;
  }
}
