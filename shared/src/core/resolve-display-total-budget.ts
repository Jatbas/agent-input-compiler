// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import { MODEL_CONTEXT_WINDOWS } from "@jatbas/aic-core/data/model-context-windows.js";
import {
  CONTEXT_WINDOW_DEFAULT,
  RESERVED_RESPONSE_DEFAULT,
  TEMPLATE_OVERHEAD_DEFAULT,
} from "@jatbas/aic-core/pipeline/budget-allocator.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";

const MODEL_EFFECTIVE_FACTOR = 0.65;

export function normalizeForLookup(id: string): string {
  const withoutVendor = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  const base = withoutVendor.toLowerCase().replace(/-\d{8}$/, "");
  const m = /^(claude)-(\d+\.\d+)-([a-z]+)/.exec(base);
  if (m !== null) return `${m[1]}-${m[3]}-${m[2]}`;
  return base;
}

export function lookupContextWindow(normalizedId: string): number | undefined {
  return lookupContextWindowWithMatchedId(normalizedId).window;
}

function lookupContextWindowWithMatchedId(normalizedId: string): {
  readonly window: number | undefined;
  readonly matchedId: string | null;
} {
  const walk = (candidate: string): number | undefined => {
    if (candidate.length === 0) return undefined;
    const found = MODEL_CONTEXT_WINDOWS[candidate];
    if (found !== undefined) return found;
    const lastDash = candidate.lastIndexOf("-");
    if (lastDash === -1) return undefined;
    return walk(candidate.slice(0, lastDash));
  };
  const candidateWalk = (candidate: string): string | null => {
    if (candidate.length === 0) return null;
    const found = MODEL_CONTEXT_WINDOWS[candidate];
    if (found !== undefined) return candidate;
    const lastDash = candidate.lastIndexOf("-");
    if (lastDash === -1) return null;
    return candidateWalk(candidate.slice(0, lastDash));
  };
  const matchedId = candidateWalk(normalizedId);
  if (matchedId === null) return { window: undefined, matchedId: null };
  return { window: walk(matchedId), matchedId };
}

export function resolveModelDerivedEffectiveWindowTokens(
  modelId: string | null,
): TokenCount | undefined {
  const lookupId = modelId !== null ? normalizeForLookup(modelId) : null;
  const lookupResult =
    lookupId !== null
      ? lookupContextWindowWithMatchedId(lookupId)
      : { window: undefined, matchedId: null };
  const rawWindow = lookupResult.window;
  if (
    lookupId !== null &&
    lookupResult.matchedId !== null &&
    lookupResult.matchedId !== lookupId
  ) {
    process.stderr.write(
      `[aic] model context window walk-down: ${lookupId} -> ${lookupResult.matchedId}\n`,
    );
  }
  if (rawWindow === undefined && lookupId !== null && lookupId !== "auto") {
    process.stderr.write(
      `[aic] unknown model context window: ${modelId ?? ""} (normalized: ${lookupId}) — falling back to 128K\n`,
    );
  }
  if (rawWindow === undefined) return undefined;
  return toTokenCount(Math.floor(rawWindow * MODEL_EFFECTIVE_FACTOR));
}

export function resolveDisplayTotalBudgetDenominator(
  persistedTotalBudget: number | null,
  modelId: string | null,
): number {
  if (persistedTotalBudget !== null && persistedTotalBudget > 0) {
    return persistedTotalBudget;
  }
  const effectiveWindow = resolveModelDerivedEffectiveWindowTokens(modelId);
  if (effectiveWindow !== undefined) {
    return (
      Number(effectiveWindow) - RESERVED_RESPONSE_DEFAULT - TEMPLATE_OVERHEAD_DEFAULT
    );
  }
  return CONTEXT_WINDOW_DEFAULT - RESERVED_RESPONSE_DEFAULT - TEMPLATE_OVERHEAD_DEFAULT;
}

export function resolveBudgetUtilizationPercent(
  tokensCompiled: number,
  budgetDenominator: number,
): number | null {
  if (budgetDenominator <= 0) return null;
  return (tokensCompiled / budgetDenominator) * 100;
}
