// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import type { LanguageProvider } from "@jatbas/aic-shared/core/interfaces/language-provider.interface.js";
import { toRelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-shared/core/types/enums.js";
import { KotlinProvider } from "../kotlin-provider.js";

describe("KotlinProvider", () => {
  const provider: LanguageProvider = new KotlinProvider();

  it("parseImports_returns_refs", () => {
    const content = ["import pkg.Class", "import pkg.sub.Bar", "import pkg.Util.*"].join(
      "\n",
    );
    const refs = provider.parseImports(content, toRelativePath("file.kt"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const classRef = refs.find((r) => r.source === "pkg.Class");
    expect(classRef).toBeDefined();
    expect(classRef?.symbols).toEqual([]);
    expect(classRef?.isRelative).toBe(false);
    const starRef = refs.find((r) => r.source.includes("*"));
    expect(starRef).toBeDefined();
    expect(starRef?.isRelative).toBe(false);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = ["fun greet() { }", "class Foo { }", "object Bar { }"].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const funChunk = chunks.find((c) => c.symbolName === "greet");
    expect(funChunk).toBeDefined();
    expect(funChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
    const classChunk = chunks.find((c) => c.symbolName === "Foo");
    expect(classChunk).toBeDefined();
    expect(classChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
    const objectChunk = chunks.find((c) => c.symbolName === "Bar");
    expect(objectChunk).toBeDefined();
    expect(objectChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "fun doSomething() { }",
      "class MyClass { }",
      "object MyObject { }",
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
    expect(provider.parseImports(malformed, toRelativePath("x.kt"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.kt"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.kt"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
