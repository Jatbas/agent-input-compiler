// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CompileSpecRequestSchema } from "../compile-spec-request.schema.js";

const parser = z.object(CompileSpecRequestSchema);

describe("CompileSpecRequestSchema", () => {
  it("accepts minimal valid payload", () => {
    const result = parser.safeParse({
      spec: { types: [], codeBlocks: [], prose: [] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid SpecTypeUsage", () => {
    const result = parser.safeParse({
      spec: {
        types: [
          {
            name: "n",
            path: "p",
            content: "c",
            usage: "invalid-usage",
            estimatedTokens: 0,
          },
        ],
        codeBlocks: [],
        prose: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversize budget", () => {
    const result = parser.safeParse({
      spec: { types: [], codeBlocks: [], prose: [] },
      budget: 2_000_001,
    });
    expect(result.success).toBe(false);
  });
});
