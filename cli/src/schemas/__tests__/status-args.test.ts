import { describe, it, expect } from "vitest";
import { StatusArgsSchema } from "../status-args.js";

describe("StatusArgsSchema", () => {
  it("valid_object_parses_successfully", () => {
    const valid = {
      projectRoot: "/tmp/proj",
      configPath: null as string | null,
      dbPath: null as string | null,
    };
    const result = StatusArgsSchema.parse(valid);
    expect(result.projectRoot).toBe(valid.projectRoot);
    expect(result.configPath).toBe(valid.configPath);
    expect(result.dbPath).toBe(valid.dbPath);
  });

  it("missing_project_root_throws", () => {
    const withoutRoot = { configPath: null, dbPath: null };
    const out1 = StatusArgsSchema.safeParse(withoutRoot);
    expect(out1.success).toBe(false);
    const emptyRoot = { projectRoot: "", configPath: null, dbPath: null };
    const out2 = StatusArgsSchema.safeParse(emptyRoot);
    expect(out2.success).toBe(false);
  });
});
