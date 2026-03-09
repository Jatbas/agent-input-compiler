// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, beforeAll } from "vitest";
import { Parser } from "web-tree-sitter";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-core/core/types/enums.js";
import { PythonProvider } from "../python-provider.js";

describe("PythonProvider", () => {
  let provider: LanguageProvider;
  beforeAll(async () => {
    await Parser.init();
    provider = await PythonProvider.create();
  });

  it("parseImports_returns_refs", () => {
    const content = [
      "import os",
      "import foo.bar",
      "from y import z",
      "from . import local",
      "from a.b import c, d as e",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("src/main.py"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const importOs = refs.find((r) => r.source === "os");
    expect(importOs).toBeDefined();
    expect(importOs?.symbols).toEqual([]);
    expect(importOs?.isRelative).toBe(false);
    const fromRef = refs.find((r) => r.source === "y");
    expect(fromRef).toBeDefined();
    expect(fromRef?.symbols).toContain("z");
    const relativeRef = refs.find((r) => r.source === "." || r.source.startsWith("."));
    expect(relativeRef).toBeDefined();
    expect(relativeRef?.isRelative).toBe(true);
    const multiRef = refs.find((r) => r.source === "a.b");
    expect(multiRef).toBeDefined();
    expect(multiRef?.symbols).toContain("c");
  });

  it("extractSignaturesWithDocs_includes_docstring", () => {
    const content = [
      "def foo():",
      '    """Docstring for foo."""',
      "    pass",
      "",
      "class Bar:",
      '    """Docstring for Bar."""',
      "    pass",
    ].join("\n");
    const chunks = provider.extractSignaturesWithDocs(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const defChunk = chunks.find((c) => c.symbolName === "foo");
    expect(defChunk).toBeDefined();
    expect(defChunk?.content).toContain('"""Docstring for foo."""');
    expect(defChunk?.symbolType).toBe(SYMBOL_TYPE.FUNCTION);
    const classChunk = chunks.find((c) => c.symbolName === "Bar");
    expect(classChunk).toBeDefined();
    expect(classChunk?.content).toContain('"""Docstring for Bar."""');
    expect(classChunk?.symbolType).toBe(SYMBOL_TYPE.CLASS);
  });

  it("extractSignaturesOnly_no_docstring", () => {
    const content = [
      "def foo():",
      '    """Docstring."""',
      "    pass",
      "class Bar:",
      "    pass",
    ].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    const defChunk = chunks.find((c) => c.symbolName === "foo");
    expect(defChunk).toBeDefined();
    expect(defChunk?.content).not.toContain('"""Docstring."""');
    expect(defChunk?.content).toMatch(/def foo\s*\(/);
    const classChunk = chunks.find((c) => c.symbolName === "Bar");
    expect(classChunk).toBeDefined();
    expect(classChunk?.content).toMatch(/class Bar/);
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "def foo():",
      "    pass",
      "class Bar:",
      "    pass",
      "def baz():",
      "    pass",
    ].join("\n");
    const symbols = provider.extractNames(content);
    expect(symbols.length).toBeGreaterThanOrEqual(3);
    expect(symbols.some((s) => s.name === "foo" && s.kind === SYMBOL_KIND.FUNCTION)).toBe(
      true,
    );
    expect(symbols.some((s) => s.name === "Bar" && s.kind === SYMBOL_KIND.CLASS)).toBe(
      true,
    );
    expect(symbols.some((s) => s.name === "baz" && s.kind === SYMBOL_KIND.FUNCTION)).toBe(
      true,
    );
  });

  it("invalid_python_returns_empty", () => {
    const malformed = "def broken( \n  no closing";
    expect(provider.parseImports(malformed, toRelativePath("x.py"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs(malformed)).toEqual([]);
    expect(provider.extractSignaturesOnly(malformed)).toEqual([]);
    expect(provider.extractNames(malformed)).toEqual([]);
    const unparseable = "{{{";
    expect(provider.parseImports(unparseable, toRelativePath("x.py"))).toEqual([]);
    expect(provider.extractNames(unparseable)).toEqual([]);
  });
});
