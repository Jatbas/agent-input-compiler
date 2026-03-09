// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { LongStringLiteralTruncator } from "../long-string-literal-truncator.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

const path = toRelativePath("src/foo.ts");

describe("LongStringLiteralTruncator", () => {
  it("long_double_quoted_truncated", () => {
    const truncator = new LongStringLiteralTruncator();
    const content = '"' + "a".repeat(201) + '"';
    const result = truncator.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("[string literal truncated: 201 chars]");
    expect(result).not.toContain("a".repeat(201));
  });

  it("long_single_quoted_truncated", () => {
    const truncator = new LongStringLiteralTruncator();
    const content = "'" + "b".repeat(201) + "'";
    const result = truncator.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("'[string literal truncated: 201 chars]'");
    expect(result).not.toContain("b".repeat(201));
  });

  it("short_literal_unchanged", () => {
    const truncator = new LongStringLiteralTruncator();
    const content = 'const x = "short";';
    const result = truncator.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("empty_content_returns_unchanged", () => {
    const truncator = new LongStringLiteralTruncator();
    const content = "";
    const result = truncator.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("");
  });

  it("escaped_quotes_inside_preserved", () => {
    const truncator = new LongStringLiteralTruncator();
    const inner = '\\"' + "x".repeat(200);
    const content = '"' + inner + '"';
    const result = truncator.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("[string literal truncated: 202 chars]");
    expect(result).not.toContain("x".repeat(200));
  });

  it("multiple_long_literals_both_replaced", () => {
    const truncator = new LongStringLiteralTruncator();
    const long1 = '"' + "a".repeat(201) + '"';
    const long2 = '"' + "b".repeat(201) + '"';
    const content = long1 + " " + long2;
    const result = truncator.transform(content, INCLUSION_TIER.L0, path);
    const occurrences = (result.match(/\[string literal truncated: \d+ chars\]/g) ?? [])
      .length;
    expect(occurrences).toBe(2);
  });

  it("safety_python_indentation_preserved", () => {
    const truncator = new LongStringLiteralTruncator();
    const content = "def f():\n pass";
    const result = truncator.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("safety_yaml_structure_unchanged", () => {
    const truncator = new LongStringLiteralTruncator();
    const content = "key: value";
    const result = truncator.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("safety_jsx_structure_unchanged", () => {
    const truncator = new LongStringLiteralTruncator();
    const content = "<Component />";
    const result = truncator.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });
});
