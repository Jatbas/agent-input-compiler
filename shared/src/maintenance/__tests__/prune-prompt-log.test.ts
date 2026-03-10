// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach } from "vitest";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toAbsolutePath } from "@jatbas/aic-core/core/types/paths.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { prunePromptLog } from "../prune-prompt-log.js";

const NOW = "2026-03-10T12:00:00.000Z";
const CUTOFF = "2026-03-09T12:00:00.000Z";

function stubClock(): Clock {
  return {
    now(): ISOTimestamp {
      return NOW as ISOTimestamp;
    },
    addMinutes(minutes: number): ISOTimestamp {
      return minutes === -24 * 60 ? (CUTOFF as ISOTimestamp) : (NOW as ISOTimestamp);
    },
    durationMs(): ReturnType<Clock["durationMs"]> {
      return toMilliseconds(0);
    },
  };
}

describe("prunePromptLog", () => {
  let tmpDir: string;
  let projectRoot: ReturnType<typeof toAbsolutePath>;

  afterEach(() => {
    if (tmpDir !== undefined) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes lines older than 24 hours", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-prune-prompt-"));
    const aicDir = join(tmpDir, ".aic");
    mkdirSync(aicDir, { recursive: true });
    const logPath = join(aicDir, "prompt-log.jsonl");
    writeFileSync(
      logPath,
      [
        '{"conversationId":"a","generationId":"1","title":"old","model":"","timestamp":"2026-03-08T12:00:00.000Z"}',
        '{"conversationId":"b","generationId":"2","title":"at cutoff","model":"","timestamp":"2026-03-09T12:00:00.000Z"}',
        '{"conversationId":"c","generationId":"3","title":"recent","model":"","timestamp":"2026-03-10T11:00:00.000Z"}',
      ].join("\n") + "\n",
      "utf8",
    );
    projectRoot = toAbsolutePath(tmpDir);
    prunePromptLog(projectRoot, stubClock());
    const out = readFileSync(logPath, "utf8").trim().split("\n");
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('"generationId":"2"');
    expect(out[1]).toContain('"generationId":"3"');
  });

  it("does nothing when file does not exist", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-prune-prompt-"));
    projectRoot = toAbsolutePath(tmpDir);
    expect(() => prunePromptLog(projectRoot, stubClock())).not.toThrow();
  });

  it("empties file when all lines are old", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-prune-prompt-"));
    const aicDir = join(tmpDir, ".aic");
    mkdirSync(aicDir, { recursive: true });
    const logPath = join(aicDir, "prompt-log.jsonl");
    writeFileSync(
      logPath,
      '{"conversationId":"a","generationId":"1","title":"old","model":"","timestamp":"2026-03-07T12:00:00.000Z"}\n',
      "utf8",
    );
    projectRoot = toAbsolutePath(tmpDir);
    prunePromptLog(projectRoot, stubClock());
    expect(readFileSync(logPath, "utf8")).toBe("");
  });
});
