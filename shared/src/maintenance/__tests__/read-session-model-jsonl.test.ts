// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi, beforeEach } from "vitest";

const sessionModelsJsonlFullReadPaths = vi.hoisted((): string[] => []);

vi.mock("node:fs", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  const origReadFileSync = mod["readFileSync"] as (
    path: unknown,
    options?: unknown,
  ) => string | Buffer;
  return {
    ...mod,
    readFileSync(path: unknown, options?: unknown): string | Buffer {
      if (String(path).endsWith("session-models.jsonl")) {
        sessionModelsJsonlFullReadPaths.push(String(path));
      }
      return origReadFileSync(path, options);
    },
  };
});

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { readSessionModelIdFromSessionModelsJsonl } from "../read-session-model-jsonl.js";
import { selectSessionModelIdFromJsonlContent } from "../select-session-model-from-jsonl.js";

const cursor = "cursor";

beforeEach(() => {
  sessionModelsJsonlFullReadPaths.length = 0;
});

describe("readSessionModelIdFromSessionModelsJsonl", () => {
  it("returns null when file is missing", () => {
    const dir = path.join(os.tmpdir(), `aic-read-jsonl-missing-${process.pid}`);
    expect(
      readSessionModelIdFromSessionModelsJsonl(toAbsolutePath(dir), "c1", cursor),
    ).toBeNull();
  });

  it("does not call readFileSync when conversation match is inside tail", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-read-jsonl-tail-"));
    const aicDir = path.join(dir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const filePath = path.join(aicDir, "session-models.jsonl");
    const row = JSON.stringify({
      m: "model-in-tail",
      c: "conv-tail",
      e: cursor,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    fs.writeFileSync(filePath, `${row}\n`, "utf8");
    try {
      const got = readSessionModelIdFromSessionModelsJsonl(
        toAbsolutePath(dir),
        "conv-tail",
        cursor,
      );
      expect(got).toBe("model-in-tail");
      expect(sessionModelsJsonlFullReadPaths).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to full read when conversation match exists only above tail window", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aic-read-jsonl-fallback-"));
    const aicDir = path.join(dir, ".aic");
    fs.mkdirSync(aicDir, { recursive: true, mode: 0o700 });
    const filePath = path.join(aicDir, "session-models.jsonl");
    const wanted = JSON.stringify({
      m: "model-prefix",
      c: "conv-only-prefix",
      e: cursor,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    const filler = `${JSON.stringify({
      m: "other",
      c: "other-conv",
      e: cursor,
      timestamp: "2026-01-02T00:00:00.000Z",
    })}\n`.repeat(8000);
    fs.writeFileSync(filePath, `${wanted}\n${filler}`, "utf8");
    try {
      const rawFull = fs.readFileSync(filePath, "utf8");
      const expected = selectSessionModelIdFromJsonlContent(
        rawFull,
        "conv-only-prefix",
        cursor,
      );
      sessionModelsJsonlFullReadPaths.length = 0;
      const got = readSessionModelIdFromSessionModelsJsonl(
        toAbsolutePath(dir),
        "conv-only-prefix",
        cursor,
      );
      expect(got).toBe(expected);
      expect(got).toBe("model-prefix");
      expect(sessionModelsJsonlFullReadPaths.length).toBeGreaterThanOrEqual(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
