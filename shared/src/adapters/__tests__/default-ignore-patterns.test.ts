// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { DEFAULT_NEGATIVE_PATTERNS } from "../default-ignore-patterns.js";

describe("default-ignore-patterns", () => {
  it("default_ignore_patterns_non_empty_and_contains_required", () => {
    expect(DEFAULT_NEGATIVE_PATTERNS.length).toBeGreaterThan(0);
    const has = (sub: string): boolean =>
      DEFAULT_NEGATIVE_PATTERNS.some((p) => p.includes(sub));
    expect(has("node_modules")).toBe(true);
    expect(has(".git")).toBe(true);
    expect(has(".aic")).toBe(true);
    expect(has("__pycache__")).toBe(true);
    expect(has("target")).toBe(true);
    expect(has(".gradle") || has(".m2")).toBe(true);
    expect(has("vendor")).toBe(true);
    expect(has("Pods")).toBe(true);
    expect(has(".dart_tool") || has(".pub-cache")).toBe(true);
    expect(has(".venv") || has("venv")).toBe(true);
  });
});
