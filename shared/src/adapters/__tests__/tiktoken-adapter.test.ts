// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi } from "vitest";
import { AicError } from "@jatbas/aic-shared/core/errors/aic-error.js";
import { TiktokenAdapter } from "../tiktoken-adapter.js";
import { toTokenCount } from "@jatbas/aic-shared/core/types/units.js";

describe("TiktokenAdapter", () => {
  it("countTokens returns a TokenCount", () => {
    const adapter = new TiktokenAdapter();
    const result = adapter.countTokens("hello world");
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it("countTokens empty: empty string returns 0", () => {
    const adapter = new TiktokenAdapter();
    expect(adapter.countTokens("")).toEqual(toTokenCount(0));
  });

  it("countTokens non-empty: returns positive TokenCount", () => {
    const adapter = new TiktokenAdapter();
    const result = adapter.countTokens("hello world");
    expect(result).toBeGreaterThan(0);
  });

  it("countTokens deterministic: same input gives same output", () => {
    const adapter = new TiktokenAdapter();
    const text = "hello world";
    expect(adapter.countTokens(text)).toEqual(adapter.countTokens(text));
  });

  it("fallback: when tiktoken throws, returns word_count * 1.3 via toTokenCount", async () => {
    vi.resetModules();
    vi.doMock("tiktoken", () => ({
      encoding_for_model: () => {
        throw new AicError("tiktoken unavailable", "TEST_SETUP");
      },
    }));
    const { TiktokenAdapter: TiktokenAdapterMocked } =
      await import("../tiktoken-adapter.js");
    const adapter = new TiktokenAdapterMocked();
    // "one two three" -> wordCount 3, 3 * 1.3 = 3.9, ceil = 4
    expect(adapter.countTokens("one two three")).toEqual(toTokenCount(4));
  });
});
