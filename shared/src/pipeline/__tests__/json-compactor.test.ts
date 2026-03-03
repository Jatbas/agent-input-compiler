import { describe, it, expect } from "vitest";
import { JsonCompactor } from "../json-compactor.js";
import { toRelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

const path = toRelativePath("config.json");

describe("JsonCompactor", () => {
  it("minifies_valid_json", () => {
    const compactor = new JsonCompactor();
    const content = '{\n  "a": 1,\n  "b": 2\n}';
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe('{"a":1,"b":2}');
  });

  it("invalid_json_returns_unchanged", () => {
    const compactor = new JsonCompactor();
    const content = "not json {{";
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("not json {{");
  });

  it("empty_content_returns_unchanged", () => {
    const compactor = new JsonCompactor();
    const content = "";
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("");
  });

  it("safety_json_validity_preserved", () => {
    const compactor = new JsonCompactor();
    const content = [
      "{",
      '  "a": 1,',
      '  "b": [2, 3],',
      '  "c": { "nested": true }',
      "}",
    ].join("\n");
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(() => JSON.parse(result)).not.toThrow();
  });
});
