// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025 AIC Contributors

import type { SpecificationCompiler } from "@jatbas/aic-core/core/interfaces/specification-compiler.interface.js";
import type { ContentTransformerPipeline } from "@jatbas/aic-core/core/interfaces/content-transformer-pipeline.interface.js";
import type { SummarisationLadder } from "@jatbas/aic-core/core/interfaces/summarisation-ladder.interface.js";
import type { LanguageProvider } from "@jatbas/aic-core/core/interfaces/language-provider.interface.js";
import type {
  SpecCodeBlock,
  SpecCompilationResult,
  SpecInclusionTier,
  SpecificationInput,
  SpecProseBlock,
  SpecTypeRef,
  SpecTypeUsage,
} from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import { SPEC_USAGE_TO_INITIAL_TIER } from "@jatbas/aic-core/core/types/specification-compilation.types.js";
import type { TokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toTokenCount } from "@jatbas/aic-core/core/types/units.js";
import { toPercentage, toRelevanceScore } from "@jatbas/aic-core/core/types/scores.js";
import type { SelectedFile } from "@jatbas/aic-core/core/types/selected-file.js";
import type { TransformContext } from "@jatbas/aic-core/core/types/transform-types.js";
import { INCLUSION_TIER } from "@jatbas/aic-core/core/types/enums.js";
import {
  deduplicateImportsInText,
  splitLeadingImportsAndBody,
} from "./import-merge-dedup-text.js";
import { renderInclusionTierText } from "./inclusion-tier-rendered-text.js";

const SECTION_GAP = "\n\n";
const SIGNATURE_LINE_RE = /(?:function|class|def|pub\s+fn)\s+\w+/g;
const EXPORT_FACTORY_DISCOVERY_RE = /^\s*export\s+(?:function\s+(\w+)|const\s+(\w+))/gm;

const WARN_TRUNCATION = "AIC specification compiler: output truncated to satisfy budget.";

const SPEC_LANG_SUFFIXES: readonly {
  readonly ends: (p: string) => boolean;
  readonly language: string;
}[] = [
  { ends: (p) => p.endsWith(".ts") || p.endsWith(".tsx"), language: "ts" },
  { ends: (p) => p.endsWith(".md"), language: "md" },
];

function specLanguageFromPath(path: string): string {
  const hit = SPEC_LANG_SUFFIXES.find((r) => r.ends(path));
  return hit?.language ?? "txt";
}

type VerbatimPathMeta = ReadonlyMap<
  string,
  { readonly importLines: readonly string[]; readonly body: string }
>;

function buildVerbatimPathMetaAndRows(
  verbatimRefs: readonly SpecTypeRef[],
  tokenCounter: (text: string) => TokenCount,
): {
  readonly verbatimPathMeta: VerbatimPathMeta;
  readonly verbatimRows: readonly SelectedFile[];
} {
  const verbatimPathMeta = new Map<
    string,
    { readonly importLines: readonly string[]; readonly body: string }
  >();
  const verbatimRows: readonly SelectedFile[] = verbatimRefs.map((ref) => {
    const split = splitLeadingImportsAndBody(ref.content);
    verbatimPathMeta.set(String(ref.path), {
      importLines: split.importLines,
      body: split.body,
    });
    return {
      path: ref.path,
      language: specLanguageFromPath(String(ref.path)),
      estimatedTokens: tokenCounter(split.body),
      relevanceScore: toRelevanceScore(1),
      tier: INCLUSION_TIER.L0,
      resolvedContent: split.body,
    };
  });
  return { verbatimPathMeta, verbatimRows };
}

function computeVerbatimBatchBudget(
  budget: TokenCount,
  verbatimRefs: readonly SpecTypeRef[],
): TokenCount {
  const sumVerbatimInputTokens = verbatimRefs.reduce(
    (s, r) => s + Number(r.estimatedTokens),
    0,
  );
  return toTokenCount(Math.min(Math.floor(Number(budget) * 0.2), sumVerbatimInputTokens));
}

