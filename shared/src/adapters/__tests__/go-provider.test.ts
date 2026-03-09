// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, beforeAll } from "vitest";
import { Parser } from "web-tree-sitter";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";
import { GoProvider } from "../go-provider.js";

describe("GoProvider", () => {
  let provider: LanguageProvider;
  beforeAll(async () => {
    await Parser.init();
    provider = await GoProvider.create();
  });

  it("parseImports_returns_refs", () => {
    const content = ['import "pkg"', 'import ("fmt" "strings")', 'import . "dot"'].join(
      "\n",
    );
    const refs = provider.parseImports(content, toRelativePath("main.go"));
    expect(refs.length).toBeGreaterThanOrEqual(1);
    const pkgRef = refs.find((r) => r.source === "pkg");
    expect(pkgRef).toBeDefined();
    expect(pkgRef?.symbols).toEqual([]);
    expect(pkgRef?.isRelative).toBe(false);
    const fmtRef = refs.find((r) => r.source === "fmt");
    expect(fmtRef).toBeDefined();
    const stringsRef = refs.find((r) => r.source === "strings");
    expect(stringsRef).toBeDefined();
  });

  it("extractSignaturesWithDocs_returns_chunks", () => {
    const content = [
      "// Foo does something.",
      "func Foo() {}",
      "type Bar struct {}",
    ].join("\n");
    const chunks = provider.extractSignaturesWithDocs(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const funcChunk = chunks.find((c) => c.symbolName === "Foo");
    expect(funcChunk).toBeDefined();
    expect(funcChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
    const typeChunk = chunks.find((c) => c.symbolName === "Bar");
    expect(typeChunk).toBeDefined();
    expect(typeChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = ["// Comment above", "func Baz() {}", "type Qux struct {}"].join(
      "\n",
    );
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const funcChunk = chunks.find((c) => c.symbolName === "Baz");
    expect(funcChunk).toBeDefined();
    expect(funcChunk?.content).toMatch(/func Baz\s*\(/);
    const typeChunk = chunks.find((c) => c.symbolName === "Qux");
    expect(typeChunk).toBeDefined();
    expect(typeChunk?.content).toContain("Qux");
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "func Exported() {}",
      "func unexported() {}",
      "type MyStruct struct {}",
    ].join("\n");
    const symbols = provider.extractNames(content);
    expect(
      symbols.some((s) => s.name === "Exported" && s.kind === SYMBOL_KIND.FUNCTION),
    ).toBe(true);
    expect(
      symbols.some((s) => s.name === "MyStruct" && s.kind === SYMBOL_KIND.CLASS),
    ).toBe(true);
    expect(symbols.some((s) => s.name === "unexported")).toBe(false);
  });

  it("invalid_go_returns_empty", () => {
    const malformed = "func broken( \n no closing";
    expect(provider.parseImports(malformed, toRelativePath("x.go"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.go"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.go"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
