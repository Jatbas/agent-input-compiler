// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";
import { CssProvider } from "../css-provider.js";

describe("CssProvider", () => {
  const provider: LanguageProvider = new CssProvider();

  it("parseImports_returns_refs", () => {
    const content = [
      '@import url("theme.css");',
      '@import "layout.css";',
      "@import './local.css';",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("index.css"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const urlRef = refs.find((r) => r.source === "theme.css");
    expect(urlRef).toBeDefined();
    expect(urlRef?.symbols).toEqual([]);
    expect(urlRef?.isRelative).toBe(false);
    const quoteRef = refs.find((r) => r.source === "layout.css");
    expect(quoteRef).toBeDefined();
    const relRef = refs.find((r) => r.source.startsWith("./"));
    expect(relRef).toBeDefined();
    expect(relRef?.isRelative).toBe(true);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = [
      ".header {",
      "  color: red;",
      "}",
      "#main {",
      "  padding: 0;",
      "}",
    ].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const classChunk = chunks.find((c) => c.symbolName === ".header");
    expect(classChunk).toBeDefined();
    expect(classChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
    expect(classChunk?.content).toContain(".header");
    const idChunk = chunks.find((c) => c.symbolName === "#main");
    expect(idChunk).toBeDefined();
    expect(idChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
  });

  it("extractNames_returns_empty", () => {
    const content = [".foo { color: red; }", "#bar { margin: 0; }"].join("\n");
    expect(provider.extractNames(content)).toEqual([]);
  });

  it("invalid_returns_empty", () => {
    const malformed = "not an import";
    expect(provider.parseImports(malformed, toRelativePath("x.css"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.css"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.css"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