function buildPathToRenderedMap(
  compressOut: readonly SelectedFile[],
  languageProviders: readonly LanguageProvider[],
): ReadonlyMap<string, string> {
  return new Map(
    compressOut.map((out) => {
      const key = String(out.path);
      return [
        key,
        renderInclusionTierText(
          key,
          out.tier,
          out.resolvedContent ?? "",
          languageProviders,
        ),
      ] as const;
    }),
  );
}

function applyRenderedBodiesToVerbatimTypes(
  types: readonly SpecTypeRef[],
  verbatimPathMeta: VerbatimPathMeta,
  pathToRendered: ReadonlyMap<string, string>,
  tokenCounter: (text: string) => TokenCount,
): readonly SpecTypeRef[] {
  return types.map((ref) => {
    if (SPEC_USAGE_TO_INITIAL_TIER[ref.usage] !== "verbatim") {
      return ref;
    }
    const meta = verbatimPathMeta.get(String(ref.path));
    if (meta === undefined) {
      return ref;
    }
    const renderedBody =
      pathToRendered.get(String(ref.path)) ?? normalizeNewlines(meta.body);
    const fullContent =
      meta.importLines.length > 0
        ? `${meta.importLines.join("\n")}\n${renderedBody}`
        : renderedBody;
    return {
      ...ref,
      content: fullContent,
      estimatedTokens: tokenCounter(fullContent),
    };
  });
}

async function verbatimAdjustedSpecificationInput(
  tokenCounter: (text: string) => TokenCount,
  contentTransformerPipeline: ContentTransformerPipeline,
  summarisationLadder: SummarisationLadder,
  languageProviders: readonly LanguageProvider[],
  input: SpecificationInput,
  budget: TokenCount,
): Promise<SpecificationInput> {
  const verbatimRefs = input.types.filter(
    (t) => SPEC_USAGE_TO_INITIAL_TIER[t.usage] === "verbatim",
  );
  if (verbatimRefs.length === 0) {
    return input;
  }
  const { verbatimPathMeta, verbatimRows } = buildVerbatimPathMetaAndRows(
    verbatimRefs,
    tokenCounter,
  );
  const verbatimBatchBudget = computeVerbatimBatchBudget(budget, verbatimRefs);
  const specCompileTransformContext: TransformContext = {
    directTargetPaths: [],
    rawMode: false,
  };
  const transformResult = await contentTransformerPipeline.transform(
    verbatimRows,
    specCompileTransformContext,
  );
  const compressOut = await summarisationLadder.compress(
    transformResult.files,
    verbatimBatchBudget,
    undefined,
  );
  const pathToRendered = buildPathToRenderedMap(compressOut, languageProviders);
  const adjustedTypes = applyRenderedBodiesToVerbatimTypes(
    input.types,
    verbatimPathMeta,
    pathToRendered,
    tokenCounter,
  );
  return { ...input, types: adjustedTypes };
}

function typeKey(ref: SpecTypeRef): string {
  return `${ref.name}\u0000${ref.path}`;
}

function sortTypes(types: readonly SpecTypeRef[]): readonly SpecTypeRef[] {
  return [...types].toSorted((a, b) => {
    const byPath = String(a.path).localeCompare(String(b.path));
    return byPath !== 0 ? byPath : a.name.localeCompare(b.name);
  });
}

function sortByLabel<T extends { readonly label: string }>(
  rows: readonly T[],
): readonly T[] {
  return [...rows].toSorted((a, b) => a.label.localeCompare(b.label));
}

function normalizeNewlines(body: string): string {
  return body.replace(/\n{3,}/g, "\n\n");
}

function verbatimBodyNormalized(content: string): string {
  const { body } = splitLeadingImportsAndBody(content);
  return normalizeNewlines(body);
}

function signatureTierBody(content: string): string {
  const matches = content.match(SIGNATURE_LINE_RE) ?? [];
  const countLine = String(matches.length);
  const joined = matches.join("\n");
  return joined.length === 0 ? countLine : `${countLine}\n${joined}`;
}

