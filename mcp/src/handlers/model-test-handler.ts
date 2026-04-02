// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { randomFillSync } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ExecutableDb } from "@jatbas/aic-core/core/interfaces/executable-db.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { ISOTimestamp } from "@jatbas/aic-core/core/types/identifiers.js";
import { hasCompilationWithExactIntent } from "@jatbas/aic-core/storage/find-compilation-by-intent.js";
import { z } from "zod";
import { ModelTestRequestSchema } from "../schemas/model-test-request.schema.js";

type ProbeEntry = {
  readonly expectedA1: number;
  readonly expectedA2: string;
  readonly embedIntent: string;
  readonly createdAt: ISOTimestamp;
};

const activeProbes = new Map<string, ProbeEntry>();

const modelTestRequestParser = z.object(ModelTestRequestSchema);

function randomInt(min: number, max: number): number {
  const buf = new Uint8Array(4);
  randomFillSync(buf);
  const n = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0, false) >>> 0;
  return (n % (max - min + 1)) + min;
}

function randomUppercaseString(length: number): string {
  const buf = new Uint8Array(length);
  randomFillSync(buf);
  return Array.from(buf)
    .map((b) => String.fromCharCode((b % 26) + 65))
    .join("");
}

function generateProbe(clock: Clock): CallToolResult {
  const a = randomInt(10, 99);
  const b = randomInt(10, 99);
  const expectedA1 = a + b;
  const rawStr = randomUppercaseString(8);
  const expectedA2 = [...rawStr].toReversed().join("");
  const probeId = randomUppercaseString(8);
  const embedIntent = `model-test-${String(expectedA1)}-${expectedA2}`;
  const createdAt = clock.now();
  activeProbes.set(probeId, { expectedA1, expectedA2, embedIntent, createdAt });
  const payload = {
    probeId,
    challenges: [
      { id: 1, type: "arithmetic", question: `What is ${String(a)} + ${String(b)}?` },
      { id: 2, type: "string-reverse", question: `Reverse the string: "${rawStr}"` },
      {
        id: 3,
        type: "compile-embed",
        question: `Call aic_compile with intent exactly equal to "model-test-<answer1>-<answer2>" (replace <answer1> with your arithmetic answer and <answer2> with your reversed string).`,
      },
    ],
    instructions:
      `Solve challenges 1 and 2. Then complete challenge 3 by calling aic_compile with the constructed intent. ` +
      `Finally call aic_model_test again with { projectRoot, probeId: "${probeId}", answers: [<arithmetic answer>, "<reversed string>"] }. ` +
      `You have 120 seconds.`,
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

function validateProbe(
  probeId: string,
  answers: readonly [number, string],
  db: ExecutableDb,
  clock: Clock,
): CallToolResult {
  const probe = activeProbes.get(probeId);
  if (probe === undefined) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "probe-not-found", probeId }),
        },
      ],
    };
  }
  activeProbes.delete(probeId);
  const elapsedMs = Number(clock.durationMs(probe.createdAt, clock.now()));
  if (elapsedMs > 120_000) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "probe-expired", elapsedMs }),
        },
      ],
    };
  }
  const a1Pass = answers[0] === probe.expectedA1;
  const a2Pass = answers[1] === probe.expectedA2;
  const embedPass = hasCompilationWithExactIntent(db, probe.embedIntent, probe.createdAt);
  const passed = a1Pass && a2Pass && embedPass;
  const result = {
    passed,
    steps: [
      { test: "mcp-call", passed: true, note: "aic_model_test reached the server" },
      {
        test: "arithmetic",
        passed: a1Pass,
        expected: probe.expectedA1,
        got: answers[0],
      },
      {
        test: "string-reverse",
        passed: a2Pass,
        expected: probe.expectedA2,
        got: answers[1],
      },
      {
        test: "compile-embed",
        passed: embedPass,
        note: embedPass
          ? "aic_compile was called with the correct embed intent"
          : `aic_compile was not called with intent "${probe.embedIntent}" during the probe window`,
      },
    ],
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

export function createModelTestHandler(
  db: ExecutableDb,
  clock: Clock,
): (args: unknown) => Promise<CallToolResult> {
  return (args: unknown): Promise<CallToolResult> => {
    const parsed = modelTestRequestParser.parse(args);
    const hasProbe = parsed.probeId !== undefined;
    const hasAnswers = parsed.answers !== undefined;
    if (hasProbe !== hasAnswers) {
      return Promise.resolve({
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: "invalid-args",
              message: "probeId and answers must be supplied together",
            }),
          },
        ],
      });
    }
    if (parsed.probeId !== undefined && parsed.answers !== undefined) {
      return Promise.resolve(validateProbe(parsed.probeId, parsed.answers, db, clock));
    }
    return Promise.resolve(generateProbe(clock));
  };
}
