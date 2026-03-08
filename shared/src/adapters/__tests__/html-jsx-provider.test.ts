// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import { toRelativePath } from "#core/types/paths.js";
import { SYMBOL_TYPE } from "#core/types/enums.js";
import { HtmlJsxProvider } from "../html-jsx-provider.js";

describe("HtmlJsxProvider", () => {
  const provider: LanguageProvider = new HtmlJsxProvider();

  it("parseImports_returns_refs", () => {
    const content = [
      '<script src="x.js"></script>',
      '<link rel="stylesheet" href="styles.css">',
      '<script src="./local.js"></script>',
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("index.html"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const scriptRef = refs.find((r) => r.source === "x.js");
    expect(scriptRef).toBeDefined();
    expect(scriptRef?.symbols).toEqual([]);
    expect(scriptRef?.isRelative).toBe(false);
    const linkRef = refs.find((r) => r.source === "styles.css");
    expect(linkRef).toBeDefined();
    const relRef = refs.find((r) => r.source.startsWith("./"));
    expect(relRef).toBeDefined();
    expect(relRef?.isRelative).toBe(true);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = ['<div class="foo">', "  <span>", "</span></div>"].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const divChunk = chunks.find((c) => c.symbolName === "div");
    expect(divChunk).toBeDefined();
    expect(divChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
    expect(divChunk?.content).toContain("div");
    const spanChunk = chunks.find((c) => c.symbolName === "span");
    expect(spanChunk).toBeDefined();
    expect(spanChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
  });

  it("extractNames_returns_empty", () => {
    const content = "<html><body><p>text</p></body></html>";
    expect(provider.extractNames(content)).toEqual([]);
  });

  it("invalid_returns_empty", () => {
    const malformed = "not a tag";
    expect(provider.parseImports(malformed, toRelativePath("x.html"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.html"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.html"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
