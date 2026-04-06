// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, beforeEach } from "vitest";
import { createCompileSpecHandler } from "../compile-spec-handler.js";
import type { ToolInvocationLogStore } from "@jatbas/aic-core/core/interfaces/tool-invocation-log-store.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { ToolInvocationLogEntry } from "@jatbas/aic-core/core/types/tool-invocation-log-entry.js";
import {
  toSessionId,
  toISOTimestamp,
  toUUIDv7,
} from "@jatbas/aic-core/core/types/identifiers.js";
import { toMilliseconds } from "@jatbas/aic-core/core/types/units.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";

function parseResult(result: unknown): Record<string, unknown> {
  const r = result as { content: readonly { text: string }[] };
  const first = r.content[0];
  if (first === undefined) {
    throw new ConfigError("compile-spec-handler test: expected tool result content");
  }
  return JSON.parse(first.text) as Record<string, unknown>;
}

describe("compile-spec-handler", () => {
  let clock: Clock;
  let idGenerator: IdGenerator;
  let records: ToolInvocationLogEntry[];
  let toolInvocationLogStore: ToolInvocationLogStore;

  beforeEach(() => {
    records = [];
    toolInvocationLogStore = {
      record: (entry: ToolInvocationLogEntry): void => {
        records.push(entry);
      },
    };
    clock = {
      now: (): ReturnType<typeof toISOTimestamp> =>
        toISOTimestamp("2026-04-02T10:00:00.000Z"),
      addMinutes: (): ReturnType<typeof toISOTimestamp> =>
        toISOTimestamp("2026-04-02T10:00:00.000Z"),
      durationMs: (): ReturnType<typeof toMilliseconds> => toMilliseconds(0),
    };
    idGenerator = {
      generate: (): ReturnType<typeof toUUIDv7> =>
        toUUIDv7("018f0000-0000-7000-8000-000000000099"),
    };
  });

  it("invalid budget rejects", async () => {
    const handler = createCompileSpecHandler({
      toolInvocationLogStore,
      clock,
      idGenerator,
      getSessionId: (): ReturnType<typeof toSessionId> =>
        toSessionId("00000000-0000-7000-8000-000000000002"),
    });
    const result = parseResult(
      await handler({
        spec: { types: [], codeBlocks: [], prose: [] },
        budget: 2_000_001,
      }),
    );
    expect(result["code"]).toBe("validation-error");
    expect(records.length).toBe(0);
  });

  it("success records invocation and meta", async () => {
    const handler = createCompileSpecHandler({
      toolInvocationLogStore,
      clock,
      idGenerator,
      getSessionId: (): ReturnType<typeof toSessionId> =>
        toSessionId("00000000-0000-7000-8000-000000000002"),
    });
    const payload = {
      spec: {
        types: [
          {
            name: "Foo",
            path: "src/foo.ts",
            content: "export {}",
            usage: "implements" as const,
            estimatedTokens: 42,
          },
        ],
        codeBlocks: [] as const,
        prose: [] as const,
      },
    } as const;
    const result = parseResult(await handler(payload));
    expect(records.length).toBe(1);
    expect(records[0]?.toolName).toBe("aic_compile_spec");
    const compiledSpec = result["compiledSpec"];
    expect(typeof compiledSpec).toBe("string");
    expect((compiledSpec as string).includes("foundation stub")).toBe(true);
    expect(result["meta"]).toEqual({
      totalTokensRaw: 42,
      totalTokensCompiled: 0,
      reductionPct: 0,
      typeTiers: { "Foo\u0000src/foo.ts": "verbatim" },
      transformTokensSaved: 0,
    });
  });
});
