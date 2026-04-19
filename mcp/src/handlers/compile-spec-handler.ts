// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ToolInvocationLogStore } from "@jatbas/aic-core/core/interfaces/tool-invocation-log-store.interface.js";
import type { Clock } from "@jatbas/aic-core/core/interfaces/clock.interface.js";
import type { IdGenerator } from "@jatbas/aic-core/core/interfaces/id-generator.interface.js";
import type { SpecificationCompiler } from "@jatbas/aic-core/core/interfaces/specification-compiler.interface.js";
import type { SpecCompileCacheStore } from "@jatbas/aic-core/core/interfaces/spec-compile-cache-store.interface.js";
import type { StringHasher } from "@jatbas/aic-core/core/interfaces/string-hasher.interface.js";
import type { SessionId } from "@jatbas/aic-core/core/types/identifiers.js";
import type { SpecificationInput } from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { buildSpecCompileCachePreimage } from "@jatbas/aic-core/pipeline/build-spec-compile-cache-preimage.js";
import { CompileSpecRequestSchema } from "../schemas/compile-spec-request.schema.js";
import { recordToolInvocation } from "../record-tool-invocation.js";

const compileSpecRequestParser = z.object(CompileSpecRequestSchema);

export type CompileSpecHandlerDeps = {
  readonly toolInvocationLogStore: ToolInvocationLogStore;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly getSessionId: () => SessionId;
  readonly specificationCompiler: SpecificationCompiler;
  readonly specCompileCacheStore: SpecCompileCacheStore;
  readonly stringHasher: StringHasher;
};

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
    const sumEstimated =
      data.spec.types.reduce((acc, row) => acc + row.estimatedTokens, 0) +
      data.spec.codeBlocks.reduce((acc, row) => acc + row.estimatedTokens, 0) +
      data.spec.prose.reduce((acc, row) => acc + row.estimatedTokens, 0);
    const budgetTokenCount =
      data.budget !== undefined ? toTokenCount(data.budget) : toTokenCount(sumEstimated);
    const specificationInput: SpecificationInput = {
      types: data.spec.types.map((t) => ({
        name: t.name,
        path: toRelativePath(t.path),
        content: t.content,
        usage: t.usage,
        estimatedTokens: toTokenCount(t.estimatedTokens),
      })),
      codeBlocks: data.spec.codeBlocks.map((b) => ({
        label: b.label,
        content: b.content,
        estimatedTokens: toTokenCount(b.estimatedTokens),
      })),
      prose: data.spec.prose.map((p) => ({
        label: p.label,
        content: p.content,
        estimatedTokens: toTokenCount(p.estimatedTokens),
      })),
    };
    const preimage = buildSpecCompileCachePreimage(specificationInput, budgetTokenCount);
    const cacheKey = deps.stringHasher.hash(preimage);
    const cached = deps.specCompileCacheStore.get(cacheKey);
    if (cached !== null) {
      const successPayload = { compiledSpec: cached.compiledSpec, meta: cached.meta };
      const text: string = JSON.stringify(successPayload);
      return Promise.resolve({
        content: [{ type: "text", text }],
        structuredContent: successPayload,
      });
    }
    const { compiledSpec, meta } = await deps.specificationCompiler.compile(
      specificationInput,
      budgetTokenCount,
    );
    deps.specCompileCacheStore.set({
      cacheKey,
      compiledSpec,
      meta,
      createdAt: deps.clock.now(),
      expiresAt: deps.clock.addMinutes(60),
    });
    const successPayload = { compiledSpec, meta };
    const text: string = JSON.stringify(successPayload);
    return Promise.resolve({
      content: [{ type: "text", text }],
      structuredContent: successPayload,
    });
  };
}
