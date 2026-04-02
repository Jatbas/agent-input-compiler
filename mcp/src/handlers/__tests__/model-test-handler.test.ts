// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, beforeEach } from "vitest";
import { createModelTestHandler } from "../model-test-handler.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";

function makeClock(nowValue: string, durationResult: number): Clock {
  const nowTs = (): ISOTimestamp => toISOTimestamp(nowValue);
  return {
    now: nowTs,
    addMinutes: (_minutes: number): ISOTimestamp => nowTs(),
    durationMs: (): ReturnType<typeof toMilliseconds> => toMilliseconds(durationResult),
  };
}

function makeDb(embedFound: boolean): ExecutableDb {
  return {
    exec: (): void => {},
    prepare: (): { run: () => void; get: () => unknown; all: () => unknown[] } => ({
      run: (): void => {},
      get: (): unknown => (embedFound ? { 1: 1 } : undefined),
      all: (): unknown[] => [],
    }),
  };
}

function parseResult(result: unknown): Record<string, unknown> {
  const r = result as { content: readonly { text: string }[] };
  const first = r.content[0];
  if (first === undefined) {
    throw new ConfigError("model-test-handler test: expected tool result content");
  }
  return JSON.parse(first.text) as Record<string, unknown>;
}

function parseAnswer(challenge: unknown, type: string): string {
  const c = challenge as { type: string; question: string };
  if (c.type !== type) return "";
  if (type === "arithmetic") {
    const m = /(\d+) \+ (\d+)/.exec(c.question);
    if (m?.[1] !== undefined && m[2] !== undefined) {
      return String(Number(m[1]) + Number(m[2]));
    }
  }
  if (type === "string-reverse") {
    const m = /"([A-Z]+)"/.exec(c.question);
    if (m?.[1] !== undefined) {
      return [...m[1]].toReversed().join("");
    }
  }
  return "";
}

describe("model-test-handler", () => {
  let clock: Clock;

  beforeEach(() => {
    clock = makeClock("2026-04-02T10:00:00.000Z", 5_000);
  });

  it("generate — returns probeId of length 8, 3 challenges, instructions text", async () => {
    const handler = createModelTestHandler(makeDb(true), clock);
    const result = parseResult(await handler({ projectRoot: "/tmp/proj" }));
    expect(typeof result["probeId"]).toBe("string");
    expect((result["probeId"] as string).length).toBe(8);
    expect(Array.isArray(result["challenges"])).toBe(true);
    expect((result["challenges"] as unknown[]).length).toBe(3);
    expect(typeof result["instructions"]).toBe("string");
  });

  it("validate — correct answers all pass", async () => {
    const handler = createModelTestHandler(makeDb(true), clock);
    const gen = parseResult(await handler({ projectRoot: "/tmp/proj" }));
    const probeId = gen["probeId"] as string;
    const challenges = gen["challenges"] as unknown[];
    const a1 = Number(parseAnswer(challenges[0], "arithmetic"));
    const a2 = parseAnswer(challenges[1], "string-reverse");
    const result = parseResult(
      await handler({ projectRoot: "/tmp/proj", probeId, answers: [a1, a2] }),
    );
    expect(result["passed"]).toBe(true);
    const steps = result["steps"] as { passed: boolean }[];
    expect(steps.every((s) => s.passed)).toBe(true);
  });

  it("validate — wrong arithmetic fails arithmetic step only", async () => {
    const handler = createModelTestHandler(makeDb(true), clock);
    const gen = parseResult(await handler({ projectRoot: "/tmp/proj" }));
    const probeId = gen["probeId"] as string;
    const challenges = gen["challenges"] as unknown[];
    const a1 = Number(parseAnswer(challenges[0], "arithmetic")) + 1;
    const a2 = parseAnswer(challenges[1], "string-reverse");
    const result = parseResult(
      await handler({ projectRoot: "/tmp/proj", probeId, answers: [a1, a2] }),
    );
    expect(result["passed"]).toBe(false);
    const steps = result["steps"] as { test: string; passed: boolean }[];
    expect(steps.find((s) => s.test === "arithmetic")?.passed).toBe(false);
    expect(steps.find((s) => s.test === "string-reverse")?.passed).toBe(true);
    expect(steps.find((s) => s.test === "compile-embed")?.passed).toBe(true);
  });

  it("validate — wrong string fails string-reverse step only", async () => {
    const handler = createModelTestHandler(makeDb(true), clock);
    const gen = parseResult(await handler({ projectRoot: "/tmp/proj" }));
    const probeId = gen["probeId"] as string;
    const challenges = gen["challenges"] as unknown[];
    const a1 = Number(parseAnswer(challenges[0], "arithmetic"));
    const result = parseResult(
      await handler({ projectRoot: "/tmp/proj", probeId, answers: [a1, "WRONGSTR"] }),
    );
    expect(result["passed"]).toBe(false);
    const steps = result["steps"] as { test: string; passed: boolean }[];
    expect(steps.find((s) => s.test === "arithmetic")?.passed).toBe(true);
    expect(steps.find((s) => s.test === "string-reverse")?.passed).toBe(false);
    expect(steps.find((s) => s.test === "compile-embed")?.passed).toBe(true);
  });

  it("validate — missing embed compile fails compile-embed step only", async () => {
    const handler = createModelTestHandler(makeDb(false), clock);
    const gen = parseResult(await handler({ projectRoot: "/tmp/proj" }));
    const probeId = gen["probeId"] as string;
    const challenges = gen["challenges"] as unknown[];
    const a1 = Number(parseAnswer(challenges[0], "arithmetic"));
    const a2 = parseAnswer(challenges[1], "string-reverse");
    const result = parseResult(
      await handler({ projectRoot: "/tmp/proj", probeId, answers: [a1, a2] }),
    );
    expect(result["passed"]).toBe(false);
    const steps = result["steps"] as { test: string; passed: boolean }[];
    expect(steps.find((s) => s.test === "arithmetic")?.passed).toBe(true);
    expect(steps.find((s) => s.test === "string-reverse")?.passed).toBe(true);
    expect(steps.find((s) => s.test === "compile-embed")?.passed).toBe(false);
  });

  it("validate — expired probe returns probe-expired error", async () => {
    const expiredClock = makeClock("2026-04-02T10:00:00.000Z", 121_000);
    const handler = createModelTestHandler(makeDb(true), expiredClock);
    const gen = parseResult(await handler({ projectRoot: "/tmp/proj" }));
    const probeId = gen["probeId"] as string;
    const result = parseResult(
      await handler({ projectRoot: "/tmp/proj", probeId, answers: [0, "X"] }),
    );
    expect(result["error"]).toBe("probe-expired");
  });

  it("validate — unknown probeId returns probe-not-found error", async () => {
    const handler = createModelTestHandler(makeDb(true), clock);
    const result = parseResult(
      await handler({ projectRoot: "/tmp/proj", probeId: "XXXXXXXX", answers: [0, "X"] }),
    );
    expect(result["error"]).toBe("probe-not-found");
  });
});
