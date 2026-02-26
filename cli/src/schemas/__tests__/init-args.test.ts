import { describe, it, expect } from "vitest";
import { InitArgsSchema } from "../init-args.js";

describe("InitArgsSchema", () => {
  it("empty_object_defaults_upgrade_false", () => {
    const result = InitArgsSchema.parse({
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
    });
    expect(result.upgrade).toBe(false);
  });

  it("upgrade_true_parses", () => {
    const result = InitArgsSchema.parse({
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
      upgrade: true,
    });
    expect(result.upgrade).toBe(true);
  });

  it("projectRoot_required_missing_or_empty_fails", () => {
    expect(InitArgsSchema.safeParse({}).success).toBe(false);
    expect(InitArgsSchema.safeParse({ projectRoot: "" }).success).toBe(false);
  });
});
