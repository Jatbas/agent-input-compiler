// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { toTokenCount, toAbsolutePath, toISOTimestamp, toPercentage } from "../index.js";
import type { TokenCount, AbsolutePath, ISOTimestamp, Percentage } from "../index.js";

describe("branded types", () => {
  it("preserves the underlying value for numeric brands", () => {
    const tokens: TokenCount = toTokenCount(42);
    expect(tokens).toBe(42);
    expect(typeof tokens).toBe("number");
  });

  it("preserves the underlying value for string brands", () => {
    const path: AbsolutePath = toAbsolutePath("/usr/local/bin");
    expect(path).toBe("/usr/local/bin");
    expect(typeof path).toBe("string");
  });

  it("preserves ISO timestamp strings", () => {
    const ts: ISOTimestamp = toISOTimestamp("2026-02-23T12:00:00.000Z");
    expect(ts).toBe("2026-02-23T12:00:00.000Z");
  });

  it("preserves percentage values", () => {
    const pct: Percentage = toPercentage(0.825);
    expect(pct).toBe(0.825);
  });

  it("branded types are assignable back to their base type", () => {
    const tokens: TokenCount = toTokenCount(100);
    const raw: number = tokens;
    expect(raw).toBe(100);
  });
});
