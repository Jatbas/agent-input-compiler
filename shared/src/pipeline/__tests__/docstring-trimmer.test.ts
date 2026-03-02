import { describe, it, expect } from "vitest";
import { DocstringTrimmer } from "../docstring-trimmer.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const path = toRelativePath("src/foo.ts");

describe("DocstringTrimmer", () => {
  it("long_python_double_docstring_trimmed", () => {
    const trimmer = new DocstringTrimmer();
    const content = '"""' + "a".repeat(201) + '"""';
    const result = trimmer.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("[docstring trimmed: 201 chars]");
    expect(result).not.toContain("a".repeat(201));
  });

  it("long_python_single_docstring_trimmed", () => {
    const trimmer = new DocstringTrimmer();
    const content = "'''" + "b".repeat(201) + "'''";
    const result = trimmer.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("'''[docstring trimmed: 201 chars]'''");
    expect(result).not.toContain("b".repeat(201));
  });

  it("long_jsdoc_block_trimmed", () => {
    const trimmer = new DocstringTrimmer();
    const content = "/**" + "c".repeat(201) + "*/";
    const result = trimmer.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("[docstring trimmed: 201 chars]");
    expect(result).toContain("/**");
    expect(result).toContain("*/");
    expect(result).not.toContain("c".repeat(201));
  });

  it("short_docstring_unchanged", () => {
    const trimmer = new DocstringTrimmer();
    const content = '"""short"""';
    const result = trimmer.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("empty_content_returns_unchanged", () => {
    const trimmer = new DocstringTrimmer();
    const content = "";
    const result = trimmer.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("");
  });

  it("no_docstring_pattern_unchanged", () => {
    const trimmer = new DocstringTrimmer();
    const content = "const x = 1;";
    const result = trimmer.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("safety_python_indentation_preserved", () => {
    const trimmer = new DocstringTrimmer();
    const content = "def f():\n    pass";
    const result = trimmer.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("safety_yaml_structure_unchanged", () => {
    const trimmer = new DocstringTrimmer();
    const content = "key: value";
    const result = trimmer.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("safety_jsx_structure_unchanged", () => {
    const trimmer = new DocstringTrimmer();
    const content = "<Component />";
    const result = trimmer.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });
});
