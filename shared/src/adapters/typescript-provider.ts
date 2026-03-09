// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as ts from "typescript";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { ImportRef } from "@jatbas/aic-core/core/types/import-ref.js";
import type { CodeChunk } from "@jatbas/aic-core/core/types/code-chunk.js";
import type { ExportedSymbol } from "@jatbas/aic-core/core/types/exported-symbol.js";
import type { SymbolType } from "@jatbas/aic-core/core/types/enums.js";
import { toFileExtension, toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toLineNumber, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";

const EMPTY_PATH = toRelativePath("");

// Regex for ES import: import [default] [* as name | { a, b }] from 'source' or "source"
const ES_IMPORT_RE =
  /^\s*import\s+(?:(?:\*\s+as\s+(\w+))|(?:\{([^}]*)\})|(\w+))?\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
// Regex for side-effect import: import 'source'
const SIDE_IMPORT_RE = /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/gm;
// Regex for require: require('source') or require("source")
const REQUIRE_RE = /(?:^|\s)require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

function parseImports(
  fileContent: string,
  _filePath: RelativePath,
): readonly ImportRef[] {
  const all = [
    ...scanEsImports(fileContent),
    ...scanSideImports(fileContent),
    ...scanRequireImports(fileContent),
  ];
  return dedupeImports(all);
}

function isRelativeSource(source: string): boolean {
  return source.startsWith(".") || source.startsWith("/");
}

function buildEsSymbols(
  namespace: string | undefined,
  named: string | undefined,
  defaultName: string | undefined,
): readonly string[] {
  return [
    ...(namespace !== undefined && namespace !== "" ? [namespace] : []),
    ...(named !== undefined && named !== ""
      ? named.split(",").map((s) => {
          const t = s.trim().split(/\s+as\s+/);
          return (t[1] ?? t[0] ?? "").trim();
        })
      : []),
    ...(defaultName !== undefined && defaultName !== "" ? [defaultName] : []),
  ];
}

function scanEsImports(fileContent: string): readonly ImportRef[] {
  return [...fileContent.matchAll(ES_IMPORT_RE)].flatMap((m) => {
    const source = m[4];
    if (source === undefined) return [];
    return [
      {
        source,
        symbols: buildEsSymbols(m[1], m[2], m[3]),
        isRelative: isRelativeSource(source),
      },
    ];
  });
}

function scanSideImports(fileContent: string): readonly ImportRef[] {
  const esTestRe = new RegExp(ES_IMPORT_RE.source);
  return [...fileContent.matchAll(SIDE_IMPORT_RE)].flatMap((m) => {
    const source = m[1];
    if (source === undefined || esTestRe.test(m[0])) return [];
    return [
      { source, symbols: [] as readonly string[], isRelative: isRelativeSource(source) },
    ];
  });
}

function scanRequireImports(fileContent: string): readonly ImportRef[] {
  return [...fileContent.matchAll(REQUIRE_RE)].flatMap((m) => {
    const source = m[1];
    if (source === undefined) return [];
    return [
      { source, symbols: [] as readonly string[], isRelative: isRelativeSource(source) },
    ];
  });
}

