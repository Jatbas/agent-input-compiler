// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { LicenseHeaderStripper } from "../license-header-stripper.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

const path = toRelativePath("src/foo.ts");

describe("LicenseHeaderStripper", () => {
  it("strips_leading_license_block_c_style", () => {
    const stripper = new LicenseHeaderStripper();
    const content = "// MIT License\n// Copyright (c) 2024\n\n// Next comment\nimport x;";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result.startsWith("// Next comment")).toBe(true);
  });

  it("strips_leading_license_block_hash", () => {
    const stripper = new LicenseHeaderStripper();
    const content = "# MIT License\n# Copyright\n\n# Next\ncode";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result.startsWith("# Next")).toBe(true);
  });

  it("no_license_keyword_returns_unchanged", () => {
    const stripper = new LicenseHeaderStripper();
    const content = "// Some other header\n\nimport x;";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("empty_content_returns_unchanged", () => {
    const stripper = new LicenseHeaderStripper();
    const content = "";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("");
  });

  it("license_in_body_not_stripped", () => {
    const stripper = new LicenseHeaderStripper();
    const content = "const x = 1;\n// License here";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("safety_python_indentation_preserved", () => {
    const stripper = new LicenseHeaderStripper();
    const content = "# License\n# Copyright\n\ndef f():\n    pass";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("def f():\n    pass");
  });

  it("safety_yaml_structure_unchanged", () => {
    const stripper = new LicenseHeaderStripper();
    const content = "# License\n\nkey: value";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("key: value");
  });

  it("safety_jsx_structure_unchanged", () => {
    const stripper = new LicenseHeaderStripper();
    const content = "// License\n\n<Component />";
    const result = stripper.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("<Component />");
  });
});
