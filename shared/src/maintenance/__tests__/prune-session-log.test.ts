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
import { pruneSessionLog } from "../prune-session-log.js";

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

describe("pruneSessionLog", () => {
  let tmpDir: string;
  let projectRoot: ReturnType<typeof toAbsolutePath>;

  afterEach(() => {
    if (tmpDir !== undefined) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("removes lines older than 24 hours", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-prune-session-"));
    const aicDir = join(tmpDir, ".aic");
    mkdirSync(aicDir, { recursive: true });
    const logPath = join(aicDir, "session-log.jsonl");
    writeFileSync(
      logPath,
      [
        '{"session_id":"a","reason":"user_close","duration_ms":0,"timestamp":"2026-03-08T12:00:00.000Z"}',
        '{"session_id":"b","reason":"user_close","duration_ms":0,"timestamp":"2026-03-09T12:00:00.000Z"}',
        '{"session_id":"c","reason":"user_close","duration_ms":0,"timestamp":"2026-03-10T11:00:00.000Z"}',
      ].join("\n") + "\n",
      "utf8",
    );
    projectRoot = toAbsolutePath(tmpDir);
    pruneSessionLog(projectRoot, stubClock());
    const out = readFileSync(logPath, "utf8").trim().split("\n");
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('"session_id":"b"');
    expect(out[1]).toContain('"session_id":"c"');
  });

  it("does nothing when file does not exist", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-prune-session-"));
    projectRoot = toAbsolutePath(tmpDir);
    expect(() => pruneSessionLog(projectRoot, stubClock())).not.toThrow();
  });

  it("empties file when all lines are old", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "aic-prune-session-"));
    const aicDir = join(tmpDir, ".aic");
    mkdirSync(aicDir, { recursive: true });
    const logPath = join(aicDir, "session-log.jsonl");
    writeFileSync(
      logPath,
      '{"session_id":"a","reason":"user_close","duration_ms":0,"timestamp":"2026-03-07T12:00:00.000Z"}\n',
      "utf8",
    );
    projectRoot = toAbsolutePath(tmpDir);
    pruneSessionLog(projectRoot, stubClock());
    expect(readFileSync(logPath, "utf8")).toBe("");
  });
});
