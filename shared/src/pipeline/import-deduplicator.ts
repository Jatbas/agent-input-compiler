// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { ContentTransformer } from "@jatbas/aic-core/core/interfaces/content-transformer.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { InclusionTier } from "@jatbas/aic-core/core/types/enums.js";

// ES/TS import and require(); group by specifier, merge named bindings.
const NAMED_IMPORT_RE = /^\s*import\s+\{\s*([^}]+)\}\s+from\s+["']([^"']+)["']\s*;?\s*$/;
const NAMESPACE_IMPORT_RE =
  /^\s*import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']\s*;?\s*$/;
const DEFAULT_IMPORT_RE = /^\s*import\s+(\w+)\s+from\s+["']([^"']+)["']\s*;?\s*$/;
const SIDE_EFFECT_IMPORT_RE = /^\s*import\s+["']([^"']+)["']\s*;?\s*$/;
const REQUIRE_RE =
  /^\s*(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*["']([^"']+)["']\s*\)\s*;?\s*$/;

type ImportKind =
  | { readonly kind: "named"; readonly bindings: readonly string[] }
  | { readonly kind: "default"; readonly name: string }
  | { readonly kind: "namespace"; readonly name: string }
  | { readonly kind: "side-effect" }
  | { readonly kind: "require"; readonly name: string };

interface ParsedImport {
  readonly specifier: string;
  readonly info: ImportKind;
}

function parseNamedBindings(raw: string): readonly string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const asIdx = s.indexOf(" as ");
      return asIdx >= 0 ? s.slice(asIdx + 4).trim() : s;
    });
}

function parseImportLine(line: string): ParsedImport | null {
  const named = NAMED_IMPORT_RE.exec(line);
  const spec1 = named?.[1];
  const spec2 = named?.[2];
  if (named && spec1 !== undefined && spec2 !== undefined) {
    const bindings = parseNamedBindings(spec1);
    return bindings.length > 0
      ? { specifier: spec2, info: { kind: "named", bindings } }
      : null;
  }
  const ns = NAMESPACE_IMPORT_RE.exec(line);
  if (ns && ns[1] !== undefined && ns[2] !== undefined)
    return { specifier: ns[2], info: { kind: "namespace", name: ns[1] } };
  const def = DEFAULT_IMPORT_RE.exec(line);
  if (def && def[1] !== undefined && def[2] !== undefined)
    return { specifier: def[2], info: { kind: "default", name: def[1] } };
  const side = SIDE_EFFECT_IMPORT_RE.exec(line);
  if (side && side[1] !== undefined)
    return { specifier: side[1], info: { kind: "side-effect" } };
  const req = REQUIRE_RE.exec(line);
  if (req && req[1] !== undefined && req[2] !== undefined)
    return { specifier: req[2], info: { kind: "require", name: req[1] } };
  return null;
}

function mergeNamedInto(
  existing: readonly string[],
  added: readonly string[],
): readonly string[] {
  const seen = new Set(existing);
  const extra = added.filter((b) => !seen.has(b));
  return extra.length === 0 ? existing : [...existing, ...extra];
}

function resolveMergedInfo(
  parsed: ParsedImport,
  existing: ImportKind | undefined,
): ImportKind {
  if (parsed.info.kind === "named" && existing?.kind === "named")
    return {
      kind: "named",
      bindings: mergeNamedInto(existing.bindings, parsed.info.bindings),
    };
  if (existing !== undefined) return existing;
  return parsed.info;
}

function formatImport(specifier: string, info: ImportKind): string {
  switch (info.kind) {
    case "named":
      return `import { ${info.bindings.join(", ")} } from "${specifier}";`;
    case "namespace":
      return `import * as ${info.name} from "${specifier}";`;
    case "default":
      return `import ${info.name} from "${specifier}";`;
    case "side-effect":
      return `import "${specifier}";`;
    case "require":
      return `const ${info.name} = require("${specifier}");`;
  }
}

type Accumulator = {
  readonly out: readonly string[];
  readonly bySpecifier: Readonly<Record<string, ImportKind>>;
  readonly specifierOrder: readonly string[];
  readonly pendingImports: readonly ParsedImport[];
};

function flushPending(acc: Accumulator): {
  out: readonly string[];
  bySpecifier: Readonly<Record<string, ImportKind>>;
  specifierOrder: readonly string[];
} {
  const merged = acc.specifierOrder.reduce<Readonly<Record<string, ImportKind>>>(
    (map, spec) => {
      const info = acc.bySpecifier[spec];
      return info ? { ...map, [spec]: info } : map;
    },
    {},
  );
  const lines = acc.specifierOrder
    .map((spec) => {
      const info = merged[spec];
      return info ? formatImport(spec, info) : null;
    })
    .filter((x): x is string => x !== null);
  return {
    out: [...acc.out, ...lines],
    bySpecifier: {},
    specifierOrder: [],
  };
}

function processLine(acc: Accumulator, line: string): Accumulator {
  const parsed = parseImportLine(line);
  if (parsed === null) {
    const flushed = flushPending(acc);
    return {
      out: [...flushed.out, line],
      bySpecifier: flushed.bySpecifier,
      specifierOrder: flushed.specifierOrder,
      pendingImports: [],
    };
  }
  const spec = parsed.specifier;
  const existing = acc.bySpecifier[spec];
  const order =
    existing !== undefined ? acc.specifierOrder : [...acc.specifierOrder, spec];
  const nextInfo = resolveMergedInfo(parsed, existing);
  const bySpecifier = { ...acc.bySpecifier, [spec]: nextInfo };
  return {
    ...acc,
    bySpecifier,
    specifierOrder: order,
    pendingImports: [...acc.pendingImports, parsed],
  };
}

function deduplicateImports(content: string): string {
  const lines = content.split("\n");
  const initial: Accumulator = {
    out: [],
    bySpecifier: {},
    specifierOrder: [],
    pendingImports: [],
  };
  const after = lines.reduce(processLine, initial);
  const flushed = flushPending(after);
  return flushed.out.join("\n");
}

export class ImportDeduplicator implements ContentTransformer {
  readonly id = "import-deduplicator";
  readonly fileExtensions: readonly FileExtension[] = [];

  transform(content: string, _tier: InclusionTier, _filePath: RelativePath): string {
    if (content.length === 0) return content;
    return deduplicateImports(content);
  }
}
