// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { Base64InlineDataStripper } from "../base64-inline-data-stripper.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

const path = toRelativePath("src/foo.ts");

describe("Base64InlineDataStripper", () => {
  it("strips_data_url_base64", () => {
    const stripper = new Base64InlineDataStripper();
    const content = 'const url = "data:image/png;base64,iVBORw0KGgo=";';
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("[base64 inline data stripped]");
    expect(result).not.toContain("iVBORw0KGgo=");
  });

  it("no_data_url_returns_unchanged", () => {
    const stripper = new Base64InlineDataStripper();
    const content = "const x = 1;";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("empty_content_returns_unchanged", () => {
    const stripper = new Base64InlineDataStripper();
    const content = "";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("");
  });

  it("multiple_data_urls_replaced", () => {
    const stripper = new Base64InlineDataStripper();
    const content = "a data:image/png;base64,AB= b data:image/png;base64,CD= c";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    const occurrences = (result.match(/\[base64 inline data stripped\]/g) ?? []).length;
    expect(occurrences).toBe(2);
  });

  it("safety_python_indentation_preserved", () => {
    const stripper = new Base64InlineDataStripper();
    const content = "def f():\n    pass";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("safety_yaml_structure_unchanged", () => {
    const stripper = new Base64InlineDataStripper();
    const content = "key: value";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("safety_jsx_structure_unchanged", () => {
    const stripper = new Base64InlineDataStripper();
    const content = "<Component />";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });
});
