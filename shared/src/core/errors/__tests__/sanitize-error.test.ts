// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { sanitizeError } from "../sanitize-error.js";
import { AicError } from "../aic-error.js";
import { ConfigError } from "../config-error.js";

describe("sanitizeError", () => {
  it("returns code and message for AicError subclass", () => {
    const err = new ConfigError("invalid json");
    const out = sanitizeError(err);
    expect(out.code).toBe("CONFIG_INVALID");
    expect(out.message).toBe("invalid json");
  });

  it("strips absolute paths from message", () => {
    const err = new AicError("Failed at /home/user/project/file.ts", "ERR");
    const out = sanitizeError(err);
    expect(out.message).toContain("[path]");
    expect(out.message).not.toContain("/home/user");
  });

  it("returns INTERNAL_ERROR for non-AicError", () => {
    const out = sanitizeError(new Error("generic"));
    expect(out.code).toBe("INTERNAL_ERROR");
    expect(out.message).toBe("generic");
  });

  it("returns safe message for unknown throw", () => {
    const out = sanitizeError("string thrown");
    expect(out.code).toBe("INTERNAL_ERROR");
    expect(out.message).toBe("An unexpected error occurred.");
  });
});
