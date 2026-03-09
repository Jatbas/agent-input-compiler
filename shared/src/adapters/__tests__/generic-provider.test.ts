// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { GenericProvider } from "../generic-provider.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";

describe("GenericProvider", () => {
  const provider = new GenericProvider();

  it("parseImports always empty", () => {
    const refs = provider.parseImports("import x from 'y';", toRelativePath("a.ts"));
    expect(refs).toEqual([]);
    expect(provider.parseImports("", toRelativePath(""))).toEqual([]);
  });

  it("extractSignaturesWithDocs always empty", () => {
    expect(provider.extractSignaturesWithDocs("function foo() {}")).toEqual([]);
    expect(provider.extractSignaturesWithDocs("")).toEqual([]);
  });

  it("extractSignaturesOnly regex", () => {
    const content = [
      "function foo() {}",
      "class Bar {}",
      "def baz():",
      "pub fn quux() {}",
      "fn rust_fn() {}",
    ].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    expect(
      chunks.some((c) => c.symbolName === "foo" && c.symbolType === SYMBOL_TYPE.FUNCTION),
    ).toBe(true);
    expect(
      chunks.some((c) => c.symbolName === "Bar" && c.symbolType === SYMBOL_TYPE.CLASS),
    ).toBe(true);
    expect(chunks.some((c) => c.symbolName === "baz")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "quux")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "rust_fn")).toBe(true);
    const first = chunks[0];
    expect(first).toBeDefined();
    expect(first?.filePath).toBeDefined();
    expect(first?.startLine).toBeDefined();
    expect(first?.endLine).toBeDefined();
    expect(first?.content).toBeDefined();
    expect(first?.tokenCount).toBeDefined();
  });

  it("extractNames best-effort", () => {
    const content = [
      "export const ONE = 1;",
      "export function fn() {}",
      "export class Cls {}",
      "export { a, b as c };",
    ].join("\n");
    const symbols = provider.extractNames(content);
    expect(symbols.length).toBeGreaterThanOrEqual(4);
    expect(symbols.some((s) => s.name === "ONE" && s.kind === SYMBOL_KIND.CONST)).toBe(
      true,
    );
    expect(symbols.some((s) => s.name === "fn" && s.kind === SYMBOL_KIND.FUNCTION)).toBe(
      true,
    );
    expect(symbols.some((s) => s.name === "Cls" && s.kind === SYMBOL_KIND.CLASS)).toBe(
      true,
    );
    expect(symbols.some((s) => s.name === "a")).toBe(true);
    expect(symbols.some((s) => s.name === "b")).toBe(true);
  });

  it("never throws", () => {
    expect(() => provider.parseImports("", toRelativePath(""))).not.toThrow();
    expect(() => provider.extractSignaturesWithDocs("")).not.toThrow();
    expect(() => provider.extractSignaturesOnly("")).not.toThrow();
    expect(() => provider.extractNames("")).not.toThrow();
    expect(provider.extractSignaturesOnly("")).toEqual([]);
    expect(provider.extractNames("not export at all")).toEqual([]);
  });

  it("extensions empty", () => {
    expect(provider.extensions.length).toBe(0);
    expect(provider.id).toBe("generic");
  });
});
