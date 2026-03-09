// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { TestStructureExtractor } from "../test-structure-extractor.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

const pathTest = toRelativePath("src/foo.test.ts");
const pathSpec = toRelativePath("src/bar.spec.js");
const pathPlain = toRelativePath("src/impl.ts");

function braceDelta(c: string): number {
  if (c === "{") return 1;
  if (c === "}") return -1;
  return 0;
}

function braceBalance(s: string): number {
  return [...s].reduce((acc, c) => acc + braceDelta(c), 0);
}

describe("TestStructureExtractor", () => {
  it("describe_it_names_kept_bodies_stripped", () => {
    const extractor = new TestStructureExtractor();
    const content =
      'describe("Suite", () => { const x = 1; }); it("case", () => { expect(1).toBe(1); });';
    const result = extractor.transform(content, INCLUSION_TIER.L0, pathTest);
    expect(result).toContain("Suite");
    expect(result).toContain("case");
    expect(result).not.toContain("const x = 1");
    expect(result).not.toContain("expect(1).toBe(1)");
    expect(result).toContain("() => {}");
  });

  it("non_test_path_unchanged", () => {
    const extractor = new TestStructureExtractor();
    const content = 'describe("X", () => { });';
    const result = extractor.transform(content, INCLUSION_TIER.L0, pathPlain);
    expect(result).toBe(content);
  });

  it("test_path_describe_it_preserved", () => {
    const extractor = new TestStructureExtractor();
    const content =
      'describe("Outer", () => { it("Inner", () => { expect(1).toBe(1); }); });';
    const result = extractor.transform(content, INCLUSION_TIER.L0, pathTest);
    expect(result).toContain("Outer");
    expect(result).toContain("Inner");
    expect(braceBalance(result)).toBe(0);
  });

  it("empty_content_returns_unchanged", () => {
    const extractor = new TestStructureExtractor();
    const content = "";
    const result = extractor.transform(content, INCLUSION_TIER.L0, pathTest);
    expect(result).toBe("");
  });

  it("safety_ts_test_structure_preserved", () => {
    const extractor = new TestStructureExtractor();
    const content = [
      'describe("suite", () => {',
      '  it("case one", () => { expect(1).toBe(1); });',
      '  it("case two", () => { expect(2).toBe(2); });',
      "});",
    ].join("\n");
    const result = extractor.transform(content, INCLUSION_TIER.L0, pathTest);
    expect(braceBalance(result)).toBe(0);
    expect(result).toContain("suite");
    expect(result).toContain("case one");
    expect(result).toContain("case two");
  });

  it("safety_spec_js_structure_preserved", () => {
    const extractor = new TestStructureExtractor();
    const content = [
      'describe("spec suite", () => {',
      '  it("spec case", () => { expect(true).toBe(true); });',
      "});",
    ].join("\n");
    const result = extractor.transform(content, INCLUSION_TIER.L0, pathSpec);
    expect(braceBalance(result)).toBe(0);
    expect(result).toContain("spec suite");
    expect(result).toContain("spec case");
  });
});
