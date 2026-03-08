// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { WhitespaceNormalizer } from "../whitespace-normalizer.js";
import { toRelativePath, toFileExtension } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

describe("WhitespaceNormalizer", () => {
  it("excluded_extension_returns_content_unchanged", () => {
    const normalizer = new WhitespaceNormalizer([toFileExtension(".md")]);
    const content = "  a  \n\n\n  b  ";
    const result = normalizer.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("x.md"),
    );
    expect(result).toBe("  a  \n\n\n  b  ");
  });

  it("non_excluded_extension_normalized", () => {
    const normalizer = new WhitespaceNormalizer([toFileExtension(".md")]);
    const content = "  a  \n\n\n  b  ";
    const result = normalizer.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("x.ts"),
    );
    expect(result).toBe("  a\n\n  b");
  });

  it("empty_excluded_list_normalizes_all", () => {
    const normalizer = new WhitespaceNormalizer([]);
    const content = "  a  \n\n\n  b  ";
    const result = normalizer.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("x.md"),
    );
    expect(result).toBe("  a\n\n  b");
  });

  it("extension_comparison_case_insensitive", () => {
    const normalizer = new WhitespaceNormalizer([toFileExtension(".md")]);
    const content = "  a  \n\n\n  b  ";
    const result = normalizer.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("x.MD"),
    );
    expect(result).toBe("  a  \n\n\n  b  ");
  });

  it("safety_python_indentation_preserved", () => {
    const normalizer = new WhitespaceNormalizer([toFileExtension(".py")]);
    const content = [
      "def main():",
      "    x = 1",
      "    if x:",
      "        return x",
      "    return 0",
    ].join("\n");
    const result = normalizer.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("src/main.py"),
    );
    expect(result).toBe(content);
  });

  it("safety_yaml_structure_unchanged", () => {
    const normalizer = new WhitespaceNormalizer([toFileExtension(".yml")]);
    const content = [
      "server:",
      "  host: localhost",
      "  port: 3000",
      "  auth:",
      "    enabled: true",
    ].join("\n");
    const result = normalizer.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("config.yml"),
    );
    expect(result).toBe(content);
  });

  it("safety_jsx_structure_unchanged", () => {
    const normalizer = new WhitespaceNormalizer([]);
    const content = [
      "  <div>",
      "    <span>",
      "      text",
      "    </span>",
      "  </div>",
    ].join("\n");
    const result = normalizer.transform(
      content,
      INCLUSION_TIER.L0,
      toRelativePath("App.tsx"),
    );
    expect(result).toContain("<div>");
    expect(result).toContain("</div>");
    expect(result).toContain("<span>");
    expect(result).toContain("</span>");
    const openDiv = result.indexOf("<div>");
    const closeDiv = result.indexOf("</div>");
    const openSpan = result.indexOf("<span>");
    const closeSpan = result.indexOf("</span>");
    expect(openDiv).toBeLessThan(openSpan);
    expect(openSpan).toBeLessThan(closeSpan);
    expect(closeSpan).toBeLessThan(closeDiv);
  });
});
