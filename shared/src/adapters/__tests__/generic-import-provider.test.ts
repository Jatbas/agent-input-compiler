// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { GenericImportProvider } from "../generic-import-provider.js";
import { toRelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import { SYMBOL_KIND, SYMBOL_TYPE } from "@jatbas/aic-shared/core/types/enums.js";

describe("GenericImportProvider", () => {
  const provider = new GenericImportProvider();

  it("parseImports_python", () => {
    const content = [
      "import os",
      "import foo.bar",
      "from y import z",
      "from a.b import c, d as e",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("src/main.py"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    const importRef = refs.find((r) => r.source === "os");
    expect(importRef).toBeDefined();
    expect(importRef?.symbols).toEqual([]);
    expect(importRef?.isRelative).toBe(false);
    const fromRef = refs.find((r) => r.source === "y");
    expect(fromRef).toBeDefined();
    expect(fromRef?.symbols).toContain("z");
    const multiRef = refs.find((r) => r.source === "a.b");
    expect(multiRef).toBeDefined();
    expect(multiRef?.symbols).toContain("c");
    expect(multiRef?.symbols.some((s) => s === "d" || s === "e")).toBe(true);
  });

  it("parseImports_go", () => {
    const content = [
      'import "fmt"',
      'import "pkg/sub"',
      "import (",
      '  "a"',
      '  "b"',
      ")",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("main.go"));
    expect(refs.length).toBeGreaterThanOrEqual(2);
    expect(refs.some((r) => r.source === "fmt")).toBe(true);
    expect(refs.some((r) => r.source === "pkg/sub")).toBe(true);
    expect(refs.some((r) => r.source === "a")).toBe(true);
    expect(refs.some((r) => r.source === "b")).toBe(true);
  });

  it("parseImports_rust", () => {
    const content = [
      "use crate::foo;",
      "use std::collections::{HashMap, BTreeSet};",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("src/lib.rs"));
    expect(refs.length).toBe(2);
    expect(refs.some((r) => r.source === "crate::foo" && r.symbols.length === 0)).toBe(
      true,
    );
    const braceRef = refs.find((r) => r.source.includes("std::collections"));
    expect(braceRef).toBeDefined();
    expect(braceRef?.symbols.some((s) => s === "HashMap" || s === "BTreeSet")).toBe(true);
  });

  it("parseImports_java", () => {
    const content = [
      "import java.util.List;",
      "import pkg.Class;",
      "import pkg.sub.*;",
    ].join("\n");
    const refs = provider.parseImports(content, toRelativePath("src/Main.java"));
    expect(refs.length).toBe(3);
    expect(refs.some((r) => r.source === "java.util.List")).toBe(true);
    expect(refs.some((r) => r.source === "pkg.Class")).toBe(true);
    expect(refs.some((r) => r.source === "pkg.sub.*")).toBe(true);
  });

  it("extractSignaturesOnly_returns_chunks", () => {
    const content = [
      "def foo():",
      "    pass",
      "class Bar:",
      "    pass",
      "func Fizz() {}",
      "type Buzz struct {}",
      "fn quux() {}",
      "struct Baz {}",
      "public class Main {}",
      "public void run() {}",
    ].join("\n");
    const chunks = provider.extractSignaturesOnly(content);
    expect(
      chunks.some((c) => c.symbolName === "foo" && c.symbolType === SYMBOL_TYPE.FUNCTION),
    ).toBe(true);
    expect(
      chunks.some((c) => c.symbolName === "Bar" && c.symbolType === SYMBOL_TYPE.CLASS),
    ).toBe(true);
    expect(chunks.some((c) => c.symbolName === "Fizz")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "Buzz")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "quux")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "Baz")).toBe(true);
    expect(chunks.some((c) => c.symbolName === "Main")).toBe(true);
    expect(
      chunks.some((c) => c.symbolName === "run" && c.symbolType === SYMBOL_TYPE.METHOD),
    ).toBe(true);
  });

  it("extractNames_returns_symbols", () => {
    const content = [
      "def py_fn():",
      "class PyClass:",
      "func GoExported() {}",
      "type ExportedType struct {}",
      "pub fn rust_pub() {}",
      "pub struct RustStruct {}",
      "public class JavaClass {}",
      "public void publicMethod() {}",
    ].join("\n");
    const symbols = provider.extractNames(content);
    expect(
      symbols.some((s) => s.name === "py_fn" && s.kind === SYMBOL_KIND.FUNCTION),
    ).toBe(true);
    expect(
      symbols.some((s) => s.name === "PyClass" && s.kind === SYMBOL_KIND.CLASS),
    ).toBe(true);
    expect(symbols.some((s) => s.name === "GoExported")).toBe(true);
    expect(symbols.some((s) => s.name === "ExportedType")).toBe(true);
    expect(symbols.some((s) => s.name === "rust_pub")).toBe(true);
    expect(symbols.some((s) => s.name === "RustStruct")).toBe(true);
    expect(symbols.some((s) => s.name === "JavaClass")).toBe(true);
    expect(symbols.some((s) => s.name === "publicMethod")).toBe(true);
  });

  it("never_throws", () => {
    expect(() => provider.parseImports("", toRelativePath("x.py"))).not.toThrow();
    expect(() => provider.parseImports("{{{", toRelativePath("bad.py"))).not.toThrow();
    expect(provider.parseImports("", toRelativePath("a.go"))).toEqual([]);
    expect(provider.extractSignaturesWithDocs("")).toEqual([]);
    expect(() => provider.extractSignaturesOnly("")).not.toThrow();
    expect(provider.extractSignaturesOnly("")).toEqual([]);
    expect(() => provider.extractNames("")).not.toThrow();
    expect(provider.extractNames("")).toEqual([]);
    expect(provider.parseImports("", toRelativePath("noext"))).toEqual([]);
  });

  it("extensions and id", () => {
    expect(provider.id).toBe("generic-import");
    expect(provider.extensions.length).toBe(4);
  });
});
