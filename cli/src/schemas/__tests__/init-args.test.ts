import { describe, it, expect } from "vitest";
import { InitArgsSchema } from "../init-args.js";

describe("InitArgsSchema", () => {
  it("parses_valid_args", () => {
    const result = InitArgsSchema.parse({
      projectRoot: "/tmp/proj",
      configPath: null,
      dbPath: null,
    });
    expect(result.projectRoot).toBe("/tmp/proj");
  });

  it("projectRoot_required_missing_or_empty_fails", () => {
    expect(InitArgsSchema.safeParse({}).success).toBe(false);
    expect(InitArgsSchema.safeParse({ projectRoot: "" }).success).toBe(false);
  });
});