function pathOnlyTierBody(content: string): string {
  const ids = [...content.matchAll(EXPORT_FACTORY_DISCOVERY_RE)].reduce<
    readonly string[]
  >((acc, m) => {
    const g1 = m[1];
    const g2 = m[2];
    const id = g1 ?? g2;
    return id === undefined ? acc : [...acc, id];
  }, []);
  return ids.join(", ");
}

const TIER_BODY: Readonly<Record<SpecInclusionTier, (ref: SpecTypeRef) => string>> = {
  verbatim: (ref) => verbatimBodyNormalized(ref.content),
  "signature-path": (ref) => signatureTierBody(ref.content),
  "path-only": (ref) => pathOnlyTierBody(ref.content),
};

function typeFragment(ref: SpecTypeRef, tier: SpecInclusionTier): string {
  const body = TIER_BODY[tier](ref);
  return `${ref.name}\n${ref.path}\n${body}`;
}

function mergedVerbatimImports(
  sortedTypes: readonly SpecTypeRef[],
  tiers: Readonly<Record<string, SpecInclusionTier>>,
): string {
  const chunks = sortedTypes
    .filter((t) => tiers[typeKey(t)] === "verbatim")
    .map((t) => splitLeadingImportsAndBody(t.content).importLines.join("\n"))
    .filter((s) => s.length > 0);
  if (chunks.length === 0) return "";
  return deduplicateImportsInText(chunks.join("\n"));
}

function assembleCompiledSpec(
  sortedTypes: readonly SpecTypeRef[],
  tiers: Readonly<Record<string, SpecInclusionTier>>,
  codeBlocks: readonly SpecCodeBlock[],
  prose: readonly SpecProseBlock[],
): string {
  const importBlock = mergedVerbatimImports(sortedTypes, tiers);
  const typeSections = sortedTypes.map((t) => {
    const tier = tiers[typeKey(t)];
    const resolved = tier ?? SPEC_USAGE_TO_INITIAL_TIER[t.usage];
    const body = TIER_BODY[resolved](t);
    return `${t.name}\n${t.path}\n${body}`;
  });
  const codeSections = codeBlocks.map((b) => `${b.label}\n${b.content}`);
  const proseSections = prose.map((p) => `${p.label}\n${p.content}`);
  const head = importBlock.length > 0 ? [importBlock] : [];
  return [...head, ...typeSections, ...codeSections, ...proseSections].join(SECTION_GAP);
}

function buildTypeTiersMeta(
  sortedTypes: readonly SpecTypeRef[],
  tiers: Readonly<Record<string, SpecInclusionTier>>,
): Readonly<Record<string, SpecInclusionTier>> {
  return sortedTypes.reduce<Record<string, SpecInclusionTier>>((acc, t) => {
    const k = typeKey(t);
    const tier = tiers[k];
    return tier === undefined ? acc : { ...acc, [k]: tier };
  }, {});
}

function sumEstimatedTokens(input: SpecificationInput): TokenCount {
  const n =
    input.types.reduce((s, t) => s + t.estimatedTokens, 0) +
    input.codeBlocks.reduce((s, b) => s + b.estimatedTokens, 0) +
    input.prose.reduce((s, p) => s + p.estimatedTokens, 0);
  return toTokenCount(n);
}

function initialTiers(
  sortedTypes: readonly SpecTypeRef[],
): Record<string, SpecInclusionTier> {
  return sortedTypes.reduce<Record<string, SpecInclusionTier>>((acc, t) => {
    const tier = SPEC_USAGE_TO_INITIAL_TIER[t.usage];
    return { ...acc, [typeKey(t)]: tier };
  }, {});
}

const VERBATIM_USAGE_RANK: Readonly<Record<SpecTypeUsage, number>> = {
  constructs: 0,
  "calls-methods": 1,
  implements: 2,
  "passes-through": 99,
  "names-only": 99,
};

