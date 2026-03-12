// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { z } from "zod";

const inspectRequestShape = {
  intent: z
    .string()
    .min(1)
    .max(10_000)
    .describe("Short summary of the user's current message or task."),
  projectRoot: z
    .string()
    .min(1)
    .describe(
      "Absolute path to the project root directory (the workspace folder open in the editor).",
    ),
  configPath: z
    .string()
    .max(4096)
    .regex(/\.json$/)
    .nullable()
    .default(null),
} as const;

export const InspectRequestSchema: typeof inspectRequestShape = inspectRequestShape;
