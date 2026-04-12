// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { SpecificationCompilerImpl } from "../specification-compiler.js";
import {
  SPEC_USAGE_TO_INITIAL_TIER,
  type SpecificationInput,
} from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";

const measure = (s: string): ReturnType<typeof toTokenCount> =>
  toTokenCount([...s].length);

describe("SpecificationCompilerImpl", () => {
  it("spec_compiler_tier_initial_map", () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "ZType",
          path: toRelativePath("z/z.ts"),
          content: "",
          usage: "implements",
          estimatedTokens: toTokenCount(1),
        },
        {
          name: "AType",
          path: toRelativePath("a/a.ts"),
          content: "",
          usage: "passes-through",
          estimatedTokens: toTokenCount(1),
        },
        {
          name: "MType",
          path: toRelativePath("m/b.ts"),
          content: "",
          usage: "names-only",
          estimatedTokens: toTokenCount(1),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const c = new SpecificationCompilerImpl(measure);
    const { meta } = c.compile(input, toTokenCount(1_000_000));
    expect(Object.keys(meta.typeTiers)).toEqual([
      "AType\u0000a/a.ts",
      "MType\u0000m/b.ts",
      "ZType\u0000z/z.ts",
    ]);
    expect(meta.typeTiers["AType\u0000a/a.ts"]).toBe(
      SPEC_USAGE_TO_INITIAL_TIER["passes-through"],
    );
    expect(meta.typeTiers["MType\u0000m/b.ts"]).toBe(
      SPEC_USAGE_TO_INITIAL_TIER["names-only"],
    );
    expect(meta.typeTiers["ZType\u0000z/z.ts"]).toBe(
      SPEC_USAGE_TO_INITIAL_TIER.implements,
    );
  });

  it("spec_compiler_demotion_construct_before_implements", () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "Ctor",
          path: toRelativePath("a/a.ts"),
          content: "class Ctor {}",
          usage: "constructs",
          estimatedTokens: toTokenCount(50),
        },
        {
          name: "Impl",
          path: toRelativePath("b/b.ts"),
          content: "class Impl {}",
          usage: "implements",
          estimatedTokens: toTokenCount(50),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const full = new SpecificationCompilerImpl(measure).compile(
      input,
      toTokenCount(1_000_000),
    );
    const budget = toTokenCount(Math.max(0, [...full.compiledSpec].length - 1));
    const { meta } = new SpecificationCompilerImpl(measure).compile(input, budget);
    expect(meta.typeTiers["Ctor\u0000a/a.ts"]).toBe("signature-path");
    expect(meta.typeTiers["Impl\u0000b/b.ts"]).toBe("verbatim");
  });

  it("spec_compiler_tiebreak_larger_tokens_first", () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "Small",
          path: toRelativePath("a/small.ts"),
          content: "function a() {}",
          usage: "implements",
          estimatedTokens: toTokenCount(10),
        },
        {
          name: "Big",
          path: toRelativePath("b/big.ts"),
          content: "function x() {}\nfunction y() {}\nfunction z() {}",
          usage: "implements",
          estimatedTokens: toTokenCount(10),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const full = new SpecificationCompilerImpl(measure).compile(
      input,
      toTokenCount(1_000_000),
    );
    const budget = toTokenCount(Math.max(0, [...full.compiledSpec].length - 1));
    const { meta } = new SpecificationCompilerImpl(measure).compile(input, budget);
    expect(meta.typeTiers["Big\u0000b/big.ts"]).toBe("signature-path");
    expect(meta.typeTiers["Small\u0000a/small.ts"]).toBe("verbatim");
  });

  it("spec_compiler_shared_import_merge", () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "T1",
          path: toRelativePath("a/t1.ts"),
          content: 'import { x } from "shared";\nconst a = 1;',
          usage: "implements",
          estimatedTokens: toTokenCount(20),
        },
        {
          name: "T2",
          path: toRelativePath("b/t2.ts"),
          content: 'import { y } from "shared";\nconst b = 2;',
          usage: "implements",
          estimatedTokens: toTokenCount(20),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const { compiledSpec } = new SpecificationCompilerImpl(measure).compile(
      input,
      toTokenCount(1_000_000),
    );
    const importLines = compiledSpec
      .split("\n\n")[0]
      ?.split("\n")
      .filter((l) => l.startsWith("import "));
    expect(importLines).toEqual(['import { x, y } from "shared";']);
  });

  it("spec_compiler_determinism", () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "A",
          path: toRelativePath("p/a.ts"),
          content: "function f() {}",
          usage: "calls-methods",
          estimatedTokens: toTokenCount(5),
        },
      ],
      codeBlocks: [{ label: "c", content: "x", estimatedTokens: toTokenCount(1) }],
      prose: [{ label: "p", content: "y", estimatedTokens: toTokenCount(1) }],
    };
    const c = new SpecificationCompilerImpl(measure);
    const a = c.compile(input, toTokenCount(400));
    const b = c.compile(input, toTokenCount(400));
    expect(a.compiledSpec).toBe(b.compiledSpec);
    expect(a.meta).toEqual(b.meta);
  });

  it("spec_compiler_truncation_warning", () => {
    const longName = "N".repeat(400);
    const input: SpecificationInput = {
      types: [
        {
          name: longName,
          path: toRelativePath("p/x.ts"),
          content: "",
          usage: "names-only",
          estimatedTokens: toTokenCount(1),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const { compiledSpec } = new SpecificationCompilerImpl(measure).compile(
      input,
      toTokenCount(50),
    );
    expect(
      compiledSpec.endsWith(
        "\nAIC specification compiler: output truncated to satisfy budget.",
      ),
    ).toBe(true);
  });

  it("spec_compiler_code_blocks_sorted_by_label", () => {
    const input: SpecificationInput = {
      types: [],
      codeBlocks: [
        {
          label: "z",
          content: "ZZZ",
          estimatedTokens: measure("ZZZ"),
        },
        {
          label: "a",
          content: "AAA",
          estimatedTokens: measure("AAA"),
        },
      ],
      prose: [],
    };
    const { compiledSpec } = new SpecificationCompilerImpl(measure).compile(
      input,
      toTokenCount(1_000_000),
    );
    expect(compiledSpec.indexOf("a\nAAA")).toBeLessThan(compiledSpec.indexOf("z\nZZZ"));
  });

  it("spec_compiler_prose_sorted_by_label", () => {
    const input: SpecificationInput = {
      types: [],
      codeBlocks: [],
      prose: [
        {
          label: "z",
          content: "ZZZ",
          estimatedTokens: measure("ZZZ"),
        },
        {
          label: "a",
          content: "AAA",
          estimatedTokens: measure("AAA"),
        },
      ],
    };
    const { compiledSpec } = new SpecificationCompilerImpl(measure).compile(
      input,
      toTokenCount(1_000_000),
    );
    expect(compiledSpec.indexOf("a\nAAA")).toBeLessThan(compiledSpec.indexOf("z\nZZZ"));
  });

  it("spec_compiler_budget_removes_code_before_prose", () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "T",
          path: toRelativePath("t/x.ts"),
          content: "",
          usage: "names-only",
          estimatedTokens: toTokenCount(1),
        },
      ],
      codeBlocks: [
        {
          label: "c",
          content: "<<<CODE>>>",
          estimatedTokens: toTokenCount(100),
        },
      ],
      prose: [
        {
          label: "p",
          content: "<<<PROSE>>>",
          estimatedTokens: toTokenCount(10),
        },
      ],
    };
    const impl = new SpecificationCompilerImpl(measure);
    const full = impl.compile(input, toTokenCount(1_000_000));
    expect(full.compiledSpec.includes("<<<CODE>>>")).toBe(true);
    expect(full.compiledSpec.includes("<<<PROSE>>>")).toBe(true);
    const L = [...full.compiledSpec].length;
    const first = Array.from({ length: L + 1 }, (_, i) => {
      const k = L - i;
      return { k, trial: impl.compile(input, toTokenCount(k)) };
    }).find(
      ({ trial }) =>
        trial.compiledSpec.includes("<<<PROSE>>>") &&
        !trial.compiledSpec.includes("<<<CODE>>>"),
    );
    if (first === undefined) {
      throw new ConfigError(
        "specification-compiler test: expected budget where prose remains and code drops",
      );
    }
    expect(first.trial.compiledSpec.includes("<<<PROSE>>>")).toBe(true);
    expect(first.trial.compiledSpec.includes("<<<CODE>>>")).toBe(false);
  });

  it("spec_compiler_budget_demotion_signature_before_code_drop", () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "A",
          path: toRelativePath("a/a.ts"),
          content: "export class A {}\nexport class B {}",
          usage: "implements",
          estimatedTokens: toTokenCount(50),
        },
        {
          name: "B",
          path: toRelativePath("b/b.ts"),
          content: "export class A {}\nexport class B {}",
          usage: "implements",
          estimatedTokens: toTokenCount(50),
        },
      ],
      codeBlocks: [
        {
          label: "cb",
          content: "KEEP_CODE_BLOCK",
          estimatedTokens: toTokenCount(5),
        },
      ],
      prose: [],
    };
    const impl = new SpecificationCompilerImpl(measure);
    const full = impl.compile(input, toTokenCount(1_000_000));
    expect(full.meta.typeTiers["A\u0000a/a.ts"]).toBe("verbatim");
    expect(full.meta.typeTiers["B\u0000b/b.ts"]).toBe("verbatim");
    const budget = toTokenCount(Math.max(0, [...full.compiledSpec].length - 1));
    const tight = impl.compile(input, budget);
    expect(tight.compiledSpec.includes("KEEP_CODE_BLOCK")).toBe(true);
    expect(
      tight.meta.typeTiers["A\u0000a/a.ts"] === "signature-path" ||
        tight.meta.typeTiers["B\u0000b/b.ts"] === "signature-path",
    ).toBe(true);
    expect(
      tight.meta.typeTiers["A\u0000a/a.ts"] === "verbatim" &&
        tight.meta.typeTiers["B\u0000b/b.ts"] === "verbatim",
    ).toBe(false);
  });
});
