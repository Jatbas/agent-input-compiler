// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi } from "vitest";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { rethrowUnexpectedMcpToolError } from "../unexpected-mcp-tool-error.js";

describe("rethrowUnexpectedMcpToolError", () => {
  it("stderr_redacts_absolute_path_before_internal_mcp_error", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      rethrowUnexpectedMcpToolError(
        "chat_summary",
        new Error("boom /Users/example/leak/path"),
      );
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(McpError);
      expect((e as McpError).code).toBe(ErrorCode.InternalError);
    }
    const combined = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(combined).toContain("[path]");
    expect(combined).not.toContain("/Users/example/leak/path");
    stderrSpy.mockRestore();
  });
});
