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
});
