import { describe, it, expect } from "vitest";
import { HtmlToMarkdownTransformer } from "../html-to-markdown-transformer.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const pathHtml = toRelativePath("src/page.html");
const pathHtm = toRelativePath("src/page.htm");

describe("HtmlToMarkdownTransformer", () => {
  it("html_heading_converted", () => {
    const transformer = new HtmlToMarkdownTransformer();
    const content = "<h1>Title</h1><h2>Sub</h2>";
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathHtml);
    expect(result).toContain("# Title");
    expect(result).toContain("## Sub");
  });

  it("html_link_converted", () => {
    const transformer = new HtmlToMarkdownTransformer();
    const content = '<a href="https://x.com">link</a>';
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathHtml);
    expect(result).toContain("[link](https://x.com)");
  });

  it("script_block_stripped", () => {
    const transformer = new HtmlToMarkdownTransformer();
    const content = "<body><script>alert(1);</script>ok</body>";
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathHtml);
    expect(result).not.toContain("alert(1)");
    expect(result).toContain("ok");
  });

  it("style_block_stripped", () => {
    const transformer = new HtmlToMarkdownTransformer();
    const content = "<head><style>.x{}</style></head><p>text</p>";
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathHtml);
    expect(result).not.toContain(".x{}");
    expect(result).toContain("text");
  });

  it("empty_content_returns_unchanged", () => {
    const transformer = new HtmlToMarkdownTransformer();
    const content = "";
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathHtml);
    expect(result).toBe("");
  });

  it("safety_html_structure_markdown_valid", () => {
    const transformer = new HtmlToMarkdownTransformer();
    const content = [
      "<h1>Doc</h1>",
      '<p>Intro <a href="https://example.com">example</a>.</p>',
      "<ul><li>one</li><li>two</li></ul>",
    ].join("");
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathHtml);
    expect(result).toMatch(/^#\s/);
    expect(result).toContain("[example](https://example.com)");
    expect(result).toMatch(/- one/);
    expect(result).toMatch(/- two/);
  });

  it("safety_htm_extension_same_behavior", () => {
    const transformer = new HtmlToMarkdownTransformer();
    const content = "<h1>Title</h1><h2>Sub</h2>";
    const resultHtml = transformer.transform(content, INCLUSION_TIER.L0, pathHtml);
    const resultHtm = transformer.transform(content, INCLUSION_TIER.L0, pathHtm);
    expect(resultHtm).toBe(resultHtml);
  });
});
