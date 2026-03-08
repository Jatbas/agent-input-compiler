// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { MinifiedCodeSkipper } from "../minified-code-skipper.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

describe("MinifiedCodeSkipper", () => {
  it("min_js_path_returns_placeholder", () => {
    const transformer = new MinifiedCodeSkipper();
    const filePath = toRelativePath("lib/app.min.js");
    const content = "x";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("[Minified: app.min.js, 1 bytes — skipped]");
  });

  it("min_css_path_returns_placeholder", () => {
    const transformer = new MinifiedCodeSkipper();
    const filePath = toRelativePath("styles/bundle.min.css");
    const content = "a{b}";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toContain("[Minified:");
    expect(result).toContain("bytes — skipped]");
  });

  it("dist_segment_returns_placeholder", () => {
    const transformer = new MinifiedCodeSkipper();
    const filePath = toRelativePath("dist/bundle.js");
    const content = "code";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toContain("[Minified: bundle.js, 4 bytes — skipped]");
  });

  it("build_segment_returns_placeholder", () => {
    const transformer = new MinifiedCodeSkipper();
    const filePath = toRelativePath("build/out.js");
    const content = "x";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toContain("[Minified: out.js,");
    expect(result).toContain("bytes — skipped]");
  });

  it("non_minified_path_returns_unchanged", () => {
    const transformer = new MinifiedCodeSkipper();
    const filePath = toRelativePath("src/index.js");
    const content = "const x = 1;";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("empty_content_returns_unchanged", () => {
    const transformer = new MinifiedCodeSkipper();
    const filePath = toRelativePath("src/foo.js");
    const content = "";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("");
  });

  it("safety_python_indentation_preserved", () => {
    const transformer = new MinifiedCodeSkipper();
    const filePath = toRelativePath("src/main.py");
    const content = "def f():\n    pass";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("safety_yaml_structure_unchanged", () => {
    const transformer = new MinifiedCodeSkipper();
    const filePath = toRelativePath("config.yml");
    const content = "key:\n  nested: 1";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("safety_jsx_structure_unchanged", () => {
    const transformer = new MinifiedCodeSkipper();
    const filePath = toRelativePath("src/App.tsx");
    const content = "<div>x</div>";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });
});
