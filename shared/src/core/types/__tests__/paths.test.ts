// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { resolveImportSpec, toRelativePath } from "../paths.js";

describe("resolveImportSpec", () => {
  it("resolveImportSpec ./b from src/a.ts returns src/b", () => {
    const result = resolveImportSpec(toRelativePath("src/a.ts"), "./b");
    expect(result).toEqual(toRelativePath("src/b"));
  });

  it("resolveImportSpec ../b from src/a.ts returns b", () => {
    const result = resolveImportSpec(toRelativePath("src/a.ts"), "../b");
    expect(result).toEqual(toRelativePath("b"));
  });

  it("resolveImportSpec ../../c from src/dir/a.ts returns c", () => {
    const result = resolveImportSpec(toRelativePath("src/dir/a.ts"), "../../c");
    expect(result).toEqual(toRelativePath("c"));
  });

  it("resolveImportSpec ../.. from src/a.ts returns null (escape root)", () => {
    const result = resolveImportSpec(toRelativePath("src/a.ts"), "../..");
    expect(result).toBeNull();
  });

  it("resolveImportSpec ./b from a.ts returns b", () => {
    const result = resolveImportSpec(toRelativePath("a.ts"), "./b");
    expect(result).toEqual(toRelativePath("b"));
  });
});
