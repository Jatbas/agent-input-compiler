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
import { toMilliseconds, toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import { SpecificationCompilerImpl } from "@jatbas/aic-core/pipeline/specification-compiler.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import type { SpecificationInput } from "@jatbas/aic-core/core/types/specification-compilation.types.js";

const measure = (s: string): ReturnType<typeof toTokenCount> =>
  toTokenCount([...s].length);

function parseResult(result: unknown): Record<string, unknown> {
  const r = result as {
    content: readonly { text: string }[];
    structuredContent?: unknown;
  };
  const first = r.content[0];
  if (first === undefined) {
    throw new ConfigError("compile-spec-handler test: expected tool result content");
  }
  const fromText = JSON.parse(first.text) as Record<string, unknown>;
  expect(r.structuredContent).toEqual(fromText);
  return fromText;
}

describe("compile-spec-handler", () => {
  let clock: Clock;
  let idGenerator: IdGenerator;
  let records: ToolInvocationLogEntry[];
  let toolInvocationLogStore: ToolInvocationLogStore;
  let specificationCompiler: SpecificationCompilerImpl;

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
    specificationCompiler = new SpecificationCompilerImpl(measure);
  });

  it("compile_spec_handler_invalid_budget", async () => {
    const handler = createCompileSpecHandler({
      toolInvocationLogStore,
      clock,
      idGenerator,
      getSessionId: (): ReturnType<typeof toSessionId> =>
        toSessionId("00000000-0000-7000-8000-000000000002"),
      specificationCompiler,
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

  it("compile_spec_handler_success_compiler", async () => {
    const handler = createCompileSpecHandler({
      toolInvocationLogStore,
      clock,
      idGenerator,
      getSessionId: (): ReturnType<typeof toSessionId> =>
        toSessionId("00000000-0000-7000-8000-000000000002"),
      specificationCompiler,
    });
    const specificationInput: SpecificationInput = {
      types: [
        {
          name: "Foo",
          path: toRelativePath("src/foo.ts"),
          content: "export {}",
          usage: "implements",
          estimatedTokens: toTokenCount(42),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const expected = specificationCompiler.compile(specificationInput, toTokenCount(42));
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
    expect(result["compiledSpec"]).toBe(expected.compiledSpec);
    expect(result["meta"]).toEqual(expected.meta);
  });

  it("compile_spec_handler_missing_spec_rejected", async () => {
    const handler = createCompileSpecHandler({
      toolInvocationLogStore,
      clock,
      idGenerator,
      getSessionId: (): ReturnType<typeof toSessionId> =>
        toSessionId("00000000-0000-7000-8000-000000000002"),
      specificationCompiler,
    });
    const result = parseResult(await handler({}));
    expect(result["code"]).toBe("validation-error");
    expect(result["error"]).toBe("Invalid aic_compile_spec request");
    expect(records.length).toBe(0);
  });

  it("compile_spec_handler_oversize_types_array_rejected", async () => {
    const handler = createCompileSpecHandler({
      toolInvocationLogStore,
      clock,
      idGenerator,
      getSessionId: (): ReturnType<typeof toSessionId> =>
        toSessionId("00000000-0000-7000-8000-000000000002"),
      specificationCompiler,
    });
    const types = Array.from({ length: 201 }, (_, i) => ({
      name: `N${i}`,
      path: `p/${i}.ts`,
      content: "",
      usage: "names-only" as const,
      estimatedTokens: 0,
    }));
    const result = parseResult(
      await handler({ spec: { types, codeBlocks: [], prose: [] } }),
    );
    expect(result["code"]).toBe("validation-error");
    expect(result["error"]).toBe("Invalid aic_compile_spec request");
    expect(records.length).toBe(0);
  });

  it("compile_spec_handler_invalid_type_usage_rejected", async () => {
    const handler = createCompileSpecHandler({
      toolInvocationLogStore,
      clock,
      idGenerator,
      getSessionId: (): ReturnType<typeof toSessionId> =>
        toSessionId("00000000-0000-7000-8000-000000000002"),
      specificationCompiler,
    });
    const payload = {
      spec: {
        types: [
          {
            name: "x",
            path: "y.ts",
            content: "",
            usage: "invalid-usage",
            estimatedTokens: 0,
          },
        ],
        codeBlocks: [],
        prose: [],
      },
    } as unknown;
    const result = parseResult(await handler(payload));
    expect(result["code"]).toBe("validation-error");
    expect(result["error"]).toBe("Invalid aic_compile_spec request");
    expect(records.length).toBe(0);
  });
});
