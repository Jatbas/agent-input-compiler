import type { SummarisationLadder as ISummarisationLadder } from "#core/interfaces/summarisation-ladder.interface.js";
import type { LanguageProvider } from "#core/interfaces/language-provider.interface.js";
import type { FileContentReader } from "#core/interfaces/file-content-reader.interface.js";
import type { SelectedFile } from "#core/types/selected-file.js";
import type { TokenCount } from "#core/types/units.js";
import type { InclusionTier } from "#core/types/enums.js";
import type { RelativePath } from "#core/types/paths.js";
import { INCLUSION_TIER } from "#core/types/enums.js";

type TierTextFn = (
  content: string,
  provider: LanguageProvider | undefined,
  filePath: string,
) => string;

const TIER_TEXT: Readonly<Record<InclusionTier, TierTextFn>> = {
  [INCLUSION_TIER.L0]: (content) => content,
  [INCLUSION_TIER.L1]: (content, provider, filePath) => {
    if (provider === undefined) {
      return TIER_TEXT[INCLUSION_TIER.L2](content, provider, filePath);
    }
    const chunks = provider.extractSignaturesWithDocs(content);
    return chunks.map((c) => c.content).join("\n");
  },
  [INCLUSION_TIER.L2]: (content, provider) => {
    if (provider !== undefined) {
      const chunks = provider.extractSignaturesOnly(content);
      return chunks.map((c) => c.content).join("\n");
    }
    const matches = content.match(/(?:function|class|def|pub\s+fn)\s+\w+/g) ?? [];
    return matches.join("\n");
  },
  [INCLUSION_TIER.L3]: (content, provider, filePath) => {
    if (provider !== undefined) {
      const names = provider.extractNames(content);
      return filePath + "\n" + names.map((n) => n.name).join(", ");
    }
    return filePath + "\n";
  },
};

const TIER_ORDER: readonly InclusionTier[] = [
  INCLUSION_TIER.L0,
  INCLUSION_TIER.L1,
  INCLUSION_TIER.L2,
  INCLUSION_TIER.L3,
];

function nextTier(tier: InclusionTier): InclusionTier | null {
  const i = TIER_ORDER.indexOf(tier);
  return i >= 0 && i < TIER_ORDER.length - 1 ? (TIER_ORDER[i + 1] ?? null) : null;
}

function getProvider(
  path: string,
  providers: readonly LanguageProvider[],
): LanguageProvider | undefined {
  const ext = path.slice(path.lastIndexOf("."));
  return providers.find((p) =>
    p.extensions.some((e) => (e as string).toLowerCase() === ext.toLowerCase()),
  );
}

export class SummarisationLadder implements ISummarisationLadder {
  constructor(
    private readonly languageProviders: readonly LanguageProvider[],
    private readonly tokenCounter: (text: string) => TokenCount,
    private readonly fileContentReader: FileContentReader,
  ) {}

  compress(files: readonly SelectedFile[], budget: TokenCount): readonly SelectedFile[] {
    const budgetNum = budget as number;
    const initialTotal = sumTokens(files);
    if (initialTotal <= budgetNum) return files;

    const sorted = files.toSorted(byRelevanceThenSize);
    const tokenAtTier = (file: SelectedFile, tier: InclusionTier): TokenCount => {
      const filePath = file.path as RelativePath;
      const content = this.fileContentReader.getContent(filePath);
      const provider = getProvider(filePath as string, this.languageProviders);
      const text = TIER_TEXT[tier](content, provider, file.path as string);
      return this.tokenCounter(text);
    };

    const demoted = demoteLoop(
      sorted.map((f) => ({ ...f })),
      budgetNum,
      tokenAtTier,
      sorted.length * TIER_ORDER.length,
    );

    if (sumTokens(demoted) <= budgetNum) return demoted;

    return dropToFit(demoted.toSorted(byRelevanceThenSize), budgetNum);
  }
}

function sumTokens(files: readonly SelectedFile[]): number {
  return files.reduce((s, f) => s + (f.estimatedTokens as number), 0);
}

function byRelevanceThenSize(a: SelectedFile, b: SelectedFile): number {
  const scoreA = a.relevanceScore as number;
  const scoreB = b.relevanceScore as number;
  if (scoreA !== scoreB) return scoreA - scoreB;
  const tokA = a.estimatedTokens as number;
  const tokB = b.estimatedTokens as number;
  if (tokA !== tokB) return tokB - tokA;
  return (a.path as string).localeCompare(b.path as string);
}

function findLowestIdx(files: readonly SelectedFile[]): number {
  return files.reduce((best, _f, i) => {
    const score =
      (files[i]!.relevanceScore as number) - (files[best]!.relevanceScore as number);
    if (score !== 0) return score < 0 ? i : best;
    const tok =
      (files[best]!.estimatedTokens as number) - (files[i]!.estimatedTokens as number);
    if (tok !== 0) return tok > 0 ? best : i;
    return (files[i]!.path as string).localeCompare(files[best]!.path as string) < 0
      ? i
      : best;
  }, 0);
}

function demoteLoop(
  files: readonly SelectedFile[],
  budgetNum: number,
  tokenAtTier: (file: SelectedFile, tier: InclusionTier) => TokenCount,
  remainingRounds: number,
): readonly SelectedFile[] {
  if (remainingRounds <= 0) return files;
  if (sumTokens(files) <= budgetNum) return files;
  const lowestIdx = findLowestIdx(files);
  const file = files[lowestIdx]!;
  const next = nextTier(file.tier);
  if (next === null) return files;
  const newTokens = tokenAtTier(file, next);
  const updated = files.map((f, i) =>
    i === lowestIdx ? { ...f, tier: next, estimatedTokens: newTokens } : f,
  );
  return demoteLoop(updated, budgetNum, tokenAtTier, remainingRounds - 1);
}

function dropToFit(
  sorted: readonly SelectedFile[],
  budgetNum: number,
): readonly SelectedFile[] {
  const prefixSums = sorted.reduce<readonly number[]>((sums, f) => {
    const prev = sums.length > 0 ? sums[sums.length - 1]! : 0;
    return [...sums, prev + (f.estimatedTokens as number)];
  }, []);
  const keepCount = prefixSums.filter((s) => s <= budgetNum).length;
  return sorted.slice(0, keepCount);
}
