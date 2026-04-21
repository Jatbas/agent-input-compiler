// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect, vi } from "vitest";
import { SpecificationCompilerImpl } from "../specification-compiler.js";
import {
  SPEC_USAGE_TO_INITIAL_TIER,
  type SpecCompilationResult,
  type SpecificationInput,
} from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import { toRelativePath } from "@jatbas/aic-core/core/types/paths.js";
import { toTokenCount, type TokenCount } from "@jatbas/aic-core/core/types/units.js";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import { TypeScriptProvider } from "@jatbas/aic-core/adapters/typescript-provider.js";
import type { ContentTransformerPipeline } from "@jatbas/aic-core/core/interfaces/content-transformer-pipeline.interface.js";
import type { SummarisationLadder } from "@jatbas/aic-core/core/interfaces/summarisation-ladder.interface.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type {
  TransformContext,
  TransformMetadata,
} from "@jatbas/aic-core/core/types/transform-types.js";

const measure = (s: string): ReturnType<typeof toTokenCount> =>
  toTokenCount([...s].length);

const languageProviders = [new TypeScriptProvider()] as const;

function noopSpecCompilerDeps(): {
  readonly contentTransformerPipeline: {
    readonly transform: ReturnType<typeof vi.fn>;
  };
  readonly summarisationLadder: { readonly compress: ReturnType<typeof vi.fn> };
} {
  const contentTransformerPipeline = {
    transform: vi.fn(async (files: readonly SelectedFile[]) => ({
      files: files.map((f) => ({ ...f })),
      metadata: files.map(
        (f): TransformMetadata => ({
          filePath: f.path,
          originalTokens: f.estimatedTokens,
          transformedTokens: f.estimatedTokens,
          transformersApplied: [],
        }),
      ),
    })),
  };
  const summarisationLadder = {
    compress: vi.fn(async (files: readonly SelectedFile[]) => files),
  };
  return { contentTransformerPipeline, summarisationLadder };
}

function makeSpecCompiler(
  tokenCounter: (s: string) => ReturnType<typeof toTokenCount>,
): SpecificationCompilerImpl {
  const { contentTransformerPipeline, summarisationLadder } = noopSpecCompilerDeps();
  return new SpecificationCompilerImpl(
    tokenCounter,
    contentTransformerPipeline as ContentTransformerPipeline,
    summarisationLadder as SummarisationLadder,
    languageProviders,
  );
}

