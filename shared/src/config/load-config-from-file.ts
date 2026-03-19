// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { ConfigError } from "@jatbas/aic-core/core/errors/config-error.js";
import type {
  AbsolutePath,
  FilePath,
  GlobPattern,
} from "@jatbas/aic-core/core/types/paths.js";
import { toGlobPattern } from "@jatbas/aic-core/core/types/paths.js";
import type { ResolvedConfig } from "@jatbas/aic-core/core/types/resolved-config.js";
import { defaultResolvedConfig } from "@jatbas/aic-core/core/types/resolved-config.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { TASK_CLASS, type TaskClass } from "@jatbas/aic-core/core/types/enums.js";
import type { BudgetConfig } from "@jatbas/aic-core/core/interfaces/budget-config.interface.js";
import type { ConfigLoader } from "@jatbas/aic-core/core/interfaces/config-loader.interface.js";
import type { ConfigStore } from "@jatbas/aic-core/core/interfaces/config-store.interface.js";
import type { HeuristicSelectorConfig } from "@jatbas/aic-core/core/interfaces/heuristic-selector-config.interface.js";
import type { LoadConfigResult } from "@jatbas/aic-core/core/interfaces/load-config-result.interface.js";
import type { StringHasher } from "@jatbas/aic-core/core/interfaces/string-hasher.interface.js";

const AicConfigSchema = z.object({
  contextBudget: z
    .object({
      maxTokens: z.number(),
      perTaskClass: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  contextSelector: z
    .object({
      heuristic: z.object({ maxFiles: z.number().optional() }).optional(),
    })
    .optional(),
  model: z.object({ id: z.string().optional() }).optional(),
  enabled: z.boolean().optional(),
  guard: z
    .object({
      allowPatterns: z.array(z.string().min(1).max(512)).max(64).default([]),
    })
    .optional(),
});

type AicConfigParsed = z.infer<typeof AicConfigSchema>;

function resolveFilePath(projectRoot: AbsolutePath, configPath: FilePath | null): string {
  if (configPath === null) {
    return path.join(projectRoot, "aic.config.json");
  }
  if (path.isAbsolute(configPath)) {
    return configPath;
  }
  return path.join(projectRoot, configPath);
}

function buildPerTaskClass(
  raw: Readonly<Record<string, number>> | undefined,
): Readonly<Partial<Record<TaskClass, TokenCount>>> {
  const taskClasses = Object.keys(TASK_CLASS) as TaskClass[];
  if (raw === undefined) return {};
  return taskClasses.reduce<Partial<Record<TaskClass, TokenCount>>>((acc, k) => {
    const v = raw[k];
    if (typeof v === "number") return { ...acc, [k]: toTokenCount(v) };
    return acc;
  }, {});
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (e) {
    const message = e instanceof SyntaxError ? e.message : String(e);
    throw new ConfigError(`Invalid JSON in aic.config.json: ${message}`);
  }
}

function parseAndValidate(content: string): AicConfigParsed {
  const data = parseJson(content);
  const parsed = AicConfigSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    throw new ConfigError(`Invalid aic.config.json: ${msg}`);
  }
  return parsed.data;
}

function buildResolvedConfig(parsed: AicConfigParsed): ResolvedConfig {
  const maxTokens = toTokenCount(parsed.contextBudget?.maxTokens ?? 8000);
  const perTaskClass = buildPerTaskClass(parsed.contextBudget?.perTaskClass);
  const maxFiles = parsed.contextSelector?.heuristic?.maxFiles ?? 20;
  const guardAllowPatterns = parsed.guard?.allowPatterns ?? [];
  return {
    contextBudget: { maxTokens, perTaskClass },
    heuristic: { maxFiles },
    ...(parsed.model !== undefined && {
      model: parsed.model.id !== undefined ? { id: parsed.model.id } : {},
    }),
    enabled: parsed.enabled ?? true,
    guardAllowPatterns,
  };
}

export class LoadConfigFromFile implements ConfigLoader {
  load(projectRoot: AbsolutePath, configPath: FilePath | null): LoadConfigResult {
    const filePath = resolveFilePath(projectRoot, configPath);
    if (!fs.existsSync(filePath)) {
      return { config: defaultResolvedConfig() };
    }
    const fileContent = fs.readFileSync(filePath, "utf8");
    const parsed = parseAndValidate(fileContent);
    const config = buildResolvedConfig(parsed);
    return { config, rawJson: fileContent };
  }
}

export function createBudgetConfigFromResolved(config: ResolvedConfig): BudgetConfig {
  return {
    getMaxTokens(): TokenCount {
      return config.contextBudget.maxTokens;
    },
    getBudgetForTaskClass(taskClass: TaskClass): TokenCount | null {
      return config.contextBudget.perTaskClass[taskClass] ?? null;
    },
  };
}

const DEFAULT_CONFIG_JSON = "{}";

export function applyConfigResult(
  result: LoadConfigResult,
  configStore: ConfigStore,
  stringHasher: StringHasher,
): {
  budgetConfig: BudgetConfig;
  heuristicConfig: HeuristicSelectorConfig;
  modelId: string | null;
  guardAllowPatterns: readonly GlobPattern[];
} {
  const content = result.rawJson ?? DEFAULT_CONFIG_JSON;
  configStore.writeSnapshot(stringHasher.hash(content), content);
  const guardAllowPatterns = result.config.guardAllowPatterns.map((s) =>
    toGlobPattern(s),
  );
  return {
    budgetConfig: createBudgetConfigFromResolved(result.config),
    heuristicConfig: { maxFiles: result.config.heuristic.maxFiles },
    modelId: result.config.model?.id ?? null,
    guardAllowPatterns,
  };
}
