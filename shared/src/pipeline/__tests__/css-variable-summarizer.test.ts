// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { CssVariableSummarizer } from "../css-variable-summarizer.js";
import { toRelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-shared/core/types/enums.js";

const pathCss = toRelativePath("src/styles.css");
const pathScss = toRelativePath("src/styles.scss");

describe("CssVariableSummarizer", () => {
  it("root_block_kept_compacted", () => {
    const summarizer = new CssVariableSummarizer();
    const content = ":root { --a: 1; --b: 2; }";
    const result = summarizer.transform(content, INCLUSION_TIER.L0, pathCss);
    expect(result).toContain("--a: 1");
    expect(result).toContain("--b: 2");
    expect(result).toContain(":root");
    expect(result.replace(/\s+/g, " ").trim()).toBe(result);
  });

  it("root_plus_rules_summarized", () => {
    const summarizer = new CssVariableSummarizer();
    const content = ":root { }\n.cls { prop: val; }";
    const result = summarizer.transform(content, INCLUSION_TIER.L0, pathCss);
    expect(result).toContain(":root");
    expect(result).toContain(".cls { [1 declarations] }");
  });

  it("multiple_rules_summarized", () => {
    const summarizer = new CssVariableSummarizer();
    const content = ".a { x: 1; }\n.b { y: 2; z: 3; }";
    const result = summarizer.transform(content, INCLUSION_TIER.L0, pathCss);
    expect(result).toContain(".a { [1 declarations] }");
    expect(result).toContain(".b { [2 declarations] }");
  });

  it("empty_content_returns_unchanged", () => {
    const summarizer = new CssVariableSummarizer();
    const content = "";
    const result = summarizer.transform(content, INCLUSION_TIER.L0, pathCss);
    expect(result).toBe("");
  });

  it("no_blocks_unchanged", () => {
    const summarizer = new CssVariableSummarizer();
    const content = "plain text\nno type or interface here";
    const result = summarizer.transform(content, INCLUSION_TIER.L0, pathCss);
    expect(result).toBe(content);
  });

  it("safety_css_structure_preserved", () => {
    const summarizer = new CssVariableSummarizer();
    const content = [
      ":root { --x: 1; }",
      ".btn { color: red; padding: 8px; }",
      "#id { margin: 0; }",
    ].join("\n");
    const result = summarizer.transform(content, INCLUSION_TIER.L0, pathCss);
    expect(result).toContain(":root");
    expect(result).toContain(".btn");
    expect(result).toContain("#id");
    const openBraces = (result.match(/{/g) ?? []).length;
    const closeBraces = (result.match(/}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });

  it("safety_scss_structure_preserved", () => {
    const summarizer = new CssVariableSummarizer();
    const content = ["$var: 1;", ".a { color: red; }", ".b { .nested { x: 1; } }"].join(
      "\n",
    );
    const result = summarizer.transform(content, INCLUSION_TIER.L0, pathScss);
    expect(result).toContain(".a");
    expect(result).toContain(".b");
    expect(result).toContain("[1 declarations]");
    const openBraces = (result.match(/{/g) ?? []).length;
    const closeBraces = (result.match(/}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });
});