describe("SpecificationCompilerImpl", () => {
  it("spec_compiler_tier_initial_map", async () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "ZType",
          path: toRelativePath("z/z.ts"),
          content: "",
          usage: "implements",
          estimatedTokens: toTokenCount(1),
        },
        {
          name: "AType",
          path: toRelativePath("a/a.ts"),
          content: "",
          usage: "passes-through",
          estimatedTokens: toTokenCount(1),
        },
        {
          name: "MType",
          path: toRelativePath("m/b.ts"),
          content: "",
          usage: "names-only",
          estimatedTokens: toTokenCount(1),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const c = makeSpecCompiler(measure);
    const { meta } = await c.compile(input, toTokenCount(1_000_000));
    expect(Object.keys(meta.typeTiers)).toEqual([
      "AType\u0000a/a.ts",
      "MType\u0000m/b.ts",
      "ZType\u0000z/z.ts",
    ]);
    expect(meta.typeTiers["AType\u0000a/a.ts"]).toBe(
      SPEC_USAGE_TO_INITIAL_TIER["passes-through"],
    );
    expect(meta.typeTiers["MType\u0000m/b.ts"]).toBe(
      SPEC_USAGE_TO_INITIAL_TIER["names-only"],
    );
    expect(meta.typeTiers["ZType\u0000z/z.ts"]).toBe(
      SPEC_USAGE_TO_INITIAL_TIER.implements,
    );
  });

  it("spec_compiler_demotion_construct_before_implements", async () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "Ctor",
          path: toRelativePath("a/a.ts"),
          content: "class Ctor {}",
          usage: "constructs",
          estimatedTokens: toTokenCount(50),
        },
        {
          name: "Impl",
          path: toRelativePath("b/b.ts"),
          content: "class Impl {}",
          usage: "implements",
          estimatedTokens: toTokenCount(50),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const full = await makeSpecCompiler(measure).compile(input, toTokenCount(1_000_000));
    const budget = toTokenCount(Math.max(0, [...full.compiledSpec].length - 1));
    const { meta } = await makeSpecCompiler(measure).compile(input, budget);
    expect(meta.typeTiers["Ctor\u0000a/a.ts"]).toBe("signature-path");
    expect(meta.typeTiers["Impl\u0000b/b.ts"]).toBe("verbatim");
  });

  it("spec_compiler_tiebreak_larger_tokens_first", async () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "Small",
          path: toRelativePath("a/small.ts"),
          content: "function a() {}",
          usage: "implements",
          estimatedTokens: toTokenCount(10),
        },
        {
          name: "Big",
          path: toRelativePath("b/big.ts"),
          content: "function x() {}\nfunction y() {}\nfunction z() {}",
          usage: "implements",
          estimatedTokens: toTokenCount(10),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const full = await makeSpecCompiler(measure).compile(input, toTokenCount(1_000_000));
    const budget = toTokenCount(Math.max(0, [...full.compiledSpec].length - 1));
    const { meta } = await makeSpecCompiler(measure).compile(input, budget);
    expect(meta.typeTiers["Big\u0000b/big.ts"]).toBe("signature-path");
    expect(meta.typeTiers["Small\u0000a/small.ts"]).toBe("verbatim");
  });

  it("spec_compiler_shared_import_merge", async () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "T1",
          path: toRelativePath("a/t1.ts"),
          content: 'import { x } from "shared";\nconst a = 1;',
          usage: "implements",
          estimatedTokens: toTokenCount(20),
        },
        {
          name: "T2",
          path: toRelativePath("b/t2.ts"),
          content: 'import { y } from "shared";\nconst b = 2;',
          usage: "implements",
          estimatedTokens: toTokenCount(20),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const { compiledSpec } = await makeSpecCompiler(measure).compile(
      input,
      toTokenCount(1_000_000),
    );
    const importLines = compiledSpec
      .split("\n\n")[0]
      ?.split("\n")
      .filter((l) => l.startsWith("import "));
    expect(importLines).toEqual(['import { x, y } from "shared";']);
  });

  it("spec_compiler_determinism", async () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "A",
          path: toRelativePath("p/a.ts"),
          content: "function f() {}",
          usage: "calls-methods",
          estimatedTokens: toTokenCount(5),
        },
      ],
      codeBlocks: [{ label: "c", content: "x", estimatedTokens: toTokenCount(1) }],
      prose: [{ label: "p", content: "y", estimatedTokens: toTokenCount(1) }],
    };
    const c = makeSpecCompiler(measure);
    const a = await c.compile(input, toTokenCount(400));
    const b = await c.compile(input, toTokenCount(400));
    expect(a.compiledSpec).toBe(b.compiledSpec);
    expect(a.meta).toEqual(b.meta);
  });

  it("spec_compiler_truncation_warning", async () => {
    const longName = "N".repeat(400);
    const input: SpecificationInput = {
      types: [
        {
          name: longName,
          path: toRelativePath("p/x.ts"),
          content: "",
          usage: "names-only",
          estimatedTokens: toTokenCount(1),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const { compiledSpec } = await makeSpecCompiler(measure).compile(
      input,
      toTokenCount(50),
    );
    expect(
      compiledSpec.endsWith(
        "\nAIC specification compiler: output truncated to satisfy budget.",
      ),
    ).toBe(true);
  });

  it("spec_compiler_code_blocks_sorted_by_label", async () => {
    const input: SpecificationInput = {
      types: [],
      codeBlocks: [
        {
          label: "z",
          content: "ZZZ",
          estimatedTokens: measure("ZZZ"),
        },
        {
          label: "a",
          content: "AAA",
          estimatedTokens: measure("AAA"),
        },
      ],
      prose: [],
    };
    const { compiledSpec } = await makeSpecCompiler(measure).compile(
      input,
      toTokenCount(1_000_000),
    );
    expect(compiledSpec.indexOf("a\nAAA")).toBeLessThan(compiledSpec.indexOf("z\nZZZ"));
  });

  it("spec_compiler_prose_sorted_by_label", async () => {
    const input: SpecificationInput = {
      types: [],
      codeBlocks: [],
      prose: [
        {
          label: "z",
          content: "ZZZ",
          estimatedTokens: measure("ZZZ"),
        },
        {
          label: "a",
          content: "AAA",
          estimatedTokens: measure("AAA"),
        },
      ],
    };
    const { compiledSpec } = await makeSpecCompiler(measure).compile(
      input,
      toTokenCount(1_000_000),
    );
    expect(compiledSpec.indexOf("a\nAAA")).toBeLessThan(compiledSpec.indexOf("z\nZZZ"));
  });

  it("spec_compiler_budget_removes_code_before_prose", async () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "T",
          path: toRelativePath("t/x.ts"),
          content: "",
          usage: "names-only",
          estimatedTokens: toTokenCount(1),
        },
      ],
      codeBlocks: [
        {
          label: "c",
          content: "<<<CODE>>>",
          estimatedTokens: toTokenCount(100),
        },
      ],
      prose: [
        {
          label: "p",
          content: "<<<PROSE>>>",
          estimatedTokens: toTokenCount(10),
        },
      ],
    };
    const impl = makeSpecCompiler(measure);
    const full = await impl.compile(input, toTokenCount(1_000_000));
    expect(full.compiledSpec.includes("<<<CODE>>>")).toBe(true);
    expect(full.compiledSpec.includes("<<<PROSE>>>")).toBe(true);
    const L = [...full.compiledSpec].length;
    let first: { readonly k: number; readonly trial: SpecCompilationResult } | undefined;
    for (let i = 0; i <= L; i += 1) {
      const k = L - i;
      const trial = await impl.compile(input, toTokenCount(k));
      if (
        trial.compiledSpec.includes("<<<PROSE>>>") &&
        !trial.compiledSpec.includes("<<<CODE>>>")
      ) {
        first = { k, trial };
        break;
      }
    }
    if (first === undefined) {
      throw new ConfigError(
        "specification-compiler test: expected budget where prose remains and code drops",
      );
    }
    expect(first.trial.compiledSpec.includes("<<<PROSE>>>")).toBe(true);
    expect(first.trial.compiledSpec.includes("<<<CODE>>>")).toBe(false);
  });

  it("spec_compiler_budget_demotion_signature_before_code_drop", async () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "A",
          path: toRelativePath("a/a.ts"),
          content: "export class A {}\nexport class B {}",
          usage: "implements",
          estimatedTokens: toTokenCount(50),
        },
        {
          name: "B",
          path: toRelativePath("b/b.ts"),
          content: "export class A {}\nexport class B {}",
          usage: "implements",
          estimatedTokens: toTokenCount(50),
        },
      ],
      codeBlocks: [
        {
          label: "cb",
          content: "KEEP_CODE_BLOCK",
          estimatedTokens: toTokenCount(5),
        },
      ],
      prose: [],
    };
    const impl = makeSpecCompiler(measure);
    const full = await impl.compile(input, toTokenCount(1_000_000));
    expect(full.meta.typeTiers["A\u0000a/a.ts"]).toBe("verbatim");
    expect(full.meta.typeTiers["B\u0000b/b.ts"]).toBe("verbatim");
    const budget = toTokenCount(Math.max(0, [...full.compiledSpec].length - 1));
    const tight = await impl.compile(input, budget);
    expect(tight.compiledSpec.includes("KEEP_CODE_BLOCK")).toBe(true);
    expect(
      tight.meta.typeTiers["A\u0000a/a.ts"] === "signature-path" ||
        tight.meta.typeTiers["B\u0000b/b.ts"] === "signature-path",
    ).toBe(true);
    expect(
      tight.meta.typeTiers["A\u0000a/a.ts"] === "verbatim" &&
        tight.meta.typeTiers["B\u0000b/b.ts"] === "verbatim",
    ).toBe(false);
  });

  it("spec_compiler_budget_demoted_types_invoke_extra_transform", async () => {
    const order: string[] = [];
    const contentTransformerPipeline = {
      transform: vi.fn(async (files: readonly SelectedFile[], _ctx: TransformContext) => {
        order.push("transform");
        return {
          files: files.map((f) => ({ ...f })),
          metadata: files.map(
            (f): TransformMetadata => ({
              filePath: f.path,
              originalTokens: f.estimatedTokens,
              transformedTokens: f.estimatedTokens,
              transformersApplied: [],
            }),
          ),
        };
      }),
    };
    const summarisationLadder = {
      compress: vi.fn(async (files: readonly SelectedFile[]) => {
        order.push("compress");
        return files;
      }),
    };
    const impl = new SpecificationCompilerImpl(
      measure,
      contentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder as SummarisationLadder,
      languageProviders,
    );
    const input: SpecificationInput = {
      types: [
        {
          name: "A",
          path: toRelativePath("a/a.ts"),
          content: "export class A {}\nexport class B {}",
          usage: "implements",
          estimatedTokens: toTokenCount(50),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const full = await impl.compile(input, toTokenCount(1_000_000));
    expect(order).toEqual(["transform", "compress"]);
    order.length = 0;
    const L = [...full.compiledSpec].length;
    await impl.compile(input, toTokenCount(Math.max(0, L - 1)));
    expect(order.join(",")).toBe("transform,compress,transform,compress");
    const expectedContext: TransformContext = { directTargetPaths: [], rawMode: false };
    for (const call of contentTransformerPipeline.transform.mock.calls) {
      expect(call[1]).toEqual(expectedContext);
    }
  });

  it("spec_compiler_verbatim_invokes_transform_then_ladder", async () => {
    const order: string[] = [];
    const contentTransformerPipeline = {
      transform: vi.fn(async (files: readonly SelectedFile[]) => {
        order.push("transform");
        return {
          files: files.map((f) => ({ ...f })),
          metadata: files.map(
            (f): TransformMetadata => ({
              filePath: f.path,
              originalTokens: f.estimatedTokens,
              transformedTokens: f.estimatedTokens,
              transformersApplied: [],
            }),
          ),
        };
      }),
    };
    const summarisationLadder = {
      compress: vi.fn(async (files: readonly SelectedFile[]) => {
        order.push("compress");
        return files;
      }),
    };
    const impl = new SpecificationCompilerImpl(
      measure,
      contentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder as SummarisationLadder,
      languageProviders,
    );
    const input: SpecificationInput = {
      types: [
        {
          name: "X",
          path: toRelativePath("a.ts"),
          content: "export const x = 1",
          usage: "implements",
          estimatedTokens: toTokenCount(100),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    await impl.compile(input, toTokenCount(1_000_000));
    expect(order).toEqual(["transform", "compress"]);
  });

  it("spec_compiler_embed_pass_appends_transform_after_verbatim_when_blocks_present", async () => {
    const order: string[] = [];
    const contentTransformerPipeline = {
      transform: vi.fn(async (files: readonly SelectedFile[], _ctx: TransformContext) => {
        order.push("transform");
        return {
          files: files.map((f) => ({ ...f })),
          metadata: files.map(
            (f): TransformMetadata => ({
              filePath: f.path,
              originalTokens: f.estimatedTokens,
              transformedTokens: f.estimatedTokens,
              transformersApplied: [],
            }),
          ),
        };
      }),
    };
    const summarisationLadder = {
      compress: vi.fn(async (files: readonly SelectedFile[]) => {
        order.push("compress");
        return files;
      }),
    };
    const impl = new SpecificationCompilerImpl(
      measure,
      contentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder as SummarisationLadder,
      languageProviders,
    );
    const input: SpecificationInput = {
      types: [
        {
          name: "X",
          path: toRelativePath("a.ts"),
          content: "export const x = 1",
          usage: "implements",
          estimatedTokens: toTokenCount(100),
        },
      ],
      codeBlocks: [
        {
          label: "embed-case",
          content: "const x = 1",
          estimatedTokens: measure("const x = 1"),
        },
      ],
      prose: [],
    };
    await impl.compile(input, toTokenCount(1_000_000));
    expect(order.join(",")).toBe("transform,compress,transform,compress");
    expect(contentTransformerPipeline.transform.mock.calls.length).toBe(2);
    const expectedContext: TransformContext = { directTargetPaths: [], rawMode: false };
    for (const call of contentTransformerPipeline.transform.mock.calls) {
      expect(call[1]).toEqual(expectedContext);
    }
    const second = contentTransformerPipeline.transform.mock.calls[1];
    expect(second).toBeDefined();
    if (second === undefined) {
      throw new ConfigError(
        "specification-compiler test: expected second transform call",
      );
    }
    expect(second[0]).toHaveLength(1);
    expect(String((second[0][0] as SelectedFile).path)).toContain(
      "spec/aic-inline/code/",
    );
  });

  it("spec_compiler_embed_code_blocks_batch_two_bodies", async () => {
    const wireA = "const a = 1\n\n\nafter";
    const wireZ = "const z = 2";
    const norm = (body: string): string => body.replace(/\n{3,}/g, "\n\n");
    const order: string[] = [];
    const contentTransformerPipeline = {
      transform: vi.fn(async (files: readonly SelectedFile[], _ctx: TransformContext) => {
        order.push("transform");
        return {
          files: files.map((f) => ({ ...f })),
          metadata: files.map(
            (f): TransformMetadata => ({
              filePath: f.path,
              originalTokens: f.estimatedTokens,
              transformedTokens: f.estimatedTokens,
              transformersApplied: [],
            }),
          ),
        };
      }),
    };
    const summarisationLadder = {
      compress: vi.fn(async (files: readonly SelectedFile[]) => {
        order.push("compress");
        return files;
      }),
    };
    const impl = new SpecificationCompilerImpl(
      measure,
      contentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder as SummarisationLadder,
      languageProviders,
    );
    const input: SpecificationInput = {
      types: [
        {
          name: "T",
          path: toRelativePath("t.ts"),
          content: "export {}",
          usage: "implements",
          estimatedTokens: measure("export {}"),
        },
      ],
      codeBlocks: [
        {
          label: "z-block",
          content: wireZ,
          estimatedTokens: measure(wireZ),
        },
        {
          label: "a-block",
          content: wireA,
          estimatedTokens: measure(wireA),
        },
      ],
      prose: [],
    };
    await impl.compile(input, toTokenCount(1_000_000));
    expect(order.join(",")).toBe("transform,compress,transform,compress");
    const batchCall = contentTransformerPipeline.transform.mock.calls[1];
    expect(batchCall).toBeDefined();
    if (batchCall === undefined) {
      throw new ConfigError(
        "specification-compiler test: expected second transform batch call",
      );
    }
    expect(batchCall[0]).toHaveLength(2);
    const row0 = batchCall[0][0] as SelectedFile;
    const row1 = batchCall[0][1] as SelectedFile;
    expect(String(row0.path).endsWith("spec/aic-inline/code/000.ts")).toBe(true);
    expect(String(row1.path).endsWith("spec/aic-inline/code/001.ts")).toBe(true);
    expect(row0.resolvedContent).toBe(norm(wireA));
    expect(row1.resolvedContent).toBe(norm(wireZ));
    const expectedContext: TransformContext = { directTargetPaths: [], rawMode: false };
    for (const call of contentTransformerPipeline.transform.mock.calls) {
      expect(call[1]).toEqual(expectedContext);
    }
  });

  it("spec_compiler_meta_transform_tokens_saved_matches_raw_minus_compiled", async () => {
    const c = makeSpecCompiler(measure);
    const input: SpecificationInput = {
      types: [
        {
          name: "X",
          path: toRelativePath("x.ts"),
          content: "export const x = 1",
          usage: "implements",
          estimatedTokens: toTokenCount(100),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const budget = toTokenCount(1_000_000);
    const { meta } = await c.compile(input, budget);
    expect(meta.transformTokensSaved).toEqual(
      toTokenCount(
        Math.max(0, Number(meta.totalTokensRaw) - Number(meta.totalTokensCompiled)),
      ),
    );
  });

  it("spec_compiler_transform_receives_spec_compile_context", async () => {
    const contentTransformerPipeline = {
      transform: vi.fn(async (files: readonly SelectedFile[], _ctx) => ({
        files: files.map((f) => ({ ...f })),
        metadata: files.map(
          (f): TransformMetadata => ({
            filePath: f.path,
            originalTokens: f.estimatedTokens,
            transformedTokens: f.estimatedTokens,
            transformersApplied: [],
          }),
        ),
      })),
    };
    const summarisationLadder = {
      compress: vi.fn(async (files: readonly SelectedFile[]) => files),
    };
    const impl = new SpecificationCompilerImpl(
      measure,
      contentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder as SummarisationLadder,
      languageProviders,
    );
    const input: SpecificationInput = {
      types: [
        {
          name: "X",
          path: toRelativePath("a.ts"),
          content: "export const x = 1",
          usage: "implements",
          estimatedTokens: toTokenCount(100),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    await impl.compile(input, toTokenCount(1_000_000));
    expect(contentTransformerPipeline.transform.mock.calls.length).toBeGreaterThanOrEqual(
      1,
    );
    const call = contentTransformerPipeline.transform.mock.calls[0];
    expect(call).toBeDefined();
    if (call === undefined) {
      throw new ConfigError("specification-compiler test: expected transform call");
    }
    expect(call[1]).toEqual({ directTargetPaths: [], rawMode: false });
  });

  it("spec_compiler_signature_path_repeated_compile_bit_identical", async () => {
    const order: string[] = [];
    const contentTransformerPipeline = {
      transform: vi.fn(
        async (files: readonly SelectedFile[], _context: TransformContext) => {
          order.push("transform");
          return {
            files: files.map((f) => ({ ...f })),
            metadata: files.map(
              (f): TransformMetadata => ({
                filePath: f.path,
                originalTokens: f.estimatedTokens,
                transformedTokens: f.estimatedTokens,
                transformersApplied: [],
              }),
            ),
          };
        },
      ),
    };
    const summarisationLadder = {
      compress: vi.fn(
        async (
          files: readonly SelectedFile[],
          _budget: TokenCount,
          subjectTokens?: readonly string[],
        ) => {
          order.push("compress");
          expect(subjectTokens).toBe(undefined);
          return files;
        },
      ),
    };
    const impl = new SpecificationCompilerImpl(
      measure,
      contentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder as SummarisationLadder,
      languageProviders,
    );
    const input: SpecificationInput = {
      types: [
        {
          name: "PassThru",
          path: toRelativePath("pt/x.ts"),
          usage: "passes-through",
          estimatedTokens: toTokenCount(80),
          content: "export class Box {}\nexport function spin() {}",
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const budget = toTokenCount(500_000);
    const first = await impl.compile(input, budget);
    const second = await impl.compile(input, budget);
    expect(second.compiledSpec).toBe(first.compiledSpec);
    expect(second.meta).toEqual(first.meta);
    expect(order.join(",")).toBe("transform,compress,transform,compress");
    expect(contentTransformerPipeline.transform.mock.calls.length).toBe(2);
    const expectedContext: TransformContext = { directTargetPaths: [], rawMode: false };
    const firstCall = contentTransformerPipeline.transform.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall === undefined) {
      throw new ConfigError("specification-compiler test: expected first transform call");
    }
    expect(firstCall[1]).toEqual(expectedContext);
    const secondCall = contentTransformerPipeline.transform.mock.calls[1];
    expect(secondCall).toBeDefined();
    if (secondCall === undefined) {
      throw new ConfigError(
        "specification-compiler test: expected second transform call",
      );
    }
    expect(secondCall[1]).toEqual(expectedContext);
  });

  it("spec_compiler_verbatim_inflate_shifts_budget_demotion", async () => {
    const input: SpecificationInput = {
      types: [
        {
          name: "A",
          path: toRelativePath("a/a.ts"),
          content: "export const a = 1",
          usage: "implements",
          estimatedTokens: toTokenCount(50),
        },
        {
          name: "B",
          path: toRelativePath("b/b.ts"),
          content: "export const b = 1",
          usage: "implements",
          estimatedTokens: toTokenCount(50),
        },
      ],
      codeBlocks: [],
      prose: [],
    };
    const noopImpl = makeSpecCompiler(measure);
    const contentTransformerPipeline = {
      transform: vi.fn(async (files: readonly SelectedFile[], _ctx) => ({
        files: files.map((f) =>
          String(f.path) === "a/a.ts"
            ? { ...f, resolvedContent: `${f.resolvedContent ?? ""}\n${"Q".repeat(200)}` }
            : { ...f },
        ),
        metadata: files.map(
          (f): TransformMetadata => ({
            filePath: f.path,
            originalTokens: f.estimatedTokens,
            transformedTokens: f.estimatedTokens,
            transformersApplied: [],
          }),
        ),
      })),
    };
    const summarisationLadder = {
      compress: vi.fn(async (files: readonly SelectedFile[]) => files),
    };
    const inflateImpl = new SpecificationCompilerImpl(
      measure,
      contentTransformerPipeline as ContentTransformerPipeline,
      summarisationLadder as SummarisationLadder,
      languageProviders,
    );
    const full = await noopImpl.compile(input, toTokenCount(1_000_000));
    const L = [...full.compiledSpec].length;
    const keyA = "A\u0000a/a.ts";
    const keyB = "B\u0000b/b.ts";
    let found = false;
    for (let k = L; k >= 0; k -= 1) {
      const bn = await noopImpl.compile(input, toTokenCount(k));
      const bi = await inflateImpl.compile(input, toTokenCount(k));
      if (
        bn.meta.typeTiers[keyA] === "verbatim" &&
        bn.meta.typeTiers[keyB] === "verbatim" &&
        bi.meta.typeTiers[keyA] !== "verbatim" &&
        bi.meta.typeTiers[keyB] === "verbatim"
      ) {
        found = true;
        break;
      }
    }
    if (!found) {
      throw new ConfigError(
        "specification-compiler test: no budget discriminates noop versus inflate demotion",
      );
    }
  });
});
