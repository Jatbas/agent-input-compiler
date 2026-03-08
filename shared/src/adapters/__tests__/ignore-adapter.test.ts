// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { IgnoreAdapter } from "../ignore-adapter.js";
import { toAbsolutePath, toRelativePath } from "#core/types/paths.js";

describe("IgnoreAdapter", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("accepts when not ignored: path not in .gitignore returns true", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-ignore-test-"));
    writeFileSync(join(tmpDir, ".gitignore"), "node_modules/\n*.log\n");
    const root = toAbsolutePath(tmpDir);
    const adapter = new IgnoreAdapter();
    expect(adapter.accepts(toRelativePath("src/index.ts"), root)).toBe(true);
  });

  it("accepts when ignored: path matching .gitignore returns false", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-ignore-test-"));
    writeFileSync(join(tmpDir, ".gitignore"), "node_modules/\n*.log\n");
    const root = toAbsolutePath(tmpDir);
    const adapter = new IgnoreAdapter();
    expect(adapter.accepts(toRelativePath("node_modules/foo/index.js"), root)).toBe(
      false,
    );
  });

  it("missing .gitignore: all paths accepted", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-ignore-test-"));
    const root = toAbsolutePath(tmpDir);
    const adapter = new IgnoreAdapter();
    expect(adapter.accepts(toRelativePath("src/index.ts"), root)).toBe(true);
    expect(adapter.accepts(toRelativePath("any/path/here.ts"), root)).toBe(true);
  });
});
