import { describe, it, expect } from "vitest";
import { YamlCompactor } from "../yaml-compactor.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const pathYaml = toRelativePath("src/config.yaml");
const pathYml = toRelativePath("src/config.yml");

describe("YamlCompactor", () => {
  it("comment_lines_removed", () => {
    const transformer = new YamlCompactor();
    const content = [
      "# top comment",
      "key: value",
      "  # nested comment",
      "other: 1",
    ].join("\n");
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathYaml);
    expect(result).not.toMatch(/^\s*#/m);
    expect(result).toContain("key: value");
    expect(result).toContain("other: 1");
  });

  it("indent_normalized", () => {
    const transformer = new YamlCompactor();
    const content = "parent:\n    child: 1\n    other: 2";
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathYaml);
    expect(result).toContain("  child: 1");
    expect(result).toContain("  other: 2");
  });

  it("single_value_map_collapsed", () => {
    const transformer = new YamlCompactor();
    const content = "parent:\n  child: value";
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathYaml);
    expect(result).toContain("parent: { child: value }");
  });

  it("empty_content_returns_unchanged", () => {
    const transformer = new YamlCompactor();
    const content = "";
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathYaml);
    expect(result).toBe("");
  });

  it("no_yaml_pattern_unchanged", () => {
    const transformer = new YamlCompactor();
    const content = "a: 1\nb: 2";
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathYaml);
    expect(result).toContain("a: 1");
    expect(result).toContain("b: 2");
  });

  it("safety_yaml_structure_preserved", () => {
    const transformer = new YamlCompactor();
    const content = ["key: value", "list:", "  - one", "  - two"].join("\n");
    const result = transformer.transform(content, INCLUSION_TIER.L0, pathYaml);
    expect(result).toContain("key: value");
    expect(result).toContain("list:");
    expect(result).toContain("- one");
    expect(result).toContain("- two");
  });

  it("safety_yml_extension_same_behavior", () => {
    const transformer = new YamlCompactor();
    const content = ["# comment", "key: value", "other: 1"].join("\n");
    const resultYaml = transformer.transform(content, INCLUSION_TIER.L0, pathYaml);
    const resultYml = transformer.transform(content, INCLUSION_TIER.L0, pathYml);
    expect(resultYml).toBe(resultYaml);
  });
});
