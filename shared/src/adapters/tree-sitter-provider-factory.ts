// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { createRequire } from "node:module";
import { Parser, Language, type Node } from "web-tree-sitter";
import type { LanguageProvider } from "@jatbas/aic-shared/core/interfaces/language-provider.interface.js";
import type { FileExtension, RelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import type { ImportRef } from "@jatbas/aic-shared/core/types/import-ref.js";
import type { CodeChunk } from "@jatbas/aic-shared/core/types/code-chunk.js";
import type { ExportedSymbol } from "@jatbas/aic-shared/core/types/exported-symbol.js";
import { parseWithTreeSitter } from "./tree-sitter-node-utils.js";

export function resolveTreeSitterWasm(packageName: string): string {
  const resolve = createRequire(import.meta.url).resolve;
  return resolve(`${packageName}/${packageName}.wasm`);
}

export interface TreeSitterProviderConfig {
  readonly id: string;
  readonly extensions: readonly FileExtension[];
  readonly getWasmPath: () => string;
  readonly collectImports: (source: string, root: Node) => readonly ImportRef[];
  readonly collectSignatures: (
    source: string,
    root: Node,
    withDocs: boolean,
  ) => readonly CodeChunk[];
  readonly collectNames: (source: string, root: Node) => readonly ExportedSymbol[];
}

export interface TreeSitterProviderFactory {
  create(): Promise<LanguageProvider>;
}

export function defineTreeSitterProvider(
  config: TreeSitterProviderConfig,
): TreeSitterProviderFactory {
  return {
    async create(): Promise<LanguageProvider> {
      const language = await Language.load(config.getWasmPath());
      const parser = new Parser();
      parser.setLanguage(language);
      return {
        get id(): string {
          return config.id;
        },
        get extensions(): readonly FileExtension[] {
          return config.extensions;
        },
        parseImports(fileContent: string, _filePath: RelativePath): readonly ImportRef[] {
          return parseWithTreeSitter(parser, fileContent, config.collectImports, []);
        },
        extractSignaturesWithDocs(fileContent: string): readonly CodeChunk[] {
          return parseWithTreeSitter(
            parser,
            fileContent,
            (src, root) => config.collectSignatures(src, root, true),
            [],
          );
        },
        extractSignaturesOnly(fileContent: string): readonly CodeChunk[] {
          return parseWithTreeSitter(
            parser,
            fileContent,
            (src, root) => config.collectSignatures(src, root, false),
            [],
          );
        },
        extractNames(fileContent: string): readonly ExportedSymbol[] {
          return parseWithTreeSitter(parser, fileContent, config.collectNames, []);
        },
      };
    },
  };
}
