// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { EnvExampleRedactor } from "../env-example-redactor.js";
import { toRelativePath } from "@jatbas/aic-shared/core/types/paths.js";
import { INCLUSION_TIER } from "@jatbas/aic-shared/core/types/enums.js";

describe("EnvExampleRedactor", () => {
  it("env_example_values_redacted", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath("config/.env.example");
    const content = "DB_HOST=localhost\nDB_PORT=5432\nAPI_KEY=secret123";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("DB_HOST=***\nDB_PORT=***\nAPI_KEY=***");
  });

  it("env_sample_values_redacted", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath(".env.sample");
    const content = "KEY=value";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("KEY=***");
  });

  it("env_template_values_redacted", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath("deploy/.env.template");
    const content = "HOST=0.0.0.0";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("HOST=***");
  });

  it("comment_lines_preserved", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath(".env.example");
    const content = "# Database config\nDB_HOST=localhost\n\n# API\nAPI_KEY=secret";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("# Database config\nDB_HOST=***\n\n# API\nAPI_KEY=***");
  });

  it("export_prefix_redacted", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath(".env.example");
    const content = "export DB_HOST=localhost\nexport API_KEY=secret";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("export DB_HOST=***\nexport API_KEY=***");
  });

  it("quoted_values_redacted", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath(".env.example");
    const content = "KEY=\"quoted value\"\nOTHER='single quoted'";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("KEY=***\nOTHER=***");
  });

  it("non_env_example_path_unchanged", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath("src/index.ts");
    const content = "DB_HOST=localhost";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("empty_content_returns_unchanged", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath(".env.example");
    const content = "";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("");
  });

  it("env_local_example_path_matched", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath(".env.local.example");
    const content = "KEY=val";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe("KEY=***");
  });

  it("safety_python_indentation_preserved", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath("src/main.py");
    const content = "def f():\n  pass";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("safety_yaml_structure_unchanged", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath("config.yml");
    const content = "key:\n  nested: 1";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });

  it("safety_jsx_structure_unchanged", () => {
    const transformer = new EnvExampleRedactor();
    const filePath = toRelativePath("src/App.tsx");
    const content = "<div>x</div>";
    const result = transformer.transform(content, INCLUSION_TIER.L0, filePath);
    expect(result).toBe(content);
  });
});
