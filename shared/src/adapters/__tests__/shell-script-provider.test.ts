// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import { toRelativePath } from "#core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "#core/types/enums.js";
import { ShellScriptProvider } from "../shell-script-provider.js";

describe("ShellScriptProvider", () => {
  const provider: LanguageProvider = new ShellScriptProvider();

  it("parseImports_returns_refs", () => {
    const content = ['source "lib.sh"', "source ./local.sh", ". ./utils.bash"].join("\n");
    const refs = provider.parseImports(content, toRelativePath("script.sh"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const sourceRef = refs.find((r) => r.source === "lib.sh");
    expect(sourceRef).toBeDefined();
    expect(sourceRef?.symbols).toEqual([]);
    expect(sourceRef?.isRelative).toBe(false);
    const relRef = refs.find((r) => r.source.startsWith("./"));
    expect(relRef).toBeDefined();
    expect(relRef?.isRelative).toBe(true);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = [
      "function foo() {",
      "  echo 1",
      "}",
      "bar() {",
      "  echo 2",
      "}",
    ].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const fooChunk = chunks.find((c) => c.symbolName === "foo");
    expect(fooChunk).toBeDefined();
    expect(fooChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
    expect(fooChunk?.content).toContain("foo");
    const barChunk = chunks.find((c) => c.symbolName === "bar");
    expect(barChunk).toBeDefined();
    expect(barChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "function my_func() {",
      "  true",
      "}",
      "other_func() {",
      "  false",
      "}",
    ].join("\n");
    const names = provider.extractNames(content);
    expect(names.length).toBeGreaterThanOrEqual(2);
    const myFunc = names.find((s) => s.name === "my_func");
    expect(myFunc).toBeDefined();
    expect(myFunc?.kind).toBe(SYMBOL_KIND.FUNCTION);
    const otherFunc = names.find((s) => s.name === "other_func");
    expect(otherFunc).toBeDefined();
    expect(otherFunc?.kind).toBe(SYMBOL_KIND.FUNCTION);
  });

  it("invalid_returns_empty", () => {
    const malformed = "nothing to parse here";
    expect(provider.parseImports(malformed, toRelativePath("x.sh"))).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.sh"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(unparseable)).toEqual([]);
    expect(provider.extractSignaturesOnly(unparseable)).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
    expect(() => {
      provider.parseImports(malformed, toRelativePath("x.sh"));
      provider.extractSignaturesWithDocs(malformed);
      provider.extractSignaturesOnly(malformed);
      provider.extractNames(malformed);
    }).not.toThrow();
  });
});
