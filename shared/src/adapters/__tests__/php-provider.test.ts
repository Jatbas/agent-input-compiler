// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import type { LanguageProvider } from "@jatbas/aic-shared/core/interfaces/language-provider.interface.js";
import { toRelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-shared/core/types/enums.js";
import { PhpProvider } from "../php-provider.js";

describe("PhpProvider", () => {
  const provider: LanguageProvider = new PhpProvider();

  it("parseImports_returns_refs", () => {
    const content = [
      'require "vendor/autoload.php";',
      "use App\\Service\\Foo;",
      "use Some\\NS\\Bar as Alias;",
      "include_once './local.php';",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("index.php"));
    expect(refs.length).toBeGreaterThanOrEqual(1);
    const reqRef = refs.find((r) => r.source === "vendor/autoload.php");
    expect(reqRef).toBeDefined();
    expect(reqRef?.symbols).toEqual([]);
    expect(reqRef?.isRelative).toBe(false);
    const useRef = refs.find(
      (r) => r.source.includes("App") || r.source.includes("Service"),
    );
    expect(useRef).toBeDefined();
    const relRef = refs.find((r) => r.source.startsWith("./"));
    expect(relRef).toBeDefined();
    expect(relRef?.isRelative).toBe(true);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = ["class Baz {", "  public function qux() {}", "}"].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const classChunk = chunks.find((c) => c.symbolName === "Baz");
    expect(classChunk).toBeDefined();
    expect(classChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
    expect(classChunk?.content).toContain("Baz");
    const methodChunk = chunks.find((c) => c.symbolName === "qux");
    expect(methodChunk).toBeDefined();
    expect(methodChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "class MyClass {",
      "  function exported() {}",
      "  private function helper() {}",
      "}",
    ].join("\n");
    const symbols = provider.extractNames(content);
    expect(
      symbols.some((s) => s.name === "MyClass" && s.kind === SYMBOL_KIND.CLASS),
    ).toBe(true);
    expect(
      symbols.some((s) => s.name === "exported" && s.kind === SYMBOL_KIND.FUNCTION),
    ).toBe(true);
    expect(
      symbols.some((s) => s.name === "helper" && s.kind === SYMBOL_KIND.FUNCTION),
    ).toBe(true);
  });

  it("invalid_returns_empty", () => {
    const malformed = "function broken \n no brace";
    expect(provider.parseImports(malformed, toRelativePath("x.php"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.php"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.php"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
