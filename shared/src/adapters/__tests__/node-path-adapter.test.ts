// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import path from "node:path";
import { describe, it, expect } from "vitest";
import { NodePathAdapter } from "../node-path-adapter.js";

describe("NodePathAdapter", () => {
  const adapter = new NodePathAdapter();

  it("trailing_slash_stripped", () => {
    const withTrailing = path.sep === "\\" ? "C:\\foo\\bar\\" : "/foo/bar/";
    const result = adapter.normalise(withTrailing);
    const s = String(result);
    const isRoot = s === "/" || (path.sep === "\\" && /^[a-z]:\\$/.test(s));
    expect(isRoot || !s.endsWith(path.sep)).toBe(true);
  });

  describe.skipIf(process.platform !== "win32")("windows_drive_lowercased", () => {
    it("windows_drive_lowercased", () => {
      const result = adapter.normalise("C:\\project");
      expect(String(result).startsWith("c:\\")).toBe(true);
    });
  });

  it("already_normalised_unchanged", () => {
    const input = path.sep === "\\" ? "C:\\already\\normal" : "/already/normal";
    const a = adapter.normalise(input);
    const b = adapter.normalise(input);
    expect(a).toBe(b);
  });

  it("root_path_not_stripped", () => {
    expect(adapter.normalise("/")).toBe("/");
    if (path.sep === "\\") {
      expect(adapter.normalise("C:\\")).toBe("c:\\");
    }
  });

  describe.skipIf(process.platform === "win32")("posix_no_op", () => {
    it("posix_no_op", () => {
      const result = adapter.normalise("/home/proj");
      expect(String(result)).toBe("/home/proj");
    });
  });
});
