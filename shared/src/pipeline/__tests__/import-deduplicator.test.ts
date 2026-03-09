// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { ImportDeduplicator } from "../import-deduplicator.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";

const pathTs = toRelativePath("src/foo.ts");

describe("ImportDeduplicator", () => {
  it("duplicate_named_imports_same_specifier_merged", () => {
    const deduplicator = new ImportDeduplicator();
    const content = ['import { a } from "mod";', 'import { b } from "mod";'].join("\n");
    const result = deduplicator.transform(content, INCLUSION_TIER.L0, pathTs);
    expect(result).toContain('import { a, b } from "mod";');
    expect(result.split("\n").filter((l) => l.includes("mod"))).toHaveLength(1);
  });

  it("duplicate_import_line_removed", () => {
    const deduplicator = new ImportDeduplicator();
    const content = ['import { x } from "lib";', 'import { x } from "lib";'].join("\n");
    const result = deduplicator.transform(content, INCLUSION_TIER.L0, pathTs);
    expect(result).toBe('import { x } from "lib";');
  });

  it("no_imports_unchanged", () => {
    const deduplicator = new ImportDeduplicator();
    const content = "const x = 1;\nfunction f() { return x; }";
    const result = deduplicator.transform(content, INCLUSION_TIER.L0, pathTs);
    expect(result).toBe(content);
  });

  it("empty_content_returns_unchanged", () => {
    const deduplicator = new ImportDeduplicator();
    const content = "";
    const result = deduplicator.transform(content, INCLUSION_TIER.L0, pathTs);
    expect(result).toBe("");
  });

  it("safety_python_indentation_preserved", () => {
    const deduplicator = new ImportDeduplicator();
    const content = "def f():\n    pass";
    const result = deduplicator.transform(content, INCLUSION_TIER.L0, pathTs);
    expect(result).toBe(content);
  });

  it("safety_yaml_structure_unchanged", () => {
    const deduplicator = new ImportDeduplicator();
    const content = "key: value\nlist:\n  - a\n  - b";
    const result = deduplicator.transform(content, INCLUSION_TIER.L0, pathTs);
    expect(result).toBe(content);
  });

  it("safety_jsx_structure_unchanged", () => {
    const deduplicator = new ImportDeduplicator();
    const content = ['import { Component } from "react";', "<Component />"].join("\n");
    const result = deduplicator.transform(content, INCLUSION_TIER.L0, pathTs);
    expect(result).toContain("<Component />");
    expect(result).toContain('import { Component } from "react";');
  });
});
