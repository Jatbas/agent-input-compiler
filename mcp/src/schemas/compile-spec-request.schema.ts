// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { z } from "zod";

const specTypeUsageEnum = z.enum([
  "implements",
  "calls-methods",
  "constructs",
  "passes-through",
  "names-only",
]);

const specTypeRefShape = {
  name: z.string().min(1).max(512),
  path: z.string().min(1).max(4096),
  content: z.string().max(500_000),
  usage: specTypeUsageEnum,
  estimatedTokens: z.number().int().min(0).max(2_000_000),
} as const;

const specCodeBlockShape = {
  label: z.string().min(1).max(512),
  content: z.string().max(500_000),
  estimatedTokens: z.number().int().min(0).max(2_000_000),
} as const;

const specProseBlockShape = specCodeBlockShape;

const specificationInputShape = {
  types: z.array(z.object(specTypeRefShape)).max(200),
  codeBlocks: z.array(z.object(specCodeBlockShape)).max(50),
  prose: z.array(z.object(specProseBlockShape)).max(50),
} as const;

const compileSpecRequestShape = {
  spec: z.object(specificationInputShape),
  budget: z.number().int().min(0).max(2_000_000).optional(),
} as const;

export const CompileSpecRequestSchema: typeof compileSpecRequestShape =
  compileSpecRequestShape;
