// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { matchesGlob } from "../glob-match.js";

describe("matchesGlob", () => {
  it("matches_glob_nested_suffix_star", () => {
    const rows = [
      { path: "file.ts", pattern: "**/*.ts" },
      { path: "a/file.ts", pattern: "**/*.ts" },
      { path: "a/b/file.ts", pattern: "**/*.ts" },
      { path: "notes.md", pattern: "**/*.md" },
      { path: "a/notes.md", pattern: "**/*.md" },
      { path: "a/b/notes.md", pattern: "**/*.md" },
    ];
    rows.forEach((row) => {
      expect(matchesGlob(row.path, row.pattern)).toBe(true);
    });
  });
});
