// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { TypeScriptProvider } from "../typescript-provider.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";

describe("TypeScriptProvider", () => {
  const provider = new TypeScriptProvider();

  it("extensions: id and extensions match .ts, .tsx, .js, .jsx", () => {
    expect(provider.id).toBe("typescript");
    expect(provider.extensions).toHaveLength(4);
    expect(provider.extensions.map((e) => String(e))).toEqual([
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
    ]);
  });

  it("parseImports: returns ImportRef[] for import/require lines", () => {
    const content = [
      'import { foo } from "./bar";',
      'import baz from "pkg";',
      'const x = require("other");',
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("test.ts"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const sources = refs.map((r) => r.source);
    expect(sources).toContain("./bar");
    expect(sources).toContain("pkg");
    expect(refs.some((r) => r.source === "./bar" && r.isRelative)).toBe(true);
    expect(refs.some((r) => r.source === "pkg" && !r.isRelative)).toBe(true);
  });

  it("extractSignaturesWithDocs: returns CodeChunk[] with content including docs", () => {
    const content = [
      "/** JSDoc for fn */",
      "function hello(a: string): void { return; }",
    ].join("\n");
    const chunks = provider.extractSignaturesWithDocs(content);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const fn = chunks.find((c) => c.symbolName === "hello");
    expect(fn).toBeDefined();
    expect(fn?.content).toContain("JSDoc");
    expect(fn?.content).toContain("function hello");
    expect(fn?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
  });

  it("extractSignaturesOnly: returns chunks without JSDoc in content", () => {
    const content = [
      "/** JSDoc for fn */",
      "function hello(a: string): void { return; }",
    ].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const fn = chunks.find((c) => c.symbolName === "hello");
    expect(fn).toBeDefined();
    expect(fn?.content).not.toContain("JSDoc");
    expect(fn?.content).toContain("function hello");
  });

  it("extractNames: returns ExportedSymbol[] with name and kind", () => {
    const content = [
      "export function foo() {}",
      "export class Bar {}",
      "export interface Baz {}",
    ].join("\n");
    const symbols = provider.extractNames(content);
    expect(symbols.length).toBeGreaterThanOrEqual(3);
    expect(symbols.some((s) => s.name === "foo" && s.kind === SYMBOL_KIND.FUNCTION)).toBe(
      true,
    );
    expect(symbols.some((s) => s.name === "Bar" && s.kind === SYMBOL_KIND.CLASS)).toBe(
      true,
    );
    expect(
      symbols.some((s) => s.name === "Baz" && s.kind === SYMBOL_KIND.INTERFACE),
    ).toBe(true);
  });

  it("extractNames empty: returns empty array for file with no exports", () => {
    const content = "function foo() {} const x = 1;";
    const symbols = provider.extractNames(content);
    expect(symbols).toEqual([]);
  });
});
