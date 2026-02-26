import { describe, it, expect } from "vitest";
import { InspectArgsSchema } from "../inspect-args.js";

describe("InspectArgsSchema", () => {
  it("valid_object_parses_successfully", () => {
    const valid = {
      intent: "inspect dependencies",
      projectRoot: "/tmp/proj",
      configPath: null as string | null,
      dbPath: null as string | null,
    };
    const result = InspectArgsSchema.parse(valid);
    expect(result.intent).toBe(valid.intent);
    expect(result.projectRoot).toBe(valid.projectRoot);
    expect(result.configPath).toBe(valid.configPath);
    expect(result.dbPath).toBe(valid.dbPath);
  });

  it("missing_intent_throws", () => {
    const withoutIntent = { projectRoot: "/tmp", configPath: null, dbPath: null };
    const out1 = InspectArgsSchema.safeParse(withoutIntent);
    expect(out1.success).toBe(false);
    const emptyIntent = {
      intent: "",
      projectRoot: "/tmp",
      configPath: null,
      dbPath: null,
    };
    const out2 = InspectArgsSchema.safeParse(emptyIntent);
    expect(out2.success).toBe(false);
  });
});
