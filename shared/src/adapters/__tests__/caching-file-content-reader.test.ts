// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCachingFileContentReader } from "../caching-file-content-reader.js";
import { toAbsolutePath, toRelativePath } from "@jatbas/aic-core/core/types/paths.js";

type ReadFileFirstArg = Parameters<typeof fs.promises.readFile>[0];

function mockReadFileByBasename(pathArg: ReadFileFirstArg): Promise<string> {
  return Promise.resolve(`content of ${path.basename(String(pathArg))}`);
}

describe("createCachingFileContentReader", () => {
  const projectRoot = toAbsolutePath("/tmp");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cache_hit_returns_cached_content", async () => {
    const statSpy = vi
      .spyOn(fs.promises, "stat")
      .mockResolvedValue({ mtimeMs: 1000 } as fs.Stats);
    const readFileSpy = vi
      .spyOn(fs.promises, "readFile")
      .mockResolvedValue("content of a.ts");
    const reader = createCachingFileContentReader(projectRoot);
    const pathRel = toRelativePath("a.ts");
    const first = await reader.getContent(pathRel);
    const second = await reader.getContent(pathRel);
    expect(first).toBe("content of a.ts");
    expect(second).toBe("content of a.ts");
    expect(readFileSpy).toHaveBeenCalledTimes(1);
    expect(readFileSpy).toHaveBeenCalledWith(path.join("/tmp", "a.ts"), "utf8");
    statSpy.mockRestore();
    readFileSpy.mockRestore();
  });

  it("cache_miss_reads_file", async () => {
    const statSpy = vi
      .spyOn(fs.promises, "stat")
      .mockResolvedValue({ mtimeMs: 2000 } as fs.Stats);
    const readFileSpy = vi
      .spyOn(fs.promises, "readFile")
      .mockResolvedValue("content of b.ts");
    const reader = createCachingFileContentReader(projectRoot);
    const pathRel = toRelativePath("b.ts");
    const content = await reader.getContent(pathRel);
    expect(content).toBe("content of b.ts");
    expect(readFileSpy).toHaveBeenCalledWith(path.join("/tmp", "b.ts"), "utf8");
    statSpy.mockRestore();
    readFileSpy.mockRestore();
  });

  it("eviction_when_over_cap", async () => {
    const statSpy = vi
      .spyOn(fs.promises, "stat")
      .mockResolvedValue({ mtimeMs: 3000 } as fs.Stats);
    const readFileSpy = vi
      .spyOn(fs.promises, "readFile")
      .mockImplementation(mockReadFileByBasename);
    const reader = createCachingFileContentReader(projectRoot, { maxEntries: 2 });
    await reader.getContent(toRelativePath("a.ts"));
    await reader.getContent(toRelativePath("b.ts"));
    await reader.getContent(toRelativePath("c.ts"));
    expect(readFileSpy).toHaveBeenCalledTimes(3);
    readFileSpy.mockClear();
    await reader.getContent(toRelativePath("a.ts"));
    expect(readFileSpy).toHaveBeenCalledTimes(1);
    expect(readFileSpy).toHaveBeenCalledWith(path.join("/tmp", "a.ts"), "utf8");
    statSpy.mockRestore();
    readFileSpy.mockRestore();
  });

  it("touch_on_hit_moves_to_end", async () => {
    const statSpy = vi
      .spyOn(fs.promises, "stat")
      .mockResolvedValue({ mtimeMs: 4000 } as fs.Stats);
    const readFileSpy = vi
      .spyOn(fs.promises, "readFile")
      .mockImplementation(mockReadFileByBasename);
    const reader = createCachingFileContentReader(projectRoot, { maxEntries: 2 });
    const pathA = toRelativePath("a.ts");
    const pathB = toRelativePath("b.ts");
    const pathC = toRelativePath("c.ts");
    await reader.getContent(pathA);
    await reader.getContent(pathB);
    await reader.getContent(pathA);
    await reader.getContent(pathC);
    readFileSpy.mockClear();
    const contentA = await reader.getContent(pathA);
    expect(readFileSpy).toHaveBeenCalledTimes(0);
    expect(contentA).toBe("content of a.ts");
    const contentB = await reader.getContent(pathB);
    expect(readFileSpy).toHaveBeenCalledTimes(1);
    expect(contentB).toBe("content of b.ts");
    statSpy.mockRestore();
    readFileSpy.mockRestore();
  });
});
