// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { MarkdownProvider } from "../markdown-provider.js";
import { toRelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import { SYMBOL_KIND } from "@jatbas/aic-shared/core/types/enums.js";

describe("MarkdownProvider", () => {
  const provider = new MarkdownProvider();

  it("parseImports_returns_empty", () => {
    const result = provider.parseImports("# Hello\n\nWorld.", toRelativePath("doc.md"));
    expect(result).toHaveLength(0);
  });

  it("extractSignaturesWithDocs_includes_heading_and_first_paragraph", () => {
    const content = "## Section\n\nFirst paragraph.\n\nMore.";
    const chunks = provider.extractSignaturesWithDocs(content);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.symbolName).toBe("Section");
    expect(chunks[0]?.content).toContain("## Section");
    expect(chunks[0]?.content).toContain("First paragraph.");
  });

  it("extractSignaturesOnly_returns_heading_lines_only", () => {
    const content = "## A\n\nBody A\n\n## B\n\nBody B";
    const chunks = provider.extractSignaturesOnly(content);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.content).toBe("## A");
    expect(chunks[1]?.content).toBe("## B");
  });

  it("extractNames_returns_heading_titles", () => {
    const content = "## A\n\nBody\n\n## B\n\nMore";
    const symbols = provider.extractNames(content);
    expect(symbols).toHaveLength(2);
    expect(symbols[0]?.name).toBe("A");
    expect(symbols[0]?.kind).toBe(SYMBOL_KIND.CONST);
    expect(symbols[1]?.name).toBe("B");
    expect(symbols[1]?.kind).toBe(SYMBOL_KIND.CONST);
  });

  it("empty_content_returns_empty_arrays", () => {
    expect(provider.parseImports("", toRelativePath("x.md"))).toHaveLength(0);
    expect(provider.extractSignaturesWithDocs("")).toEqual([]);
    expect(provider.extractSignaturesOnly("")).toEqual([]);
    expect(provider.extractNames("")).toEqual([]);
  });

  it("no_mutation_of_input", () => {
    const content = "## One\n\nText.";
    const a1 = provider.extractSignaturesWithDocs(content);
    const a2 = provider.extractSignaturesWithDocs(content);
    expect(a1).toEqual(a2);
    const b1 = provider.extractSignaturesOnly(content);
    const b2 = provider.extractSignaturesOnly(content);
    expect(b1).toEqual(b2);
    const c1 = provider.extractNames(content);
    const c2 = provider.extractNames(content);
    expect(c1).toEqual(c2);
  });
});
