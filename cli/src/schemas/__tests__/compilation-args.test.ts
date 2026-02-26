import { describe, it, expect } from "vitest";
import { CompilationArgsSchema } from "../compilation-args";

describe("CompilationArgsSchema", () => {
  it("valid_object_parses_successfully", () => {
    const valid = {
      intent: "summarize the codebase",
      projectRoot: "/tmp/proj",
      configPath: null as string | null,
      dbPath: null as string | null,
    };
    const result = CompilationArgsSchema.parse(valid);
    expect(result.intent).toBe(valid.intent);
    expect(result.projectRoot).toBe(valid.projectRoot);
    expect(result.configPath).toBe(valid.configPath);
    expect(result.dbPath).toBe(valid.dbPath);
  });

  it("missing_intent_throws", () => {
    const withoutIntent = { projectRoot: "/tmp", configPath: null, dbPath: null };
    const out1 = CompilationArgsSchema.safeParse(withoutIntent);
    expect(out1.success).toBe(false);
    const emptyIntent = {
      intent: "",
      projectRoot: "/tmp",
      configPath: null,
      dbPath: null,
    };
    const out2 = CompilationArgsSchema.safeParse(emptyIntent);
    expect(out2.success).toBe(false);
  });

  it("intent_over_max_throws", () => {
    const overMax = {
      intent: "x".repeat(10_001),
      projectRoot: "/tmp",
      configPath: null,
      dbPath: null,
    };
    const out = CompilationArgsSchema.safeParse(overMax);
    expect(out.success).toBe(false);
  });
});
