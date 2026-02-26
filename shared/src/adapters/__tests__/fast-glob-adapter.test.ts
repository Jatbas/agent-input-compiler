import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import { FastGlobAdapter } from "../fast-glob-adapter.js";
import { toAbsolutePath } from "#core/types/paths.js";

describe("FastGlobAdapter", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("find empty patterns returns []", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    const cwd = toAbsolutePath(tmpDir);
    const adapter = new FastGlobAdapter();
    expect(adapter.find([], cwd)).toEqual([]);
  });

  it("find matching pattern returns relative paths under cwd", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    writeFileSync(join(tmpDir, "a.ts"), "");
    writeFileSync(join(tmpDir, "b.js"), "");
    const cwd = toAbsolutePath(tmpDir);
    const adapter = new FastGlobAdapter();
    const result = adapter.find(["**/*.ts"], cwd);
    expect(result).toContainEqual("a.ts");
    expect(result).toHaveLength(1);
  });

  it("find with negation excludes matching files", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    writeFileSync(join(tmpDir, "include.ts"), "");
    writeFileSync(join(tmpDir, "exclude.ts"), "");
    const cwd = toAbsolutePath(tmpDir);
    const adapter = new FastGlobAdapter();
    const result = adapter.find(["**/*.ts", "!**/exclude.ts"], cwd);
    expect(result).toContainEqual("include.ts");
    expect(result).not.toContainEqual("exclude.ts");
    expect(result).toHaveLength(1);
  });

  it("find deterministic: same input gives same output order across calls", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    writeFileSync(join(tmpDir, "a.ts"), "");
    writeFileSync(join(tmpDir, "b.ts"), "");
    const cwd = toAbsolutePath(tmpDir);
    const adapter = new FastGlobAdapter();
    const first = adapter.find(["**/*.ts"], cwd);
    const second = adapter.find(["**/*.ts"], cwd);
    expect(first).toEqual(second);
  });

  it("find non-existent cwd propagates error", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-glob-test-"));
    const filePath = join(tmpDir, "a.ts");
    writeFileSync(filePath, "");
    const adapter = new FastGlobAdapter();
    const cwd = toAbsolutePath(filePath);
    expect(() => adapter.find(["**/*.ts"], cwd)).toThrow();
  });
});
