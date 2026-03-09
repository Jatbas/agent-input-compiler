// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { RulePack } from "@jatbas/aic-core/core/types/rule-pack.js";
import type { TaskClass } from "@jatbas/aic-core/core/types/enums.js";

export type ReadProjectFile = (relativePath: string) => string | null;

export function parseRulePackFromJson(raw: string): RulePack | null {
  const data = JSON.parse(raw) as unknown;
  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray((data as { constraints?: unknown }).constraints) ||
    !Array.isArray((data as { includePatterns?: unknown }).includePatterns) ||
    !Array.isArray((data as { excludePatterns?: unknown }).excludePatterns)
  ) {
    return null;
  }
  const obj = data as {
    constraints: unknown[];
    includePatterns: unknown[];
    excludePatterns: unknown[];
  };
  return {
    constraints: obj.constraints as string[],
    includePatterns: obj.includePatterns as RulePack["includePatterns"],
    excludePatterns: obj.excludePatterns as RulePack["excludePatterns"],
  };
}

export function loadRulePackFromPath(
  getContent: ReadProjectFile,
  taskClass: TaskClass,
): RulePack | null {
  const relativePath = `aic-rules/${taskClass}.json`;
  const raw = getContent(relativePath);
  return raw === null ? null : parseRulePackFromJson(raw);
}
