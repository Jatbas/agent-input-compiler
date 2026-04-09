// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { STUB_COMPILATION_META } from "@jatbas/aic-core/testing/stub-compilation-meta.js";
import {
  AicCompileSpecStructuredContentSchema,
  AicCompileStructuredContentSchema,
} from "../compile-tool-outputs.schema.js";

describe("compile-tool-outputs.schema", () => {
  it("aic_compile_reparent_parses", () => {
    const parsed = AicCompileStructuredContentSchema.parse({
      reparented: true,
      rowsUpdated: 3,
    });
    expect(parsed).toEqual({ reparented: true, rowsUpdated: 3 });
  });

  it("aic_compile_disabled_empty_meta_parses", () => {
    const parsed = AicCompileStructuredContentSchema.parse({
      compiledPrompt: "disabled message",
      meta: {},
      conversationId: null,
    });
    expect(parsed).toEqual(
      expect.objectContaining({
        compiledPrompt: "disabled message",
        meta: {},
        conversationId: null,
      }),
    );
  });

  it("aic_compile_success_stub_meta_parses", () => {
    const fixture = {
      compiledPrompt: "compiled body",
      meta: { ...STUB_COMPILATION_META, guard: null },
      conversationId: null,
      updateMessage: null,
    };
    const parsed = AicCompileStructuredContentSchema.parse(fixture);
    expect(parsed).toEqual(
      expect.objectContaining({
        compiledPrompt: "compiled body",
        conversationId: null,
        updateMessage: null,
        meta: expect.objectContaining({ guard: null }),
      }),
    );
  });

  it("aic_compile_spec_success_parses", () => {
    const parsed = AicCompileSpecStructuredContentSchema.parse({
      compiledSpec: "stub",
      meta: {
        totalTokensRaw: 10,
        totalTokensCompiled: 0,
        reductionPct: 0,
        typeTiers: { "T\u0000p.ts": "verbatim" },
        transformTokensSaved: 0,
      },
    });
    expect(parsed).toMatchObject({ compiledSpec: "stub" });
  });

  it("aic_compile_spec_validation_error_parses", () => {
    const parsed = AicCompileSpecStructuredContentSchema.parse({
      error: "Invalid aic_compile_spec request",
      code: "validation-error",
    });
    expect(parsed).toEqual({
      error: "Invalid aic_compile_spec request",
      code: "validation-error",
    });
  });
});
