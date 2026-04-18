// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { buildSpecCompileCachePreimage } from "../build-spec-compile-cache-preimage.js";
import type { SpecificationInput } from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";

describe("buildSpecCompileCachePreimage", () => {
  it("preimage_order", () => {
    const typeA = {
      name: "Alpha",
      path: toRelativePath("src/a.ts"),
      content: "alpha",
      usage: "implements" as const,
      estimatedTokens: toTokenCount(3),
    };
    const typeB = {
      name: "Beta",
      path: toRelativePath("src/b.ts"),
      content: "beta",
      usage: "names-only" as const,
      estimatedTokens: toTokenCount(7),
    };
    const shared: Pick<SpecificationInput, "codeBlocks" | "prose"> = {
      codeBlocks: [
        {
          label: "cb1",
          content: "code",
          estimatedTokens: toTokenCount(11),
        },
      ],
      prose: [
        {
          label: "pr1",
          content: "prose",
          estimatedTokens: toTokenCount(13),
        },
      ],
    };
    const first: SpecificationInput = { types: [typeA, typeB], ...shared };
    const second: SpecificationInput = { types: [typeB, typeA], ...shared };
    const budget = toTokenCount(5000);
    expect(buildSpecCompileCachePreimage(first, budget)).toBe(
      buildSpecCompileCachePreimage(second, budget),
    );
  });

  it("preimage_budget", () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "Only",
          path: toRelativePath("only.ts"),
          content: "c",
          usage: "constructs" as const,
          estimatedTokens: toTokenCount(2),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    expect(buildSpecCompileCachePreimage(input, toTokenCount(10))).not.toBe(
      buildSpecCompileCachePreimage(input, toTokenCount(20)),
    );
  });
});
