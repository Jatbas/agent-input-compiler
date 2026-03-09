// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, beforeAll } from "vitest";
import { Parser } from "web-tree-sitter";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";
import { RustProvider } from "../rust-provider.js";

describe("RustProvider", () => {
  let provider: LanguageProvider;
  beforeAll(async () => {
    await Parser.init();
    provider = await RustProvider.create();
  });

  it("parseImports_returns_refs", () => {
    const content = [
      "use std::collections::HashMap;",
      "use crate::mymod::foo;",
      "use super::bar;",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("lib.rs"));
    expect(refs.length).toBeGreaterThanOrEqual(1);
    const stdRef = refs.find((r) => r.source.includes("std"));
    expect(stdRef).toBeDefined();
    expect(stdRef?.symbols).toEqual([]);
    expect(stdRef?.isRelative).toBe(false);
    const crateRef = refs.find((r) => r.source.startsWith("crate"));
    expect(crateRef).toBeDefined();
    expect(crateRef?.isRelative).toBe(true);
  });

  it("extractSignaturesWithDocs_returns_chunks", () => {
    const content = [
      "/// Foo does something.",
      "pub fn foo() {}",
      "pub struct Bar {}",
      "impl Bar {}",
    ].join("\n");
    const chunks = provider.extractSignaturesWithDocs(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const funcChunk = chunks.find((c) => c.symbolName === "foo");
    expect(funcChunk).toBeDefined();
    expect(funcChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
    const structChunk = chunks.find((c) => c.symbolName === "Bar");
    expect(structChunk).toBeDefined();
    expect(structChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = ["// Comment above", "pub fn baz() {}", "pub struct Qux {}"].join(
      "\n",
    );
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const funcChunk = chunks.find((c) => c.symbolName === "baz");
    expect(funcChunk).toBeDefined();
    expect(funcChunk?.content).toMatch(/fn baz\s*\(/);
    const typeChunk = chunks.find((c) => c.symbolName === "Qux");
    expect(typeChunk).toBeDefined();
    expect(typeChunk?.content).toContain("Qux");
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "pub fn exported() {}",
      "fn private_fn() {}",
      "pub struct MyStruct {}",
    ].join("\n");
    const symbols = provider.extractNames(content);
    expect(
      symbols.some((s) => s.name === "exported" && s.kind === SYMBOL_KIND.FUNCTION),
    ).toBe(true);
    expect(
      symbols.some((s) => s.name === "MyStruct" && s.kind === SYMBOL_KIND.CLASS),
    ).toBe(true);
    expect(symbols.some((s) => s.name === "private_fn")).toBe(false);
  });

  it("invalid_rust_returns_empty", () => {
    const malformed = "fn broken( \n no closing";
    expect(provider.parseImports(malformed, toRelativePath("x.rs"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.rs"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.rs"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
