// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";
import { RubyProvider } from "../ruby-provider.js";

describe("RubyProvider", () => {
  const provider: LanguageProvider = new RubyProvider();

  it("parseImports_returns_refs", () => {
    const content = ['require "x"', 'load "lib/foo"', "require '.rb'"].join("\n");
    const refs = provider.parseImports(content, toRelativePath("main.rb"));
    expect(refs.length).toBeGreaterThanOrEqual(1);
    const xRef = refs.find((r) => r.source === "x");
    expect(xRef).toBeDefined();
    expect(xRef?.symbols).toEqual([]);
    expect(xRef?.isRelative).toBe(false);
    const relRef = refs.find((r) => r.source === ".rb");
    expect(relRef).toBeDefined();
    expect(relRef?.isRelative).toBe(true);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = ["class Baz", "  def qux", "  end", "end"].join("\n");
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
      "class MyClass",
      "  module Nested",
      "  end",
      "  def self.factory",
      "  end",
      "end",
    ].join("\n");
    const symbols = provider.extractNames(content);
    expect(
      symbols.some((s) => s.name === "MyClass" && s.kind === SYMBOL_KIND.CLASS),
    ).toBe(true);
    expect(symbols.some((s) => s.name === "Nested" && s.kind === SYMBOL_KIND.CLASS)).toBe(
      true,
    );
    expect(
      symbols.some((s) => s.name === "factory" && s.kind === SYMBOL_KIND.FUNCTION),
    ).toBe(true);
  });

  it("invalid_returns_empty", () => {
    const malformed = "def broken \n no end";
    expect(provider.parseImports(malformed, toRelativePath("x.rb"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.rb"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.rb"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
