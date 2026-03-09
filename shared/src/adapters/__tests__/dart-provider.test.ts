// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";
import { DartProvider } from "../dart-provider.js";

describe("DartProvider", () => {
  const provider: LanguageProvider = new DartProvider();

  it("parseImports_returns_refs", () => {
    const content = [
      "import 'x.dart';",
      'import "package:foo/bar.dart";',
      "import './lib/util.dart';",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("file.dart"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const xRef = refs.find((r) => r.source === "x.dart");
    expect(xRef).toBeDefined();
    expect(xRef?.symbols).toEqual([]);
    const pkgRef = refs.find((r) => r.source.includes("package:"));
    expect(pkgRef).toBeDefined();
    expect(pkgRef?.isRelative).toBe(true);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = [
      "void main() { }",
      "class Foo { }",
      "typedef Bar = int;",
      "String greet() { }",
    ].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const voidChunk = chunks.find((c) => c.symbolName === "main");
    expect(voidChunk).toBeDefined();
    expect(voidChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
    const classChunk = chunks.find((c) => c.symbolName === "Foo");
    expect(classChunk).toBeDefined();
    expect(classChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
    const typedefChunk = chunks.find((c) => c.symbolName === "Bar");
    expect(typedefChunk).toBeDefined();
    expect(typedefChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
    const funcChunk = chunks.find((c) => c.symbolName === "greet");
    expect(funcChunk).toBeDefined();
    expect(funcChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "void doSomething() { }",
      "class MyClass { }",
      "typedef MyTypedef = void Function();",
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
    expect(provider.parseImports(malformed, toRelativePath("x.dart"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.dart"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.dart"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
