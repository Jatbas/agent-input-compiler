// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { SvgDescriber } from "../svg-describer.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

const pathSvg = toRelativePath("src/icon.svg");

describe("SvgDescriber", () => {
  it("viewbox_and_elements_described", () => {
    const transformer = new SvgDescriber();
    const content =
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/><path d="M0 0"/></svg>';
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathSvg);
    const byteLength = new TextEncoder().encode(content).length;
    expect(result).toMatch(/^\[SVG: 0 0 100 100, \d+ elements, \d+ bytes\]$/);
    expect(result).toContain("0 0 100 100");
    const bytesMatch = result.match(/(\d+) bytes\]$/);
    expect(bytesMatch?.[1]).toBe(String(byteLength));
    const elementsMatch = result.match(/, (\d+) elements,/);
    const n = elementsMatch ? Number(elementsMatch[1]) : 0;
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it("no_viewbox_uses_placeholder", () => {
    const transformer = new SvgDescriber();
    const content = '<svg><rect width="10" height="10"/></svg>';
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathSvg);
    expect(result).toContain("[SVG: —,");
    expect(result).toContain("elements,");
    expect(result).toContain("bytes]");
  });

  it("empty_content_returns_unchanged", () => {
    const transformer = new SvgDescriber();
    const content = "";
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathSvg);
    expect(result).toBe("");
  });

  it("single_element_count", () => {
    const transformer = new SvgDescriber();
    const content = '<svg viewBox="0 0 1 1"><circle/></svg>';
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathSvg);
    expect(result).toContain("elements");
    expect(result).toContain("bytes");
    const elementsMatch = result.match(/, (\d+) elements,/);
    const n = elementsMatch ? Number(elementsMatch[1]) : 0;
    expect(n).toBeGreaterThanOrEqual(1);
  });

  it("safety_svg_placeholder_format", () => {
    const transformer = new SvgDescriber();
    const content = '<svg viewBox="0 0 24 24"><rect/><circle/><path d=""/></svg>';
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathSvg);
    expect(result).toMatch(/^\[SVG: [^,]+, \d+ elements, \d+ bytes\]$/);
    expect(result.startsWith("[SVG: ")).toBe(true);
    expect(result.endsWith(" bytes]")).toBe(true);
  });

  it("safety_svg_extension_same_behavior", () => {
    const transformer = new SvgDescriber();
    const content =
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/><path d="M0 0"/></svg>';
    const resultSvg = transformer.transform(content, INCLUSION_TIER.L0, pathSvg);
    const pathSvgAlt = toRelativePath("src/icon.svg");
    const resultAlt = transformer.transform(content, INCLUSION_TIER.L0, pathSvgAlt);
    expect(resultAlt).toBe(resultSvg);
  });
});
