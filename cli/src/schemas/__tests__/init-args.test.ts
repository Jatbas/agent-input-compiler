import { describe, it, expect } from "vitest";
import { InitArgsSchema } from "../init-args.js";

describe("InitArgsSchema", () => {
  it("empty_object_defaults_upgrade_false", () => {
    const result = InitArgsSchema.parse({});
    expect(result.upgrade).toBe(false);
  });

  it("upgrade_true_parses", () => {
    const result = InitArgsSchema.parse({ upgrade: true });
    expect(result.upgrade).toBe(true);
  });
});
