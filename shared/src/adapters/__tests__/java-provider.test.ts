// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, beforeAll } from "vitest";
import { Parser } from "web-tree-sitter";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import { toRelativePath } from "#core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";
import { JavaProvider } from "../java-provider.js";

describe("JavaProvider", () => {
  let provider: LanguageProvider;
  beforeAll(async () => {
    await Parser.init();
    provider = await JavaProvider.create();
  });

  it("parseImports_returns_refs", () => {
    const content = [
      "import java.util.List;",
      "import pkg.Class;",
      "import static pkg.Util.member;",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("Main.java"));
    expect(refs.length).toBeGreaterThanOrEqual(1);
    const listRef = refs.find((r) => r.source.includes("java.util"));
    expect(listRef).toBeDefined();
    expect(listRef?.symbols).toEqual([]);
    expect(listRef?.isRelative).toBe(false);
    const pkgRef = refs.find((r) => r.source.startsWith("pkg"));
    expect(pkgRef).toBeDefined();
  });

  it("extractSignaturesWithDocs_returns_chunks", () => {
    const content = [
      "/** Foo does something. */",
      "public class Foo {",
      "  /** Bar method. */",
      "  public void bar() {}",
      "}",
    ].join("\n");
    const chunks = provider.extractSignaturesWithDocs(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const classChunk = chunks.find((c) => c.symbolName === "Foo");
    expect(classChunk).toBeDefined();
    expect(classChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
    const methodChunk = chunks.find((c) => c.symbolName === "bar");
    expect(methodChunk).toBeDefined();
    expect(methodChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = [
      "// Comment above",
      "public class Baz {",
      "  public void qux() {}",
      "}",
    ].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const classChunk = chunks.find((c) => c.symbolName === "Baz");
    expect(classChunk).toBeDefined();
    expect(classChunk?.content).toContain("Baz");
    const methodChunk = chunks.find((c) => c.symbolName === "qux");
    expect(methodChunk).toBeDefined();
    expect(methodChunk?.content).toMatch(/qux\s*\(/);
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "public class MyClass {",
      "  public void exported() {}",
      "  private void privateMethod() {}",
      "}",
    ].join("\n");
    const symbols = provider.extractNames(content);
    expect(
      symbols.some((s) => s.name === "exported" && s.kind === SYMBOL_KIND.FUNCTION),
    ).toBe(true);
    expect(
      symbols.some((s) => s.name === "MyClass" && s.kind === SYMBOL_KIND.CLASS),
    ).toBe(true);
    expect(symbols.some((s) => s.name === "privateMethod")).toBe(false);
  });

  it("invalid_java_returns_empty", () => {
    const malformed = "class broken { \n no closing";
    expect(provider.parseImports(malformed, toRelativePath("x.java"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.java"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.java"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
