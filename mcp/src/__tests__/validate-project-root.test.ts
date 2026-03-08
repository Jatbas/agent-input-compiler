// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { validateProjectRoot, validateConfigPath } from "../validate-project-root.js";

describe("validate-project-root", () => {
  it("validate_project_root_accepts_homedir_subpath", () => {
    const subpath = path.join(os.homedir(), "project", "aic-test");
    const result = validateProjectRoot(subpath);
    expect(result).toBe(path.resolve(subpath));
  });

  it("validate_project_root_rejects_escape", () => {
    const outside = path.join(os.homedir(), "..", "etc");
    expect(() => validateProjectRoot(outside)).toThrow(McpError);
    try {
      validateProjectRoot(outside);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
      expect((e as McpError).message).toContain("Invalid projectRoot");
    }
  });

  it("validate_project_root_rejects_sensitive_prefix", () => {
    expect(() => validateProjectRoot("/etc/foo")).toThrow(McpError);
    expect(() => validateProjectRoot("/usr/local")).toThrow(McpError);
    try {
      validateProjectRoot("/etc/foo");
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });

  it("validate_config_path_accepts_relative_under_project", () => {
    const projectRoot = validateProjectRoot(path.join(os.homedir(), "proj"));
    const result = validateConfigPath(".aic/config.json", projectRoot);
    expect(result).toBe(path.resolve(projectRoot, ".aic/config.json"));
  });

  it("validate_config_path_rejects_escape", () => {
    const projectRoot = validateProjectRoot(path.join(os.homedir(), "proj"));
    // Absolute path outside project (sensitive prefix)
    expect(() => validateConfigPath("/etc/passwd", projectRoot)).toThrow(McpError);
    try {
      validateConfigPath("/etc/passwd", projectRoot);
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });
});
