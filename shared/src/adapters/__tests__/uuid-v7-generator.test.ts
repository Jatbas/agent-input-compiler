// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { SystemClock } from "../system-clock.js";
import { UuidV7Generator } from "../uuid-v7-generator.js";

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("UuidV7Generator", () => {
  it("returns a string matching UUID v7 format", () => {
    const gen = new UuidV7Generator(new SystemClock());
    const id = gen.generate();
    expect(typeof id).toBe("string");
    expect(id).toMatch(UUID_V7_REGEX);
  });

  it("generates distinct IDs across calls", () => {
    const gen = new UuidV7Generator(new SystemClock());
    const a = gen.generate();
    const b = gen.generate();
    expect(a).not.toBe(b);
  });
});
