// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { describe, it, expect } from "vitest";
import { AicError } from "#core/errors/aic-error.js";
import { RulePackResolver } from "../rule-pack-resolver.js";
import type { RulePackProvider } from "#core/interfaces/rule-pack-provider.interface.js";
import type { TaskClassification } from "#core/types/task-classification.js";
import type { RulePack } from "#core/types/rule-pack.js";
import type { AbsolutePath } from "#core/types/paths.js";
import { TASK_CLASS } from "#core/types/enums.js";
import { toAbsolutePath } from "#core/types/paths.js";
import { toGlobPattern } from "#core/types/paths.js";
import { toConfidence } from "#core/types/scores.js";
import { toTokenCount } from "#core/types/units.js";

function makeProvider(packs: Record<string, RulePack>): RulePackProvider {
  return {
    getBuiltInPack(name: string): RulePack {
      const pack = packs[name];
      if (pack === undefined) throw new AicError(`Unknown pack: ${name}`, "TEST_SETUP");
      return pack;
    },
    getProjectPack(_projectRoot: AbsolutePath, _taskClass: string): RulePack | null {
      return packs["project"] ?? null;
    },
  };
}

describe("RulePackResolver", () => {
  it("loads and merges built-in packs correctly", () => {
    const defaultPack: RulePack = {
      constraints: ["default-constraint"],
      includePatterns: [toGlobPattern("src/**")],
      excludePatterns: [],
    };
    const refactorPack: RulePack = {
      constraints: ["refactor-constraint"],
      includePatterns: [toGlobPattern("lib/**")],
      excludePatterns: [],
    };
    const provider = makeProvider({
      "built-in:default": defaultPack,
      "built-in:refactor": refactorPack,
    });
    const resolver = new RulePackResolver(provider);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.REFACTOR,
      confidence: toConfidence(0.8),
      matchedKeywords: ["refactor"],
      subjectTokens: [],
    };
    const result = resolver.resolve(task, toAbsolutePath("/proj"));
    expect(result.constraints).toEqual(["default-constraint", "refactor-constraint"]);
    expect(result.includePatterns).toEqual([
      toGlobPattern("src/**"),
      toGlobPattern("lib/**"),
    ]);
  });

  it("overrides built-ins when project pack is present (arrays merged, scalars overridden)", () => {
    const defaultPack: RulePack = {
      constraints: ["default"],
      includePatterns: [],
      excludePatterns: [],
      budgetOverride: toTokenCount(1000),
    };
    const projectPack: RulePack = {
      constraints: ["project"],
      includePatterns: [],
      excludePatterns: [],
      budgetOverride: toTokenCount(2000),
    };
    const provider = makeProvider({
      "built-in:default": defaultPack,
      "built-in:feature": { constraints: [], includePatterns: [], excludePatterns: [] },
      project: projectPack,
    });
    const resolver = new RulePackResolver(provider);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.FEATURE,
      confidence: toConfidence(1),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const result = resolver.resolve(task, toAbsolutePath("/proj"));
    expect(result.constraints).toEqual(["default", "project"]);
    expect(result.budgetOverride).toBe(2000);
  });

  it("falls back to built-ins only when project pack is missing", () => {
    const defaultPack: RulePack = {
      constraints: ["only-default"],
      includePatterns: [],
      excludePatterns: [],
    };
    const provider = makeProvider({
      "built-in:default": defaultPack,
      "built-in:bugfix": { constraints: [], includePatterns: [], excludePatterns: [] },
    });
    const resolver = new RulePackResolver(provider);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.BUGFIX,
      confidence: toConfidence(0.5),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const result = resolver.resolve(task, toAbsolutePath("/proj"));
    expect(result.constraints).toEqual(["only-default"]);
  });

  it("deduplicates array entries when merging", () => {
    const defaultPack: RulePack = {
      constraints: ["a", "b"],
      includePatterns: [toGlobPattern("src/**")],
      excludePatterns: [],
    };
    const overlayPack: RulePack = {
      constraints: ["b", "c"],
      includePatterns: [toGlobPattern("src/**")],
      excludePatterns: [],
    };
    const provider = makeProvider({
      "built-in:default": defaultPack,
      "built-in:docs": overlayPack,
    });
    const resolver = new RulePackResolver(provider);
    const task: TaskClassification = {
      taskClass: TASK_CLASS.DOCS,
      confidence: toConfidence(0),
      matchedKeywords: [],
      subjectTokens: [],
    };
    const result = resolver.resolve(task, toAbsolutePath("/proj"));
    expect(result.constraints).toEqual(["a", "b", "c"]);
    expect(result.includePatterns).toEqual([toGlobPattern("src/**")]);
  });
});