function dedupeImports(imports: readonly ImportRef[]): readonly ImportRef[] {
  const seen = new Set<string>();
  return imports.filter((imp) => {
    const key = `${imp.source}\0${imp.symbols.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class TypeScriptProvider implements LanguageProvider {
  readonly id = "typescript";
  readonly extensions: readonly FileExtension[];

  constructor() {
    this.extensions = [
      toFileExtension(".ts"),
      toFileExtension(".tsx"),
      toFileExtension(".js"),
      toFileExtension(".jsx"),
    ];
  }

  parseImports(fileContent: string, filePath: RelativePath): readonly ImportRef[] {
    return parseImports(fileContent, filePath);
  }

  extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[] {
    return extractSignatures(fileContent, true);
  }

  extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
    return extractSignatures(fileContent, false);
  }

  extractNames(fileContent: string): readonly ExportedSymbol[] {
    return extractNamesImpl(fileContent);
  }
}

function getLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1;
}

function getEndLine(node: ts.Node, sourceFile: ts.SourceFile): number {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return line + 1;
}

function mapSyntaxKindToSymbolKind(
  kind: ts.SyntaxKind,
): (typeof SYMBOL_KIND)[keyof typeof SYMBOL_KIND] {
  if (kind === ts.SyntaxKind.ClassDeclaration) return SYMBOL_KIND.CLASS;
  if (
    kind === ts.SyntaxKind.FunctionDeclaration ||
    kind === ts.SyntaxKind.FunctionExpression
  )
    return SYMBOL_KIND.FUNCTION;
  if (kind === ts.SyntaxKind.InterfaceDeclaration) return SYMBOL_KIND.INTERFACE;
  if (kind === ts.SyntaxKind.TypeAliasDeclaration) return SYMBOL_KIND.TYPE;
  if (kind === ts.SyntaxKind.VariableStatement) return SYMBOL_KIND.CONST;
  return SYMBOL_KIND.FUNCTION;
}

function getJSDoc(node: ts.Node, sourceFile: ts.SourceFile): string {
  const full = sourceFile.getFullText();
  const start = node.getStart(sourceFile);
  const leading = full.slice(0, start);
  const match = leading.match(/\/\*\*[\s\S]*?\*\/\s*$/);
  return match ? match[0].trim() : "";
}

type SigHandler = {
  readonly matches: (node: ts.Node) => boolean;
  readonly symbolType: SymbolType;
  readonly getName: (node: ts.Node, sf: ts.SourceFile) => string | null;
  readonly stripBody: boolean;
};

const SIGNATURE_HANDLERS: readonly SigHandler[] = [
  {
    matches: ts.isFunctionDeclaration,
    symbolType: SYMBOL_TYPE.FUNCTION,
    getName: (node, sf) => (node as ts.FunctionDeclaration).name?.getText(sf) ?? null,
    stripBody: true,
  },
  {
    matches: ts.isClassDeclaration,
    symbolType: SYMBOL_TYPE.CLASS,
    getName: (node, sf) => (node as ts.ClassDeclaration).name?.getText(sf) ?? null,
    stripBody: true,
  },
  {
    matches: ts.isInterfaceDeclaration,
    symbolType: SYMBOL_TYPE.INTERFACE,
    getName: (node, sf) => (node as ts.InterfaceDeclaration).name.getText(sf),
    stripBody: false,
  },
  {
    matches: (node) => ts.isMethodDeclaration(node) && ts.isClassDeclaration(node.parent),
    symbolType: SYMBOL_TYPE.METHOD,
    getName: (node, sf) => (node as ts.MethodDeclaration).name.getText(sf),
    stripBody: true,
  },
];

function collectFromNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  withDocs: boolean,
): readonly CodeChunk[] {
  const handler = SIGNATURE_HANDLERS.find((h) => h.matches(node));
  const current: readonly CodeChunk[] =
    handler !== undefined ? buildChunk(handler, node, sourceFile, withDocs) : [];
  const children: readonly CodeChunk[] = collectChildren(node, sourceFile, withDocs);
  return [...current, ...children];
}

function buildChunk(
  handler: (typeof SIGNATURE_HANDLERS)[number],
  node: ts.Node,
  sourceFile: ts.SourceFile,
  withDocs: boolean,
): readonly CodeChunk[] {
  const name = handler.getName(node, sourceFile);
  if (name === null || name === "") return [];
  const doc = withDocs ? getJSDoc(node, sourceFile) : "";
  const raw = node.getText(sourceFile);
  const sig = handler.stripBody ? raw.replace(/\s*\{[\s\S]*$/, " { }") : raw;
  const content = doc !== "" ? `${doc}\n${sig}` : sig;
  return [
    {
      filePath: EMPTY_PATH,
      symbolName: name,
      symbolType: handler.symbolType,
      startLine: toLineNumber(getLine(node, sourceFile)),
      endLine: toLineNumber(getEndLine(node, sourceFile)),
      content,
      tokenCount: toTokenCount(0),
    },
  ];
}

function collectChildren(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  withDocs: boolean,
): readonly CodeChunk[] {
  return node
    .getChildren(sourceFile)
    .flatMap((child) => collectFromNode(child, sourceFile, withDocs));
}

function extractSignatures(fileContent: string, withDocs: boolean): readonly CodeChunk[] {
  const sourceFile = ts.createSourceFile(
    "file.ts",
    fileContent,
    ts.ScriptTarget.Latest,
    true,
  );
  return collectFromNode(sourceFile, sourceFile, withDocs);
}

function hasExport(node: ts.Node): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

type NameHandler = {
  readonly matches: (node: ts.Node) => boolean;
  readonly extract: (node: ts.Node, sf: ts.SourceFile) => readonly ExportedSymbol[];
};

const NAME_HANDLERS: readonly NameHandler[] = [
  {
    matches: (node) =>
      ts.isFunctionDeclaration(node) && node.name !== undefined && hasExport(node),
    extract: (node, sf) => {
      const fd = node as ts.FunctionDeclaration;
      const n = fd.name;
      if (n === undefined) return [];
      return [{ name: n.getText(sf), kind: mapSyntaxKindToSymbolKind(node.kind) }];
    },
  },
  {
    matches: (node) =>
      ts.isClassDeclaration(node) && node.name !== undefined && hasExport(node),
    extract: (node, sf) => {
      const cd = node as ts.ClassDeclaration;
      const n = cd.name;
      if (n === undefined) return [];
      return [{ name: n.getText(sf), kind: mapSyntaxKindToSymbolKind(node.kind) }];
    },
  },
  {
    matches: (node) => ts.isInterfaceDeclaration(node) && hasExport(node),
    extract: (node, sf) => [
      {
        name: (node as ts.InterfaceDeclaration).name.getText(sf),
        kind: mapSyntaxKindToSymbolKind(node.kind),
      },
    ],
  },
  {
    matches: (node) => ts.isTypeAliasDeclaration(node) && hasExport(node),
    extract: (node, sf) => [
      {
        name: (node as ts.TypeAliasDeclaration).name.getText(sf),
        kind: SYMBOL_KIND.TYPE,
      },
    ],
  },
  {
    matches: (node) => ts.isVariableStatement(node) && hasExport(node),
    extract: (node, sf) =>
      (node as ts.VariableStatement).declarationList.declarations
        .filter((d): d is ts.VariableDeclaration & { readonly name: ts.Identifier } =>
          ts.isIdentifier(d.name),
        )
        .map((d) => ({ name: d.name.getText(sf), kind: SYMBOL_KIND.CONST })),
  },
];

function collectNamesFromNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): readonly ExportedSymbol[] {
  const handler = NAME_HANDLERS.find((h) => h.matches(node));
  const current: readonly ExportedSymbol[] =
    handler !== undefined ? handler.extract(node, sourceFile) : [];
  const children = node
    .getChildren(sourceFile)
    .flatMap((child) => collectNamesFromNode(child, sourceFile));
  return [...current, ...children];
}

function extractNamesImpl(fileContent: string): readonly ExportedSymbol[] {
  const sourceFile = ts.createSourceFile(
    "file.ts",
    fileContent,
    ts.ScriptTarget.Latest,
    true,
  );
  return collectNamesFromNode(sourceFile, sourceFile);
}
