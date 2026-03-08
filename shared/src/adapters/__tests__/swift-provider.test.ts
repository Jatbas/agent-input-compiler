// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import { toRelativePath } from "#core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";
import { SwiftProvider } from "../swift-provider.js";

describe("SwiftProvider", () => {
  const provider: LanguageProvider = new SwiftProvider();

  it("parseImports_returns_refs", () => {
    const content = [
      "import Foundation",
      "import struct MyModule.MyClass",
      "import class Some.Other",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("file.swift"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const foundationRef = refs.find((r) => r.source === "Foundation");
    expect(foundationRef).toBeDefined();
    expect(foundationRef?.symbols).toEqual([]);
    expect(foundationRef?.isRelative).toBe(false);
    const structRef = refs.find((r) => r.source.includes("MyClass"));
    expect(structRef).toBeDefined();
    expect(structRef?.isRelative).toBe(false);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = [
      "func greet() { }",
      "class Foo { }",
      "struct Bar { }",
      "enum Baz { }",
    ].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const funcChunk = chunks.find((c) => c.symbolName === "greet");
    expect(funcChunk).toBeDefined();
    expect(funcChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
    const classChunk = chunks.find((c) => c.symbolName === "Foo");
    expect(classChunk).toBeDefined();
    expect(classChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
    const structChunk = chunks.find((c) => c.symbolName === "Bar");
    expect(structChunk).toBeDefined();
    expect(structChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
    const enumChunk = chunks.find((c) => c.symbolName === "Baz");
    expect(enumChunk).toBeDefined();
    expect(enumChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "func doSomething() { }",
      "class MyClass { }",
      "struct MyStruct { }",
      "enum MyEnum { }",
    ].join("\n");
    const names = provider.extractNames(content);
    expect(names.length).toBeGreaterThanOrEqual(2);
    const fnSymbol = names.find((s) => s.name === "doSomething");
    expect(fnSymbol).toBeDefined();
    expect(fnSymbol?.kind).toBe(SYMBOL_KIND.FUNCTION);
    const classSymbol = names.find((s) => s.name === "MyClass");
    expect(classSymbol).toBeDefined();
    expect(classSymbol?.kind).toBe(SYMBOL_KIND.CLASS);
  });

  it("invalid_returns_empty", () => {
    const malformed = "nothing to parse here";
    expect(provider.parseImports(malformed, toRelativePath("x.swift"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.swift"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.swift"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