function compareTokenCount(a: TokenCount, b: TokenCount): number {
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function pickVerbatimDemotion(
  sortedTypes: readonly SpecTypeRef[],
  tiers: Readonly<Record<string, SpecInclusionTier>>,
  measure: (s: string) => TokenCount,
): SpecTypeRef | null {
  const pool = sortedTypes.filter((t) => tiers[typeKey(t)] === "verbatim");
  if (pool.length === 0) return null;
  const scored = pool.map((t) => ({
    t,
    usageRank: VERBATIM_USAGE_RANK[t.usage],
    frag: measure(typeFragment(t, "verbatim")),
    path: String(t.path),
    name: t.name,
  }));
  const minUsage = Math.min(...scored.map((s) => s.usageRank));
  const tiered = scored.filter((s) => s.usageRank === minUsage);
  const first = tiered[0];
  if (first === undefined) return null;
  const chosen = tiered.reduce((best, cur) => {
    const ct = compareTokenCount(cur.frag, best.frag);
    if (ct > 0) return cur;
    if (ct < 0) return best;
    const cp = cur.path.localeCompare(best.path);
    if (cp < 0) return cur;
    if (cp > 0) return best;
    return cur.name.localeCompare(best.name) < 0 ? cur : best;
  }, first);
  return chosen.t;
}

function pickSignatureDemotion(
  sortedTypes: readonly SpecTypeRef[],
  tiers: Readonly<Record<string, SpecInclusionTier>>,
  measure: (s: string) => TokenCount,
): SpecTypeRef | null {
  const pool = sortedTypes.filter((t) => tiers[typeKey(t)] === "signature-path");
  if (pool.length === 0) return null;
  const scored = pool.map((t) => ({
    t,
    frag: measure(typeFragment(t, "signature-path")),
    path: String(t.path),
    name: t.name,
  }));
  const first = scored[0];
  if (first === undefined) return null;
  const chosen = scored.reduce((best, cur) => {
    const ct = compareTokenCount(cur.frag, best.frag);
    if (ct > 0) return cur;
    if (ct < 0) return best;
    const cp = cur.path.localeCompare(best.path);
    if (cp < 0) return cur;
    if (cp > 0) return best;
    return cur.name.localeCompare(best.name) < 0 ? cur : best;
  }, first);
  return chosen.t;
}

function pickCodeRemovalIndex(blocks: readonly SpecCodeBlock[]): number {
  return blocks.reduce((bestIdx, _b, i, arr) => {
    const cur = arr[i];
    const best = arr[bestIdx];
    if (cur === undefined || best === undefined) return bestIdx;
    const cmp = compareTokenCount(cur.estimatedTokens, best.estimatedTokens);
    if (cmp > 0) return i;
    if (cmp < 0) return bestIdx;
    return cur.label.localeCompare(best.label) < 0 ? i : bestIdx;
  }, 0);
}

function pickProseRemovalIndex(blocks: readonly SpecProseBlock[]): number {
  return blocks.reduce((bestIdx, _b, i, arr) => {
    const cur = arr[i];
    const best = arr[bestIdx];
    if (cur === undefined || best === undefined) return bestIdx;
    const cmp = compareTokenCount(cur.estimatedTokens, best.estimatedTokens);
    if (cmp > 0) return i;
    if (cmp < 0) return bestIdx;
    return cur.label.localeCompare(best.label) < 0 ? i : bestIdx;
  }, 0);
}

function demoteTier(tier: SpecInclusionTier): SpecInclusionTier | null {
  if (tier === "verbatim") return "signature-path";
  if (tier === "signature-path") return "path-only";
  return null;
}

function allTypesPathOnly(
  sortedTypes: readonly SpecTypeRef[],
  tiers: Readonly<Record<string, SpecInclusionTier>>,
): boolean {
  return sortedTypes.every((t) => tiers[typeKey(t)] === "path-only");
}

type BudgetState = {
  readonly tiers: Record<string, SpecInclusionTier>;
  readonly code: readonly SpecCodeBlock[];
  readonly prose: readonly SpecProseBlock[];
};

function applyBudgetStep(
  sortedTypes: readonly SpecTypeRef[],
  s: BudgetState,
  measure: (s: string) => TokenCount,
): BudgetState | null {
  const v = pickVerbatimDemotion(sortedTypes, s.tiers, measure);
  if (v !== null) {
    const k = typeKey(v);
    const nextTier = demoteTier(s.tiers[k] ?? "path-only");
    return nextTier === null ? null : { ...s, tiers: { ...s.tiers, [k]: nextTier } };
  }
  const sig = pickSignatureDemotion(sortedTypes, s.tiers, measure);
  if (sig !== null) {
    const k = typeKey(sig);
    const nextTier = demoteTier(s.tiers[k] ?? "path-only");
    return nextTier === null ? null : { ...s, tiers: { ...s.tiers, [k]: nextTier } };
  }
  if (s.code.length > 0) {
    const idx = pickCodeRemovalIndex(s.code);
    return {
      ...s,
      code: [...s.code.slice(0, idx), ...s.code.slice(idx + 1)],
    };
  }
  if (s.prose.length > 0) {
    const idx = pickProseRemovalIndex(s.prose);
    return {
      ...s,
      prose: [...s.prose.slice(0, idx), ...s.prose.slice(idx + 1)],
    };
  }
  return null;
}

function convergeBudgetState(
  sortedTypes: readonly SpecTypeRef[],
  budget: TokenCount,
  measure: (s: string) => TokenCount,
  s: BudgetState,
): BudgetState {
  const compiled = assembleCompiledSpec(sortedTypes, s.tiers, s.code, s.prose);
  if (measure(compiled) <= budget) return s;
  const next = applyBudgetStep(sortedTypes, s, measure);
  if (next === null) return s;
  return convergeBudgetState(sortedTypes, budget, measure, next);
}

function runBudgetLoop(
  input: SpecificationInput,
  budget: TokenCount,
  measure: (s: string) => TokenCount,
): { readonly compiled: string; readonly tiers: Record<string, SpecInclusionTier> } {
  const sortedTypes = sortTypes(input.types);
  const initial: BudgetState = {
    tiers: initialTiers(sortedTypes),
    code: sortByLabel(input.codeBlocks),
    prose: sortByLabel(input.prose),
  };
  const final = convergeBudgetState(sortedTypes, budget, measure, initial);
  const base = assembleCompiledSpec(sortedTypes, final.tiers, final.code, final.prose);
  const needsWarn =
    allTypesPathOnly(sortedTypes, final.tiers) &&
    final.code.length === 0 &&
    final.prose.length === 0 &&
    measure(base) > budget;
  const compiled = needsWarn ? `${base}\n${WARN_TRUNCATION}` : base;
  return { compiled, tiers: final.tiers };
}

export class SpecificationCompilerImpl implements SpecificationCompiler {
  constructor(
    private readonly tokenCounter: (text: string) => TokenCount,
    private readonly contentTransformerPipeline: ContentTransformerPipeline,
    private readonly summarisationLadder: SummarisationLadder,
    private readonly languageProviders: readonly LanguageProvider[],
  ) {}

  async compile(
    input: SpecificationInput,
    budget: TokenCount,
  ): Promise<SpecCompilationResult> {
    const adjustedInput = await verbatimAdjustedSpecificationInput(
      this.tokenCounter,
      this.contentTransformerPipeline,
      this.summarisationLadder,
      this.languageProviders,
      input,
      budget,
    );
    const totalTokensRaw = sumEstimatedTokens(input);
    const sortedTypes = sortTypes(input.types);
    const { compiled: compiledSpec, tiers } = runBudgetLoop(
      adjustedInput,
      budget,
      this.tokenCounter,
    );
    const totalTokensCompiled = this.tokenCounter(compiledSpec);
    const rawNum = totalTokensRaw;
    const reductionPct =
      rawNum > 0
        ? toPercentage((rawNum - totalTokensCompiled) / rawNum)
        : toPercentage(0);
    const transformTokensSaved = toTokenCount(Math.max(0, rawNum - totalTokensCompiled));
    return {
      compiledSpec,
      meta: {
        totalTokensRaw,
        totalTokensCompiled,
        reductionPct,
        typeTiers: buildTypeTiersMeta(sortedTypes, tiers),
        transformTokensSaved,
      },
    };
  }
}
