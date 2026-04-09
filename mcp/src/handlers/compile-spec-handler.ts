// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ToolInvocationLogStore } from "@jatbas/aic-core/core/interfaces/tool-invocation-log-store.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { SessionId } from "@jatbas/aic-core/core/types/identifiers.js";
import { CompileSpecRequestSchema } from "../schemas/compile-spec-request.schema.js";
import { recordToolInvocation } from "../record-tool-invocation.js";

const compileSpecRequestParser = z.object(CompileSpecRequestSchema);

const USAGE_TO_INITIAL_TIER = {
  implements: "verbatim",
  "calls-methods": "verbatim",
  constructs: "verbatim",
  "passes-through": "signature-path",
  "names-only": "path-only",
} as const satisfies Readonly<
  Record<
    "implements" | "calls-methods" | "constructs" | "passes-through" | "names-only",
    "verbatim" | "signature-path" | "path-only"
  >
>;

export type CompileSpecHandlerDeps = {
  readonly toolInvocationLogStore: ToolInvocationLogStore;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly getSessionId: () => SessionId;
};

type InitialTier = (typeof USAGE_TO_INITIAL_TIER)[keyof typeof USAGE_TO_INITIAL_TIER];

function sumEstimatedTokens(rows: readonly { estimatedTokens: number }[]): number {
  return rows.reduce((acc, row) => acc + row.estimatedTokens, 0);
}

function buildTypeTiers(
  types: readonly {
    readonly name: string;
    readonly path: string;
    readonly usage: keyof typeof USAGE_TO_INITIAL_TIER;
  }[],
): Record<string, InitialTier> {
  const sorted = types.toSorted((a, b) => {
    const byPath = a.path.localeCompare(b.path);
    return byPath !== 0 ? byPath : a.name.localeCompare(b.name);
  });
  return sorted.reduce<Record<string, InitialTier>>(
    (acc, t) => ({
      ...acc,
      [`${t.name}\u0000${t.path}`]: USAGE_TO_INITIAL_TIER[t.usage],
    }),
    {},
  );
}

function buildCompiledSpecStub(params: {
  readonly typesCount: number;
  readonly codeBlocksCount: number;
  readonly proseCount: number;
  readonly budgetPresent: boolean;
  readonly budgetValue: number | undefined;
  readonly totalTokensRaw: number;
}): string {
  const budgetSegment = params.budgetPresent ? String(params.budgetValue) : "none";
  return [
    "AIC aic_compile_spec: foundation stub; SpecificationCompiler not invoked.",
    `types: ${params.typesCount}`,
    `codeBlocks: ${params.codeBlocksCount}`,
    `prose: ${params.proseCount}`,
    `budget: ${budgetSegment}`,
    `totalTokensRaw: ${params.totalTokensRaw}`,
  ].join("\n");
}

export function createCompileSpecHandler(
  deps: CompileSpecHandlerDeps,
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown): Promise<CallToolResult> => {
    const parsed = compileSpecRequestParser.safeParse(args);
    if (!parsed.success) {
      const validationPayload = {
        error: "Invalid aic_compile_spec request",
        code: "validation-error" as const,
      };
      const text: string = JSON.stringify(validationPayload);
      return Promise.resolve({
        content: [{ type: "text", text }],
        structuredContent: validationPayload,
      });
    }
    const data = parsed.data;
    recordToolInvocation(
      deps.toolInvocationLogStore,
      deps.clock,
      deps.idGenerator,
      deps.getSessionId,
      "aic_compile_spec",
      data,
    );
    const totalTokensRaw =
      sumEstimatedTokens(data.spec.types) +
      sumEstimatedTokens(data.spec.codeBlocks) +
      sumEstimatedTokens(data.spec.prose);
    const typeTiers = buildTypeTiers(data.spec.types);
    const compiledSpec = buildCompiledSpecStub({
      typesCount: data.spec.types.length,
      codeBlocksCount: data.spec.codeBlocks.length,
      proseCount: data.spec.prose.length,
      budgetPresent: "budget" in data,
      budgetValue: data.budget,
      totalTokensRaw,
    });
    const successPayload = {
      compiledSpec,
      meta: {
        totalTokensRaw,
        totalTokensCompiled: 0,
        reductionPct: 0,
        typeTiers,
        transformTokensSaved: 0,
      },
    };
    const text: string = JSON.stringify(successPayload);
    return Promise.resolve({
      content: [{ type: "text", text }],
      structuredContent: successPayload,
    });
  };
}
