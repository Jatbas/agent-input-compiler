// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { TypeDeclarationCompactor } from "../type-declaration-compactor.js";
import { toRelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-shared/core/types/enums.js";

const path = toRelativePath("src/types.d.ts");

describe("TypeDeclarationCompactor", () => {
  it("multi_line_type_collapsed", () => {
    const compactor = new TypeDeclarationCompactor();
    const content = ["type X =", "  { a: string; b: number };"].join("\n");
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("type X = { a: string; b: number };");
    expect(result).not.toContain("\n");
  });

  it("multi_line_interface_collapsed", () => {
    const compactor = new TypeDeclarationCompactor();
    const content = ["interface Y {", "  foo: string;", "  bar: number;", "}"].join("\n");
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("interface Y { foo: string; bar: number; }");
    expect(result).not.toContain("\n");
  });

  it("multi_line_enum_collapsed", () => {
    const compactor = new TypeDeclarationCompactor();
    const content = ["enum Z {", "  A,", "  B,", "}"].join("\n");
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("enum Z { A, B, }");
    expect(result).not.toContain("\n");
  });

  it("declare_block_collapsed", () => {
    const compactor = new TypeDeclarationCompactor();
    const content = ['declare module "x" {', "  export const y: number;", "}"].join("\n");
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe('declare module "x" { export const y: number; }');
    expect(result).not.toContain("\n");
  });

  it("single_line_unchanged", () => {
    const compactor = new TypeDeclarationCompactor();
    const content = "type A = string;\ninterface B { x: number; }";
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("empty_content_returns_unchanged", () => {
    const compactor = new TypeDeclarationCompactor();
    const content = "";
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe("");
  });

  it("no_declaration_content_unchanged", () => {
    const compactor = new TypeDeclarationCompactor();
    const content = "plain text\nno type or interface here";
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toBe(content);
  });

  it("safety_d_ts_structure_preserved", () => {
    const compactor = new TypeDeclarationCompactor();
    const content = [
      "export type Id = string;",
      "export interface User {",
      "  id: Id;",
      "  name: string;",
      "}",
      "declare function get(): User;",
    ].join("\n");
    const result = compactor.transform(content, INCLUSION_TIER.L0, path);
    expect(result).toContain("type");
    expect(result).toContain("interface");
    expect(result).toContain("declare");
    const openBraces = (result.match(/{/g) ?? []).length;
    const closeBraces = (result.match(/}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });
});
