// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { GlobPattern } from "@jatbas/aic-core/core/types/paths.js";
import type {
  ContextResult,
  ContextSelector,
  RelativePath,
  RepoMap,
  RulePack,
  TaskClassification,
  TokenCount,
  ToolOutput,
} from "./context-selector-shared-types.js";
import { toGlobPattern } from "@jatbas/aic-core/core/types/paths.js";

const GLOB_REGEX_METACHARS = /[\\^$.*+?()|[\]{}]/g;

export function escapeRelativePathToGlobPattern(path: RelativePath): string {
  return path.replace(GLOB_REGEX_METACHARS, "\\$&");
}

export function dedupeRelatedPathsInOrder(
  toolOutputs: readonly ToolOutput[],
): readonly RelativePath[] {
  const seen = new Set<string>();
  return toolOutputs.reduce<readonly RelativePath[]>((acc, output) => {
    const batch = (output.relatedFiles ?? []).reduce<readonly RelativePath[]>(
      (inner, p) => {
        if (seen.has(p)) return inner;
        seen.add(p);
        return [...inner, p];
      },
      [],
    );
    return [...acc, ...batch];
  }, []);
}

export function canonicalRelatedPathsForSelectionCache(
  toolOutputs: readonly ToolOutput[] | undefined,
): string {
  const ordered = dedupeRelatedPathsInOrder(toolOutputs ?? []);
  if (ordered.length === 0) {
    return "";
  }
  return [...ordered].toSorted((a, b) => a.localeCompare(b)).join("\0");
}

export function mergeRulePackWithRelatedBoosts(
  rulePack: RulePack,
  patterns: readonly GlobPattern[],
): RulePack {
  return {
    ...rulePack,
    heuristic: {
      boostPatterns: [...(rulePack.heuristic?.boostPatterns ?? []), ...patterns],
      penalizePatterns: [...(rulePack.heuristic?.penalizePatterns ?? [])],
    },
  };
}

function innerArgsForSelect(
  rulePack: RulePack,
  toolOutputs: readonly ToolOutput[] | undefined,
): { readonly rulePack: RulePack; readonly innerToolOutputs: undefined } {
  if (toolOutputs === undefined) {
    return { rulePack, innerToolOutputs: undefined };
  }
  const related = dedupeRelatedPathsInOrder(toolOutputs);
  if (related.length === 0) {
    return { rulePack, innerToolOutputs: undefined };
  }
  const patterns = related.map((p) => toGlobPattern(escapeRelativePathToGlobPattern(p)));
  return {
    rulePack: mergeRulePackWithRelatedBoosts(rulePack, patterns),
    innerToolOutputs: undefined,
  };
}

export class RelatedFilesBoostContextSelector {
  constructor(private readonly inner: ContextSelector) {}

  async selectContext(
    task: TaskClassification,
    repo: RepoMap,
    budget: TokenCount,
    rulePack: RulePack,
    toolOutputs?: readonly ToolOutput[],
  ): Promise<ContextResult> {
    const args = innerArgsForSelect(rulePack, toolOutputs);
    return this.inner.selectContext(
      task,
      repo,
      budget,
      args.rulePack,
      args.innerToolOutputs,
    );
  }
}
