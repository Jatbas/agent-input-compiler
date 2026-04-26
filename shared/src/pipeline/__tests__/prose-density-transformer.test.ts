// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { ProseDensityTransformer } from "../prose-density-transformer.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import { TiktokenAdapter } from "@jatbas/aic-core/adapters/tiktoken-adapter.js";

const mdPath = toRelativePath("README.md");

describe("ProseDensityTransformer", () => {
  const t = new ProseDensityTransformer();

  it("strips_yaml_frontmatter_at_file_start", () => {
    const input = "---\ntitle: X\n---\n\n# Body\n";
    expect(t.transform(input, INCLUSION_TIER.L0, mdPath)).toBe("# Body\n");
  });

  it("does_not_strip_yaml_without_closing_delimiter", () => {
    const input = "---\ntitle: X\n\n# Still here\n";
    expect(t.transform(input, INCLUSION_TIER.L0, mdPath)).toBe(input);
  });

  it("collapses_three_or_more_blank_lines_outside_fence", () => {
    const input = "A\n\n\n\nB";
    expect(t.transform(input, INCLUSION_TIER.L0, mdPath)).toBe("A\n\nB");
  });

  it("preserves_two_blank_lines_outside_fence", () => {
    const input = "A\n\n\nB";
    expect(t.transform(input, INCLUSION_TIER.L0, mdPath)).toBe("A\n\n\nB");
  });

  it("preserves_blank_runs_inside_fence", () => {
    const inner = "x\n\n\n\ny";
    const input = "```\n" + inner + "\n```\n";
    expect(t.transform(input, INCLUSION_TIER.L0, mdPath)).toBe(input);
  });

  it("collapses_four_or_more_spaces_after_leading_indent_on_line", () => {
    const input = "    bullet    text    here\n";
    expect(t.transform(input, INCLUSION_TIER.L0, mdPath)).toBe("    bullet text here\n");
  });

  it("truncates_urls_at_least_120_chars", () => {
    const mid = "a".repeat(95);
    const url = `https://example.com/${mid}/tail-end-suffix`;
    expect(url.length).toBeGreaterThanOrEqual(120);
    const out = t.transform(`See ${url} end`, INCLUSION_TIER.L0, mdPath);
    expect(out.startsWith("See https://")).toBe(true);
    expect(out).toContain("\u2026");
    expect(out.endsWith("end")).toBe(true);
    expect(out.length).toBeLessThan(`See ${url} end`.length);
  });

  it("preserves_inner_bytes_across_two_fenced_blocks", () => {
    const inner1 = "const   x   =    1\n\n\n\n";
    const inner2 = "    a    b    \n";
    const input = `intro\n\n\`\`\`js\n${inner1}\n\`\`\`\n\nmid\n\n\`\`\`ts\n${inner2}\n\`\`\`\n\ntail`;
    const out = t.transform(input, INCLUSION_TIER.L0, mdPath);
    expect(out).toContain(`\`\`\`js\n${inner1}\n\`\`\``);
    expect(out).toContain(`\`\`\`ts\n${inner2}\n\`\`\``);
  });

  it("idempotence_readme_shaped", () => {
    const input =
      "# Title\n\nPara    with    spaces.\n\n\n\n\nNext.\n\nSee https://example.com/" +
      "x".repeat(100) +
      "/y\n";
    const once = t.transform(input, INCLUSION_TIER.L0, mdPath);
    const twice = t.transform(once, INCLUSION_TIER.L0, mdPath);
    expect(twice).toBe(once);
  });

  it("idempotence_frontmatter_heavy", () => {
    const input =
      "---\nx: 1\n---\n\n\n\n# H\n\nLong    spaces    here.\n\n```\n\n\n\n\n```\n";
    const once = t.transform(input, INCLUSION_TIER.L0, mdPath);
    const twice = t.transform(once, INCLUSION_TIER.L0, mdPath);
    expect(twice).toBe(once);
  });

  it("readme_fixture_reduces_tokens_to_at_most_85pct", () => {
    const longUrlA =
      "https://example.com/a/" + "b".repeat(90) + "/c/" + "d".repeat(40) + "/end-a";
    const longUrlB =
      "https://example.com/b/" + "c".repeat(85) + "/d/" + "e".repeat(45) + "/end-b";
    const paragraphs = Array.from(
      { length: 120 },
      (_, k) => `## Section ${k}\n\nBody    text    ${k}.\n\n\n\n\n`,
    ).join("");
    const input = `---
title: Demo
description: Long    spaced    words
---

${paragraphs}

Links: ${longUrlA} and ${longUrlB}.

\`\`\`txt

filler

\`\`\`
`;
    const tik = new TiktokenAdapter();
    const originalTokens = Number(tik.countTokens(input));
    expect(originalTokens).toBeGreaterThanOrEqual(1200);
    const transformed = t.transform(input, INCLUSION_TIER.L0, mdPath);
    const transformedTokens = Number(tik.countTokens(transformed));
    expect(transformedTokens).toBeLessThanOrEqual(Math.floor(originalTokens * 0.85));
  });
});
